import os
import tempfile
from datetime import datetime, timezone
import queue
import threading
from typing import Any

import jwt
from flask import Flask, jsonify, request, g
from flask_cors import CORS
from flask import Response
from werkzeug.security import check_password_hash, generate_password_hash

from db import get_conn
from import_excel import importar_excel_para_supabase


try:
    from dotenv import load_dotenv  # type: ignore
except Exception:  # pragma: no cover
    load_dotenv = None

if load_dotenv:
    load_dotenv()

app = Flask(__name__)

# CORS: em produção, defina CORS_ORIGINS com a URL do frontend no Render
origins = [o.strip() for o in (os.environ.get("CORS_ORIGINS") or "").split(",") if o.strip()]
CORS(app, resources={r"/api/*": {"origins": origins or "*"}})

# SSE: atualização em tempo real (quando alguém bipa, todos os clientes atualizam)
_sse_queues: list[queue.Queue[str]] = []
_sse_lock = threading.Lock()


def _broadcast_atualizar() -> None:
    try:
        with get_conn() as conn:
            row = conn.execute(
                "select count(*)::int as c, coalesce(sum(quantidade),0)::int as s from public.produtos_bipados"
            ).fetchone()
            payload = (
                f'{{"t":"atualizar","total_bipados":{int(row["c"] or 0)},"soma_quantidades":{int(row["s"] or 0)}}}'
                if row
                else "atualizar"
            )
    except Exception:
        payload = "atualizar"
    with _sse_lock:
        for q in list(_sse_queues):
            try:
                q.put_nowait(payload)
            except Exception:
                pass


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)

def _jwt_secret() -> str:
    s = (os.environ.get("JWT_SECRET") or "").strip()
    if not s:
        # Dev fallback (em produção, configure JWT_SECRET no Render)
        s = "dev-jwt-secret"
    return s


def _emit_token(usuario: str) -> str:
    now = int(_utcnow().timestamp())
    exp = now + int(os.environ.get("JWT_EXP_SECONDS") or 60 * 60 * 12)  # 12h
    payload = {"sub": usuario, "iat": now, "exp": exp}
    return jwt.encode(payload, _jwt_secret(), algorithm="HS256")


def _parse_bearer_token() -> str | None:
    auth = request.headers.get("Authorization") or ""
    if auth.lower().startswith("bearer "):
        return auth.split(" ", 1)[1].strip() or None
    return None


def _verify_token(token: str) -> dict[str, Any] | None:
    try:
        return jwt.decode(token, _jwt_secret(), algorithms=["HS256"])
    except Exception:
        return None


def require_auth(*, allow_query_token: bool = False):
    def deco(fn):
        def wrapped(*args, **kwargs):
            token = _parse_bearer_token()
            if not token and allow_query_token:
                token = (request.args.get("token") or "").strip() or None
            if not token:
                return jsonify({"erro": "Não autenticado"}), 401
            payload = _verify_token(token)
            if not payload or not payload.get("sub"):
                return jsonify({"erro": "Token inválido"}), 401
            g.usuario = str(payload["sub"])
            return fn(*args, **kwargs)

        wrapped.__name__ = fn.__name__
        return wrapped

    return deco


def _get_latest_dataset_id(conn) -> str | None:
    row = conn.execute(
        "select dataset_id from public.excel_datasets order by importado_em desc limit 1"
    ).fetchone()
    return str(row["dataset_id"]) if row and row.get("dataset_id") else None


def _json_key_lookup(data: dict[str, Any], contains: list[str]) -> Any:
    if not data:
        return None
    needles = [c.upper() for c in contains]
    for k in data.keys():
        ku = str(k).upper()
        if all(n in ku for n in needles):
            return data.get(k)
    return None


def _normalize_id(v: str) -> str:
    return (v or "").strip()


def _safe_str(v: Any) -> str:
    if v is None:
        return ""
    return str(v).strip()


def _compute_status(quantidade_produto: int, quantidade_bipada: int) -> tuple[str, int]:
    qp = int(quantidade_produto or 0)
    qb = int(quantidade_bipada or 0)
    falta = max(0, qp - qb)
    if qb > qp and qp > 0:
        return "EXCEDENTE", falta
    if qp > 0 and qb == qp:
        return "COMPLETO", falta
    if qb > 0 and qb < qp:
        return "PARCIAL", falta
    return "PENDENTE", falta


@app.get("/api/health")
def health():
    return jsonify({"ok": True})


@app.get("/api/eventos-stream")
@require_auth(allow_query_token=True)
def eventos_stream():
    client_queue: queue.Queue[str] = queue.Queue(maxsize=100)
    with _sse_lock:
        _sse_queues.append(client_queue)

    def gerar():
        try:
            yield "retry: 3000\n\n"
            while True:
                try:
                    msg = client_queue.get(timeout=20)
                    yield f"data: {msg}\n\n"
                except queue.Empty:
                    yield "data: ping\n\n"
        finally:
            with _sse_lock:
                if client_queue in _sse_queues:
                    _sse_queues.remove(client_queue)

    return Response(
        gerar(),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"},
    )


@app.post("/api/admin/import-excel")
@require_auth()
def admin_import_excel():
    """
    Importa o Excel e popula as tabelas excel_* no Supabase.

    Envie multipart/form-data com o campo `file`.
    """
    if "file" not in request.files:
        return jsonify({"erro": "Nenhum arquivo enviado (campo 'file')"}), 400
    f = request.files["file"]
    if not f or not f.filename:
        return jsonify({"erro": "Arquivo inválido"}), 400

    # Salvar temporário para o openpyxl
    suffix = os.path.splitext(f.filename)[1].lower() or ".xlsx"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp_path = tmp.name
        f.save(tmp_path)

    try:
        with get_conn() as conn:
            with conn.transaction():
                result = importar_excel_para_supabase(conn, tmp_path, arquivo_nome=f.filename)
        return jsonify(
            {
                "ok": True,
                "dataset_id": result.dataset_id,
                "base_rows": result.base_rows,
                "romaneio_rows": result.romaneio_rows,
                "colaboradores_rows": result.colaboradores_rows,
                "placas_rows": result.placas_rows,
            }
        )
    except Exception as e:
        return jsonify({"erro": str(e)}), 500
    finally:
        try:
            os.remove(tmp_path)
        except Exception:
            pass


@app.get("/api/base-planilha")
@require_auth()
def api_base_planilha():
    filtro_codigo = (request.args.get("codigo_barras") or "").strip()
    filtro_descricao = (request.args.get("descricao") or "").strip()
    limit = min(2000, max(10, int(request.args.get("limit") or 500)))
    with get_conn() as conn:
        ds = _get_latest_dataset_id(conn)
        if not ds:
            return jsonify({"erro": "Nenhum dataset importado. Faça o import do Excel."}), 404
        where = ["dataset_id = %s"]
        params: list[Any] = [ds]
        if filtro_codigo:
            where.append(
                "(codigo_interno ilike %s or ean ilike %s or dun ilike %s)"
            )
            like = f"%{filtro_codigo}%"
            params.extend([like, like, like])
        if filtro_descricao:
            where.append("descricao ilike %s")
            params.append(f"%{filtro_descricao}%")
        sql = (
            "select data from public.base_codigo_barras where "
            + " and ".join(where)
            + " order by id asc limit %s"
        )
        params.append(limit)
        rows = conn.execute(sql, params).fetchall()
        data_rows = [r["data"] for r in rows] if rows else []
        headers = list(data_rows[0].keys()) if data_rows else []
        return jsonify({"headers": headers, "rows": data_rows})


@app.get("/api/romaneio")
@require_auth()
def api_romaneio():
    qs = request.args
    filtro_id_viagem = (qs.get("id_viagem") or "").strip()
    filtro_id_roteiro = (qs.get("id_roteiro") or "").strip()
    filtro_codigo_cliente = (qs.get("codigo_cliente") or "").strip()
    filtro_codigo_produto = (qs.get("codigo_produto") or "").strip()
    filtro_endereco = (qs.get("endereco") or "").strip()
    filtro_cidade = (qs.get("cidade") or "").strip()
    limit = min(5000, max(10, int(qs.get("limit") or 1500)))

    with get_conn() as conn:
        ds = _get_latest_dataset_id(conn)
        if not ds:
            return jsonify({"erro": "Nenhum dataset importado. Faça o import do Excel."}), 404
        where = ["dataset_id = %s"]
        params: list[Any] = [ds]
        if filtro_id_viagem:
            where.append("id_viagem ilike %s")
            params.append(f"%{filtro_id_viagem}%")
        if filtro_id_roteiro:
            where.append("id_roteiro ilike %s")
            params.append(f"%{filtro_id_roteiro}%")
        if filtro_codigo_cliente:
            where.append("codigo_cliente ilike %s")
            params.append(f"%{filtro_codigo_cliente}%")
        if filtro_codigo_produto:
            where.append("codigo_produto ilike %s")
            params.append(f"%{filtro_codigo_produto}%")
        if filtro_endereco:
            where.append("endereco ilike %s")
            params.append(f"%{filtro_endereco}%")
        if filtro_cidade:
            where.append("cidade ilike %s")
            params.append(f"%{filtro_cidade}%")
        sql = (
            "select data from public.excel_romaneio_por_item where "
            + " and ".join(where)
            + " order by id asc limit %s"
        )
        params.append(limit)
        rows = conn.execute(sql, params).fetchall()
        data_rows = [r["data"] for r in rows] if rows else []
        headers = list(data_rows[0].keys()) if data_rows else []
        return jsonify({"headers": headers, "rows": data_rows})


@app.get("/api/buscar-produto/<codigo_barras>")
@require_auth()
def api_buscar_produto(codigo_barras: str):
    cb = (codigo_barras or "").strip()
    if not cb:
        return jsonify({"encontrado": False})
    with get_conn() as conn:
        ds = _get_latest_dataset_id(conn)
        if not ds:
            return jsonify({"encontrado": False})
        row = conn.execute(
            """
            select codigo_interno, ean, dun, descricao, unidade, peso
            from public.base_codigo_barras
            where dataset_id = %s and (ean = %s or dun = %s)
            limit 1
            """,
            (ds, cb, cb),
        ).fetchone()
        if not row:
            return jsonify({"encontrado": False})
        tipo_codigo = "EAN" if (row.get("ean") or "") == cb else "DUN"
        return jsonify(
            {
                "encontrado": True,
                "produto": {
                    "codigo_barras": cb,
                    "codigo_produto": row.get("codigo_interno") or "",
                    "produto": row.get("descricao") or "",
                    "tipo_codigo": tipo_codigo,
                    "codigo_dun": row.get("dun") or "",
                    "unidade": row.get("unidade") or "",
                    "peso": row.get("peso") or "",
                    "veiculo": "",
                    "status": "PENDENTE",
                },
            }
        )


@app.get("/api/buscar-produto-por-codigo-interno/<codigo_interno>")
@require_auth()
def api_buscar_produto_por_codigo_interno(codigo_interno: str):
    ci = (codigo_interno or "").strip()
    if not ci:
        return jsonify({"encontrado": False})
    with get_conn() as conn:
        ds = _get_latest_dataset_id(conn)
        if not ds:
            return jsonify({"encontrado": False})
        row = conn.execute(
            """
            select codigo_interno, ean, dun, descricao, unidade, peso
            from public.base_codigo_barras
            where dataset_id = %s and codigo_interno = %s
            limit 1
            """,
            (ds, ci),
        ).fetchone()
        if not row:
            return jsonify({"encontrado": False})
        cb = row.get("ean") or row.get("dun") or ""
        return jsonify(
            {
                "encontrado": True,
                "produto": {
                    "codigo_barras": cb,
                    "codigo_produto": row.get("codigo_interno") or "",
                    "produto": row.get("descricao") or "",
                    "tipo_codigo": "EAN" if cb and cb == (row.get("ean") or "") else "DUN",
                    "codigo_dun": row.get("dun") or "",
                    "unidade": row.get("unidade") or "",
                    "peso": row.get("peso") or "",
                    "veiculo": "",
                    "status": "PENDENTE",
                },
            }
        )


@app.get("/api/conferencia/<id_viagem>")
@require_auth()
def api_conferencia(id_viagem: str):
    vid = _normalize_id(id_viagem)
    if not vid:
        return jsonify({"erro": "ID do roteiro não informado"}), 400
    with get_conn() as conn:
        ds = _get_latest_dataset_id(conn)
        if not ds:
            return jsonify({"erro": "Nenhum dataset importado. Faça o import do Excel."}), 404

        itens = conn.execute(
            """
            select
              r.codigo_produto,
              r.descricao as produto,
              coalesce(r.quantidade, 0) as quantidade_produto,
              coalesce(nullif(r.unidade, ''), '') as unidade,
              coalesce(nullif(r.peso_bruto, ''), '') as peso_bruto,
              coalesce(nullif(b.ean, ''), nullif(b.dun, ''), '') as codigo_barras
            from public.excel_romaneio_por_item r
            left join public.base_codigo_barras b
              on b.dataset_id = r.dataset_id and b.codigo_interno = r.codigo_produto
            where r.dataset_id = %s and r.id_roteiro = %s
            order by r.id asc
            """,
            (ds, vid),
        ).fetchall()

        bipados = conn.execute(
            """
            select
              coalesce(nullif(codigo_interno,''), codigo_barras) as chave,
              sum(quantidade)::int as qtd
            from public.produtos_bipados
            where id_viagem = %s
            group by 1
            """,
            (vid,),
        ).fetchall()
        bipado_map = {str(r["chave"]): int(r["qtd"] or 0) for r in bipados if r.get("chave")}

        motivos = conn.execute(
            """
            select codigo_produto, motivo
            from public.divergencia_motivo
            where id_viagem = %s
            """,
            (vid,),
        ).fetchall()
        motivo_map = {str(r["codigo_produto"]): (r.get("motivo") or "") for r in motivos if r.get("codigo_produto")}

        resp = []
        for it in itens:
            codigo_produto = _safe_str(it.get("codigo_produto"))
            codigo_barras = _safe_str(it.get("codigo_barras")) or "-"
            qtd_produto = int(it.get("quantidade_produto") or 0)
            qtd_bipada = bipado_map.get(codigo_produto, 0) or bipado_map.get(codigo_barras, 0) or 0
            status_bipado, falta = _compute_status(qtd_produto, qtd_bipada)
            resp.append(
                {
                    "codigo_barras": codigo_barras,
                    "codigo_produto": codigo_produto,
                    "produto": it.get("produto") or "",
                    "quantidade_produto": qtd_produto,
                    "unidade": it.get("unidade") or "",
                    "peso_bruto": it.get("peso_bruto") or "",
                    "quantidade_bipada": qtd_bipada,
                    "quantidade_falta": falta,
                    "status_bipado": status_bipado,
                    "aviso_sobra": "",
                    "motivo_divergencia": motivo_map.get(codigo_produto, ""),
                }
            )
        return jsonify(resp)


@app.get("/api/conferencia/<id_viagem>/produto-na-lista")
@require_auth()
def api_produto_na_lista(id_viagem: str):
    vid = _normalize_id(id_viagem)
    codigo_produto = (request.args.get("codigo_produto") or "").strip()
    codigo_barras = (request.args.get("codigo_barras") or "").strip()
    if not vid:
        return jsonify({"na_lista": False})
    with get_conn() as conn:
        ds = _get_latest_dataset_id(conn)
        if not ds:
            return jsonify({"na_lista": False})
        if codigo_produto:
            row = conn.execute(
                """
                select 1
                from public.excel_romaneio_por_item
                where dataset_id = %s and id_roteiro = %s and codigo_produto = %s
                limit 1
                """,
                (ds, vid, codigo_produto),
            ).fetchone()
            return jsonify({"na_lista": bool(row), "codigo_produto": codigo_produto})
        if codigo_barras:
            base = conn.execute(
                """
                select codigo_interno
                from public.base_codigo_barras
                where dataset_id = %s and (ean = %s or dun = %s)
                limit 1
                """,
                (ds, codigo_barras, codigo_barras),
            ).fetchone()
            if not base:
                return jsonify({"na_lista": False, "codigo_produto": None})
            cp = base.get("codigo_interno") or ""
            row = conn.execute(
                """
                select 1
                from public.excel_romaneio_por_item
                where dataset_id = %s and id_roteiro = %s and codigo_produto = %s
                limit 1
                """,
                (ds, vid, cp),
            ).fetchone()
            return jsonify({"na_lista": bool(row), "codigo_produto": cp})
    return jsonify({"na_lista": True})


@app.get("/api/produtos")
@require_auth()
def api_get_produtos():
    with get_conn() as conn:
        rows = conn.execute(
            "select * from public.produtos_bipados order by data_hora desc limit 2000"
        ).fetchall()
        return jsonify(rows)


@app.post("/api/produtos")
@require_auth()
def api_add_produto():
    data = request.json or {}
    forcar = bool(data.get("forcar_adicionar", False))
    codigo_barras = (data.get("codigo_barras") or "").strip()
    id_viagem = (data.get("id_viagem") or "").strip()
    doca = (data.get("doca") or "").strip()
    codigo_interno = (data.get("codigo_interno") or "").strip()
    if doca not in ("1", "2", "3", "4"):
        return jsonify({"success": False, "mensagem": "Selecione a doca (1, 2, 3 ou 4) antes de bipar."}), 400
    try:
        qtd = int(data.get("quantidade", 1))
    except Exception:
        qtd = 1
    qtd = max(1, min(99999, qtd))
    if not codigo_barras:
        return jsonify({"success": False, "mensagem": "Código de barras é obrigatório."}), 400
    if not id_viagem:
        return jsonify({"success": False, "mensagem": "ID do roteiro é obrigatório."}), 400

    with get_conn() as conn:
        ds = _get_latest_dataset_id(conn)
        if id_viagem and codigo_interno and not forcar and ds:
            existe = conn.execute(
                """
                select 1 from public.excel_romaneio_por_item
                where dataset_id = %s and id_roteiro = %s and codigo_produto = %s
                limit 1
                """,
                (ds, id_viagem, codigo_interno),
            ).fetchone()
            if not existe:
                return jsonify(
                    {
                        "success": False,
                        "produto_nao_cadastrado": True,
                        "mensagem": "Este produto não está cadastrado na conferência desta viagem. Deseja adicionar mesmo assim?",
                    }
                )

        conn.execute(
            """
            insert into public.produtos_bipados
              (codigo_barras, produto, quantidade, data_hora, veiculo, status, id_viagem, doca,
               codigo_interno, codigo_dun, unidade, peso, usuario_bipagem)
            values
              (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """,
            (
                codigo_barras,
                data.get("produto") or "",
                qtd,
                _utcnow(),
                data.get("veiculo") or "",
                data.get("status") or "PENDENTE",
                id_viagem,
                doca,
                codigo_interno,
                (data.get("codigo_dun") or "").strip(),
                (data.get("unidade") or "").strip(),
                (data.get("peso") or "").strip(),
                getattr(g, "usuario", "") or "",
            ),
        )
        conn.commit()
        _broadcast_atualizar()
        return jsonify({"success": True})


@app.post("/api/conferencia/remover")
@require_auth()
def api_conferencia_remover():
    data = request.json or {}
    id_viagem = (data.get("id_viagem") or "").strip()
    codigo_barras = (data.get("codigo_barras") or "").strip()
    quantidade = data.get("quantidade", 1)
    if not id_viagem or not codigo_barras:
        return jsonify({"success": False, "erro": "Parâmetros inválidos"}), 400
    tudo = str(quantidade).lower() in ("tudo", "all")
    qtd = 1
    if not tudo:
        try:
            qtd = max(1, int(quantidade))
        except Exception:
            qtd = 1

    with get_conn() as conn:
        if tudo:
            conn.execute(
                "delete from public.produtos_bipados where id_viagem = %s and codigo_barras = %s",
                (id_viagem, codigo_barras),
            )
            conn.commit()
            _broadcast_atualizar()
            return jsonify({"success": True, "mensagem": "Item(s) removido(s)."})

        rows = conn.execute(
            """
            select id, quantidade
            from public.produtos_bipados
            where id_viagem = %s and codigo_barras = %s
            order by id desc
            """,
            (id_viagem, codigo_barras),
        ).fetchall()
        falta = qtd
        for r in rows:
            if falta <= 0:
                break
            rid = r["id"]
            qrow = int(r["quantidade"] or 0)
            if qrow <= 0:
                continue
            if qrow <= falta:
                conn.execute("delete from public.produtos_bipados where id = %s", (rid,))
                falta -= qrow
            else:
                conn.execute(
                    "update public.produtos_bipados set quantidade = quantidade - %s where id = %s",
                    (falta, rid),
                )
                falta = 0
        conn.commit()
        _broadcast_atualizar()
        return jsonify({"success": True, "mensagem": "Item(s) removido(s)."})


@app.route("/api/conferencia/<id_viagem>/zerar", methods=["DELETE", "POST"])
@require_auth()
def api_conferencia_zerar(id_viagem: str):
    vid = _normalize_id(id_viagem)
    if not vid:
        return jsonify({"erro": "ID do roteiro não informado"}), 400
    with get_conn() as conn:
        conn.execute("delete from public.produtos_bipados where id_viagem = %s", (vid,))
        conn.commit()
        _broadcast_atualizar()
        return jsonify({"success": True, "mensagem": "Bipagem zerada. Você pode bipar novamente."})


@app.get("/api/viagem/<id_viagem>/periodo")
@require_auth()
def api_viagem_periodo(id_viagem: str):
    vid = _normalize_id(id_viagem)
    with get_conn() as conn:
        row = conn.execute(
            "select min(data_hora) as inicio, max(data_hora) as fim from public.produtos_bipados where id_viagem = %s",
            (vid,),
        ).fetchone()
        inicio = row.get("inicio") if row else None
        fim = row.get("fim") if row else None
        return jsonify(
            {
                "inicio_carregamento": inicio.isoformat() if inicio else None,
                "fim_carregamento": fim.isoformat() if fim else None,
            }
        )


@app.get("/api/viagem/<id_viagem>/info")
@require_auth()
def api_viagem_info(id_viagem: str):
    vid = _normalize_id(id_viagem)
    if not vid:
        return jsonify({"erro": "ID do roteiro não informado"}), 400
    with get_conn() as conn:
        ds = _get_latest_dataset_id(conn)
        base = {}
        if ds:
            r = conn.execute(
                """
                select data
                from public.excel_romaneio_por_item
                where dataset_id = %s and id_roteiro = %s
                order by id asc
                limit 1
                """,
                (ds, vid),
            ).fetchone()
            base = (r.get("data") if r else {}) or {}

        placa_override = conn.execute(
            "select placa from public.viagem_placa where id_viagem = %s",
            (vid,),
        ).fetchone()
        motorista_override = conn.execute(
            "select motorista from public.viagem_motorista where id_viagem = %s",
            (vid,),
        ).fetchone()
        resp_override = conn.execute(
            "select * from public.viagem_responsaveis where id_viagem = %s",
            (vid,),
        ).fetchone()

        placa = (placa_override.get("placa") if placa_override else None) or _safe_str(
            _json_key_lookup(base, ["PLACA"])
        )
        motorista = (motorista_override.get("motorista") if motorista_override else None) or _safe_str(
            _json_key_lookup(base, ["MOTORISTA"])
        )
        identificador_rota = _safe_str(_json_key_lookup(base, ["IDENTIFICADOR", "ROTA"]))
        data_expedicao = _safe_str(
            _json_key_lookup(base, ["INÍCIO", "PREVISTO"])
            or _json_key_lookup(base, ["INICIO", "PREVISTO"])
            or _json_key_lookup(base, ["DATA", "EXPEDI"])
        )

        return jsonify(
            {
                "id_viagem": vid,
                "placa": placa,
                "motorista": motorista,
                "identificador_rota": identificador_rota,
                "data_expedicao": data_expedicao,
                "coordenador": (resp_override.get("coordenador") if resp_override else "") or "",
                "conferente": (resp_override.get("conferente") if resp_override else "") or "",
                "ajudante1": (resp_override.get("ajudante1") if resp_override else "") or "",
                "ajudante2": (resp_override.get("ajudante2") if resp_override else "") or "",
            }
        )


@app.route("/api/viagem/<id_viagem>/motorista", methods=["PUT", "PATCH"])
@require_auth()
def api_viagem_motorista(id_viagem: str):
    vid = _normalize_id(id_viagem)
    motorista = (request.json or {}).get("motorista") or ""
    with get_conn() as conn:
        conn.execute(
            """
            insert into public.viagem_motorista (id_viagem, motorista)
            values (%s, %s)
            on conflict (id_viagem) do update set motorista = excluded.motorista
            """,
            (vid, motorista),
        )
        conn.commit()
    return jsonify({"ok": True})


@app.route("/api/viagem/<id_viagem>/placa", methods=["PUT", "PATCH"])
@require_auth()
def api_viagem_placa(id_viagem: str):
    vid = _normalize_id(id_viagem)
    placa = (request.json or {}).get("placa") or ""
    with get_conn() as conn:
        conn.execute(
            """
            insert into public.viagem_placa (id_viagem, placa)
            values (%s, %s)
            on conflict (id_viagem) do update set placa = excluded.placa
            """,
            (vid, placa),
        )
        conn.commit()
    return jsonify({"ok": True})


@app.route("/api/viagem/<id_viagem>/responsaveis", methods=["PUT", "PATCH"])
@require_auth()
def api_viagem_responsaveis(id_viagem: str):
    vid = _normalize_id(id_viagem)
    body = request.json or {}
    coordenador = (body.get("coordenador") or "").strip()
    conferente = (body.get("conferente") or "").strip()
    ajudante1 = (body.get("ajudante1") or "").strip()
    ajudante2 = (body.get("ajudante2") or "").strip()
    with get_conn() as conn:
        conn.execute(
            """
            insert into public.viagem_responsaveis (id_viagem, coordenador, conferente, ajudante1, ajudante2)
            values (%s,%s,%s,%s,%s)
            on conflict (id_viagem) do update set
              coordenador = excluded.coordenador,
              conferente = excluded.conferente,
              ajudante1 = excluded.ajudante1,
              ajudante2 = excluded.ajudante2
            """,
            (vid, coordenador, conferente, ajudante1, ajudante2),
        )
        conn.commit()
    return jsonify({"ok": True})


@app.get("/api/colaboradores-motoristas")
@require_auth()
def api_colaboradores_motoristas():
    with get_conn() as conn:
        rows = conn.execute(
            """
            select nome from public.motoristas where coalesce(ativo, true) = true
            order by nome limit 2000
            """
        ).fetchall()
        if rows:
            return jsonify([r["nome"] for r in rows if r.get("nome")])
        rows = conn.execute(
            """
            select nome from public.colaboradores
            where coalesce(ativo, true) = true
              and (upper(coalesce(tipo,'')) like 'MOTORISTA%%' or upper(coalesce(tipo,'')) like 'TRANSPORTE%%')
            order by nome limit 2000
            """
        ).fetchall()
        return jsonify([r["nome"] for r in rows if r.get("nome")])


@app.get("/api/placas")
@require_auth()
def api_placas():
    with get_conn() as conn:
        rows = conn.execute(
            """
            select placa from public.placas
            where coalesce(ativo, true) = true and placa is not null and placa <> ''
            order by placa
            limit 2000
            """
        ).fetchall()
        return jsonify([r["placa"] for r in rows if r.get("placa")])


@app.get("/api/estatisticas")
@require_auth()
def api_estatisticas():
    with get_conn() as conn:
        total_bipados = conn.execute("select count(*)::int as total from public.produtos_bipados").fetchone()["total"]
        total_carregados = conn.execute(
            "select count(*)::int as total from public.produtos_bipados where status = 'CARREGADO'"
        ).fetchone()["total"]
        total_unicos = conn.execute(
            "select count(distinct codigo_barras)::int as total from public.produtos_bipados"
        ).fetchone()["total"]
        total_viagens = conn.execute(
            "select count(distinct id_viagem)::int as total from public.produtos_bipados where id_viagem is not null and trim(id_viagem) <> ''"
        ).fetchone()["total"]
        soma_quantidades = conn.execute(
            "select coalesce(sum(quantidade), 0)::int as total from public.produtos_bipados"
        ).fetchone()["total"]
        veiculos = conn.execute(
            """
            select veiculo, count(*)::int as total
            from public.produtos_bipados
            where status = 'CARREGADO' and coalesce(veiculo,'') <> ''
            group by veiculo
            """
        ).fetchall()
        return jsonify(
            {
                "total_bipados": total_bipados,
                "total_carregados": total_carregados,
                "total_unicos": total_unicos,
                "total_divergencias": 0,
                "total_viagens": total_viagens,
                "soma_quantidades": soma_quantidades,
                "veiculos": veiculos,
            }
        )


@app.get("/api/painel-completo")
@require_auth()
def api_painel_completo():
    with get_conn() as conn:
        estat = api_estatisticas().get_json()  # type: ignore
        viagens_rows = conn.execute(
            """
            select
              id_viagem,
              min(data_hora) as inicio,
              max(data_hora) as fim,
              count(*)::int as total_bipados,
              coalesce(sum(quantidade),0)::int as soma_quantidades
            from public.produtos_bipados
            where id_viagem is not null and trim(id_viagem) <> ''
            group by id_viagem
            order by max(data_hora) desc
            limit 200
            """
        ).fetchall()

        viagens = []
        for r in viagens_rows:
            inicio = r.get("inicio")
            fim = r.get("fim")
            duracao = None
            if inicio and fim:
                duracao = int((fim - inicio).total_seconds() // 60)
            viagens.append(
                {
                    "id_viagem": r.get("id_viagem"),
                    "inicio": inicio.isoformat() if inicio else None,
                    "fim": fim.isoformat() if fim else None,
                    "duracao_minutos": duracao,
                    "total_bipados": r.get("total_bipados") or 0,
                    "total_faltas": 0,
                }
            )

        top_itens = conn.execute(
            """
            select coalesce(nullif(codigo_interno,''), codigo_barras) as codigo, coalesce(sum(quantidade),0)::int as total
            from public.produtos_bipados
            group by 1
            order by total desc
            limit 15
            """
        ).fetchall()

        carros_itens = conn.execute(
            """
            select coalesce(nullif(veiculo,''),'Sem veículo') as veiculo, coalesce(sum(quantidade),0)::int as total
            from public.produtos_bipados
            group by 1
            order by total desc
            limit 15
            """
        ).fetchall()

        return jsonify(
            {
                "estatisticas": estat or {},
                "viagens": viagens,
                "tempo_por_placa": [],
                "top_itens_bipados": top_itens,
                "carros_mais_itens": carros_itens,
                "carros_mais_peso": [],
                "romaneio": {},
            }
        )


@app.get("/api/usuarios")
@require_auth()
def api_usuarios():
    with get_conn() as conn:
        rows = conn.execute(
            "select usuario, criado_em from public.usuarios order by usuario"
        ).fetchall()
        return jsonify(rows)


@app.post("/api/logout")
@require_auth()
def api_logout():
    # JWT será implementado no próximo todo; no frontend estático, logout pode apenas apagar token.
    return jsonify({"ok": True})


@app.get("/api/viagem/<id_viagem>/data-expedicao")
@require_auth()
def api_viagem_data_expedicao(id_viagem: str):
    info = api_viagem_info(id_viagem).get_json()  # type: ignore
    return jsonify({"data_expedicao": (info or {}).get("data_expedicao")})


@app.route("/api/produtos/<int:produto_id>", methods=["PUT"])
@require_auth()
def api_update_produto(produto_id: int):
    data = request.json or {}
    with get_conn() as conn:
        conn.execute(
            """
            update public.produtos_bipados
            set produto = %s, quantidade = %s, veiculo = %s, status = %s
            where id = %s
            """,
            (
                data.get("produto") or "",
                int(data.get("quantidade") or 1),
                data.get("veiculo") or "",
                data.get("status") or "PENDENTE",
                produto_id,
            ),
        )
        conn.commit()
        _broadcast_atualizar()
        return jsonify({"success": True})


@app.route("/api/produtos/<int:produto_id>", methods=["DELETE"])
@require_auth()
def api_delete_produto(produto_id: int):
    with get_conn() as conn:
        conn.execute("delete from public.produtos_bipados where id = %s", (produto_id,))
        conn.commit()
        _broadcast_atualizar()
        return jsonify({"success": True})


@app.post("/api/divergencias/motivo")
@app.patch("/api/divergencias/motivo")
@app.put("/api/divergencias/motivo")
@require_auth()
def api_divergencias_motivo():
    body = request.json or {}
    id_viagem = (body.get("id_viagem") or "").strip()
    codigo_produto = (body.get("codigo_produto") or "").strip()
    motivo = (body.get("motivo") or "").strip()
    if not id_viagem or not codigo_produto:
        return jsonify({"erro": "Parâmetros inválidos"}), 400
    with get_conn() as conn:
        conn.execute(
            """
            insert into public.divergencia_motivo (id_viagem, codigo_produto, motivo)
            values (%s,%s,%s)
            on conflict (id_viagem, codigo_produto) do update set motivo = excluded.motivo
            """,
            (id_viagem, codigo_produto, motivo),
        )
        conn.commit()
    return jsonify({"ok": True})


@app.get("/api/divergencias")
@require_auth()
def api_divergencias():
    """
    Retorna divergências de todos os roteiros que têm bipagem.
    Formato simplificado: lista de roteiros com itens pendentes/excedentes.
    """
    with get_conn() as conn:
        ds = _get_latest_dataset_id(conn)
        if not ds:
            return jsonify({"roteiros": [], "total_roteiros": 0, "total_itens": 0})
        vids = conn.execute(
            """
            select distinct id_viagem
            from public.produtos_bipados
            where id_viagem is not null and trim(id_viagem) <> ''
            order by id_viagem
            limit 300
            """
        ).fetchall()
        roteiros = []
        total_itens = 0
        for r in vids:
            vid = (r.get("id_viagem") or "").strip()
            if not vid:
                continue
            itens = api_conferencia(vid).get_json()  # type: ignore
            if not isinstance(itens, list):
                continue
            itens_div = [it for it in itens if (it.get("status_bipado") in ("PENDENTE", "PARCIAL", "EXCEDENTE"))]
            if not itens_div:
                continue
            total_itens += len(itens_div)
            roteiros.append({"id_viagem": vid, "itens": itens_div})
        return jsonify({"roteiros": roteiros, "total_roteiros": len(roteiros), "total_itens": total_itens})


@app.post("/api/login")
def api_login():
    body = request.json or {}
    usuario = (body.get("usuario") or "").strip()
    senha = body.get("senha") or ""
    if not usuario or not senha:
        return jsonify({"ok": False, "erro": "Usuário e senha são obrigatórios."}), 400
    with get_conn() as conn:
        row = conn.execute(
            "select usuario, senha_hash from public.usuarios where usuario = %s",
            (usuario,),
        ).fetchone()
        if not row or not check_password_hash(row.get("senha_hash") or "", senha):
            return jsonify({"ok": False, "erro": "Usuário ou senha inválidos."}), 401
        token = _emit_token(usuario)
        return jsonify({"ok": True, "access_token": token, "usuario": usuario})


@app.post("/api/cadastrar")
def api_cadastrar():
    body = request.json or {}
    usuario = (body.get("usuario") or "").strip()
    senha = body.get("senha") or ""
    confirmar = body.get("confirmar_senha") or ""
    if not usuario or not senha:
        return jsonify({"ok": False, "erro": "Usuário e senha são obrigatórios."}), 400
    if senha != confirmar:
        return jsonify({"ok": False, "erro": "As senhas não coincidem."}), 400
    senha_hash = generate_password_hash(senha)
    with get_conn() as conn:
        existe = conn.execute("select 1 from public.usuarios where usuario = %s", (usuario,)).fetchone()
        if existe:
            return jsonify({"ok": False, "erro": "Usuário já existe."}), 409
        conn.execute(
            "insert into public.usuarios (usuario, senha_hash) values (%s,%s)",
            (usuario, senha_hash),
        )
        conn.commit()
        return jsonify({"ok": True, "mensagem": "Cadastro realizado. Faça login."})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5001"))
    app.run(host="0.0.0.0", port=port, debug=True)

