"""
Módulo WMS Endereçamento — localizações, paletes, putaway, recebimento e inventário.
"""
from __future__ import annotations

import json
import os
import secrets
import string
from collections import Counter
from datetime import date, datetime, timezone

from flask import Blueprint, jsonify, request, session

bp = Blueprint('wms_enderecamento', __name__)

_get_db = None
_WMS_SCHEMA_READY = False


def init_wms_enderecamento(get_db_func):
    global _get_db
    _get_db = get_db_func
    try:
        conn = get_db_func()
        ensure_wms_schema(conn)
        _sync_wms_camara_layout(conn)
        conn.close()
    except Exception:
        pass


def _db():
    if _get_db is None:
        raise RuntimeError('WMS não inicializado: chame init_wms_enderecamento(get_db)')
    return _get_db()


def _usuario():
    return (session.get('usuario') or '').strip() or None


def _is_pg(conn):
    return getattr(conn, 'kind', None) == 'pg'


def _tbl(conn, name):
    return f'public.{name}' if _is_pg(conn) else name


def _ativo_sql(conn, alias=''):
    """Filtro de registro ativo (boolean no Postgres, integer no SQLite)."""
    p = f'{alias}.' if alias else ''
    if _is_pg(conn):
        return f'({p}ativo IS TRUE)'
    return f'({p}ativo = 1)'


def _int_col(row, key='c', default=0):
    d = _row_dict(row)
    if not d:
        return default
    try:
        return int(d.get(key) if d.get(key) is not None else default)
    except (TypeError, ValueError):
        return default


def _wms_tabelas_existem(conn):
    t = _tbl(conn, 'wms_localizacao')
    try:
        conn.execute(f'SELECT 1 FROM {t} LIMIT 1')
        return True
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
        return False


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _codigo_endereco(camara, rua, posicao, nivel):
    return f'{int(camara):02d}-{str(rua).strip().upper()}-{int(posicao):02d}-{int(nivel)}'


_WMS_CAMARA_TOTAIS_PADRAO = {11: 138, 12: 134, 13: 138, 21: 82}


def _layout_camaras_config():
    path = os.path.join(os.path.dirname(__file__), 'data', 'wms_layout_camaras.json')
    if not os.path.isfile(path):
        return {
            'camaras': [
                {'codigo': 11, 'ruas': ['U', 'V'], 'niveis': 3, 'total_posicoes': 138},
                {'codigo': 12, 'ruas': ['X', 'Y'], 'niveis': 3, 'total_posicoes': 134},
                {'codigo': 13, 'ruas': ['W', 'Z'], 'niveis': 3, 'total_posicoes': 138},
                {'codigo': 21, 'ruas': ['R'], 'niveis': 3, 'total_posicoes': 82},
            ]
        }
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def _total_posicoes_ref(camara, bloco=None):
    """Capacidade física de referência — não usar COUNT(*) do banco."""
    if bloco and bloco.get('total_posicoes'):
        return int(bloco['total_posicoes'])
    for b in (_layout_camaras_config().get('camaras') or []):
        if int(b.get('codigo') or 0) == int(camara) and b.get('total_posicoes'):
            return int(b['total_posicoes'])
    return int(_WMS_CAMARA_TOTAIS_PADRAO.get(int(camara), 0))


def _map_totais_ref_camaras():
    out = dict(_WMS_CAMARA_TOTAIS_PADRAO)
    for bloco in (_layout_camaras_config().get('camaras') or []):
        cod = int(bloco.get('codigo') or 0)
        if cod and bloco.get('total_posicoes'):
            out[cod] = int(bloco['total_posicoes'])
    return out


def _limpar_localizacoes_orfas_vazias(conn, camara, codigos_validos):
    if not codigos_validos:
        return 0
    t_loc = _tbl(conn, 'wms_localizacao')
    ph = ','.join(['?' for _ in codigos_validos])
    cur = conn.execute(
        f'''DELETE FROM {t_loc}
            WHERE camara = ? AND status = 'vazia'
              AND codigo_endereco NOT IN ({ph})''',
        (int(camara), *codigos_validos),
    )
    return int(getattr(cur, 'rowcount', 0) or 0)


def _sync_wms_camara_layout(conn):
    """Restaura total_posicoes de referência e remove endereços vazios fora do layout."""
    if not _wms_tabelas_existem(conn):
        return
    t_cam = _tbl(conn, 'wms_camara')
    refs = _map_totais_ref_camaras()
    removidas = 0
    for bloco in (_layout_camaras_config().get('camaras') or []):
        cod = int(bloco['codigo'])
        total = _total_posicoes_ref(cod, bloco)
        if total <= 0:
            continue
        conn.execute(f'UPDATE {t_cam} SET total_posicoes = ? WHERE codigo = ?', (total, cod))
        coords = _gerar_coordenadas_camara(cod, bloco.get('ruas'), bloco.get('niveis', 3), total)
        codigos = {_codigo_endereco(c, r, p, n) for c, r, p, n in coords}
        removidas += _limpar_localizacoes_orfas_vazias(conn, cod, codigos)
    try:
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return removidas


def _ensure_categoria_zona_column(conn):
    if _is_pg(conn):
        try:
            conn.execute(
                'ALTER TABLE public.wms_localizacao ADD COLUMN IF NOT EXISTS categoria_zona TEXT'
            )
            conn.commit()
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass
    else:
        try:
            cols = conn.execute('PRAGMA table_info(wms_localizacao)').fetchall()
            names = {c[1] if not isinstance(c, dict) else c.get('name') for c in (cols or [])}
            if 'categoria_zona' not in names:
                conn.execute('ALTER TABLE wms_localizacao ADD COLUMN categoria_zona TEXT')
                conn.commit()
        except Exception:
            pass


def _pesos_categoria_produtos(conn):
    """Peso de cada categoria conforme cadastro de produtos (sem Excel)."""
    t = _tbl(conn, 'wms_produto_enderecamento')
    rows = conn.execute(
        f'''SELECT UPPER(SUBSTR(categoria, 1, 1)) AS cat, COUNT(*) AS n
            FROM {t}
            WHERE {_ativo_sql(conn)}
            GROUP BY UPPER(SUBSTR(categoria, 1, 1))'''
    ).fetchall()
    pesos = {}
    for r in rows:
        d = _row_dict(r) or {}
        cat = (d.get('cat') or 'C').strip().upper()
        if cat in ('A', 'B', 'C', 'D'):
            pesos[cat] = int(d.get('n') or 0)
    if not pesos:
        pesos = {'A': 1, 'B': 1, 'C': 1, 'D': 1}
    return pesos


def _categorias_camara_zoneamento(conn, camara):
    t_z = _tbl(conn, 'wms_zoneamento')
    rows = conn.execute(
        f'''SELECT DISTINCT categoria FROM {t_z}
            WHERE camara = ? AND {_ativo_sql(conn)}
            ORDER BY categoria''',
        (int(camara),),
    ).fetchall()
    cats = []
    for r in rows:
        c = (r['categoria'] if isinstance(r, dict) else r[0] or '').strip().upper()
        if c and c not in cats:
            cats.append(c)
    return cats or ['C']


def _distribuir_categorias_em_slots(total, categorias, pesos):
    """Divide `total` posições entre categorias permitidas, proporcional ao peso dos produtos."""
    if total <= 0 or not categorias:
        return []
    cats = list(categorias)
    soma = sum(max(int(pesos.get(c, 0)), 1) for c in cats)
    aloc = {}
    resto = total
    for i, c in enumerate(cats):
        if i == len(cats) - 1:
            aloc[c] = resto
        else:
            n = max(1, round(total * max(int(pesos.get(c, 0)), 1) / soma))
            n = min(n, resto - (len(cats) - i - 1))
            aloc[c] = n
            resto -= n
    seq = []
    for c in cats:
        seq.extend([c] * aloc.get(c, 0))
    while len(seq) < total:
        seq.append(cats[len(seq) % len(cats)])
    return seq[:total]


def _gerar_coordenadas_camara(camara, ruas, niveis, total):
    """Gera (camara, rua, posicao, nivel) até atingir total de posições."""
    ruas = [str(r).strip().upper() for r in (ruas or ['A']) if str(r).strip()] or ['A']
    niveis = max(1, int(niveis or 3))
    out = []
    base = total // len(ruas)
    extra = total % len(ruas)
    for idx, rua in enumerate(ruas):
        slots_rua = base + (1 if idx < extra else 0)
        pos = 1
        niv = 1
        for _ in range(slots_rua):
            out.append((int(camara), rua, pos, niv))
            niv += 1
            if niv > niveis:
                niv = 1
                pos += 1
    return out[:total]


def gerar_layout_enderecos(conn, force=False):
    """
    Gera/atualiza endereços no banco a partir do layout JSON + zoneamento por categoria.
    Não usa planilha Excel.
    """
    _ensure_categoria_zona_column(conn)
    ensure_wms_schema(conn)
    _seed_wms_defaults(conn)

    t_loc = _tbl(conn, 'wms_localizacao')
    t_cam = _tbl(conn, 'wms_camara')
    pesos = _pesos_categoria_produtos(conn)
    cfg = _layout_camaras_config()
    now = _now_iso()

    if not force:
        sem_zona = conn.execute(
            f'''SELECT COUNT(*) AS c FROM {t_loc}
                WHERE categoria_zona IS NULL OR TRIM(categoria_zona) = ?''',
            ('',),
        ).fetchone()
        cnt = int((sem_zona or {}).get('c', 0) if isinstance(sem_zona, dict) else 0)
        total_loc = conn.execute(f'SELECT COUNT(*) AS c FROM {t_loc}').fetchone()
        total_loc = int((total_loc or {}).get('c', 0) if isinstance(total_loc, dict) else 0)
        if total_loc > 0 and cnt == 0:
            return {'ok': True, 'geradas': 0, 'mensagem': 'Layout já distribuído por categoria.'}

    inseridas = 0
    por_categoria = Counter()

    for bloco in cfg.get('camaras') or []:
        cod = int(bloco['codigo'])
        total = _total_posicoes_ref(cod, bloco)
        if total <= 0:
            continue
        cats = _categorias_camara_zoneamento(conn, cod)
        seq_cat = _distribuir_categorias_em_slots(total, cats, pesos)
        coords = _gerar_coordenadas_camara(cod, bloco.get('ruas'), bloco.get('niveis', 3), total)
        codigos_validos = []
        for i, (cam, rua, pos, nivel) in enumerate(coords):
            cat_z = seq_cat[i] if i < len(seq_cat) else cats[0]
            cod_end = _codigo_endereco(cam, rua, pos, nivel)
            codigos_validos.append(cod_end)
            if _is_pg(conn):
                conn.execute(
                    f'''INSERT INTO {t_loc}
                        (camara, rua, posicao, nivel, codigo_endereco, status, area, categoria_zona)
                        VALUES (?, ?, ?, ?, ?, 'vazia', ?, ?)
                        ON CONFLICT (codigo_endereco) DO UPDATE SET
                          area = EXCLUDED.area,
                          categoria_zona = EXCLUDED.categoria_zona,
                          atualizado_em = NOW()''',
                    (cam, rua, pos, nivel, cod_end, cat_z, cat_z),
                )
            else:
                conn.execute(
                    f'''INSERT INTO {t_loc}
                        (camara, rua, posicao, nivel, codigo_endereco, status, area, categoria_zona,
                         criado_em, atualizado_em)
                        VALUES (?, ?, ?, ?, ?, 'vazia', ?, ?, ?, ?)
                        ON CONFLICT (codigo_endereco) DO UPDATE SET
                          area = excluded.area,
                          categoria_zona = excluded.categoria_zona,
                          atualizado_em = excluded.atualizado_em''',
                    (cam, rua, pos, nivel, cod_end, cat_z, cat_z, now, now),
                )
            inseridas += 1
            por_categoria[cat_z] += 1

        if force:
            _limpar_localizacoes_orfas_vazias(conn, cod, codigos_validos)
        conn.execute(f'UPDATE {t_cam} SET total_posicoes = ? WHERE codigo = ?', (total, cod))

    try:
        conn.commit()
    except Exception:
        conn.rollback()
        raise

    return {
        'ok': True,
        'geradas': inseridas,
        'por_categoria': dict(por_categoria),
        'pesos_produtos': pesos,
    }


def _distribuicao_categoria(conn):
    t_loc = _tbl(conn, 'wms_localizacao')
    rows = conn.execute(
        f'''SELECT categoria_zona AS categoria, camara,
                   COUNT(*) AS total,
                   SUM(CASE WHEN status = 'vazia' THEN 1 ELSE 0 END) AS vazias,
                   SUM(CASE WHEN status = 'ocupada' THEN 1 ELSE 0 END) AS ocupadas
            FROM {t_loc}
            WHERE categoria_zona IS NOT NULL AND TRIM(categoria_zona) <> ''
            GROUP BY categoria_zona, camara
            ORDER BY categoria_zona, camara'''
    ).fetchall()
    return [dict(r) for r in rows]


def _gerar_etiqueta_palete():
    """Etiqueta palete WMS — exatamente 22 caracteres."""
    prefix = 'UP'
    ts = datetime.now(timezone.utc).strftime('%y%m%d%H%M')
    rest = 22 - len(prefix) - len(ts)
    suffix = ''.join(secrets.choice(string.digits + string.ascii_uppercase) for _ in range(max(rest, 4)))
    etiqueta = (prefix + ts + suffix)[:22]
    if len(etiqueta) < 22:
        etiqueta = etiqueta.ljust(22, '0')
    return etiqueta


def ensure_wms_schema(conn):
    """Cria tabelas WMS (Postgres ou SQLite). Executa no máximo uma vez por processo."""
    global _WMS_SCHEMA_READY
    if _WMS_SCHEMA_READY:
        return
    if _wms_tabelas_existem(conn):
        _ensure_categoria_zona_column(conn)
        _WMS_SCHEMA_READY = True
        return
    if _is_pg(conn):
        sql_path = os.path.join(os.path.dirname(__file__), 'supabase', 'create_wms_enderecamento.sql')
        if os.path.isfile(sql_path):
            with open(sql_path, encoding='utf-8') as f:
                raw = f.read()
            buf = []
            for line in raw.splitlines():
                stripped = line.strip()
                if stripped.startswith('--'):
                    continue
                buf.append(line)
            blob = '\n'.join(buf)
            stmts = []
            cur = []
            for part in blob.split(';'):
                part = part.strip()
                if not part:
                    continue
                if part.upper().startswith('COMMENT'):
                    continue
                stmts.append(part)
            for stmt in stmts:
                try:
                    conn.execute(stmt)
                except Exception:
                    try:
                        conn.rollback()
                    except Exception:
                        pass
    else:
        conn.execute(
            '''CREATE TABLE IF NOT EXISTS wms_camara (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                codigo INTEGER NOT NULL UNIQUE,
                descricao TEXT NOT NULL,
                total_posicoes INTEGER NOT NULL DEFAULT 0,
                ativo INTEGER NOT NULL DEFAULT 1,
                criado_em TEXT NOT NULL
            )'''
        )
        conn.execute(
            '''CREATE TABLE IF NOT EXISTS wms_localizacao (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                camara INTEGER NOT NULL,
                rua TEXT NOT NULL,
                posicao INTEGER NOT NULL,
                nivel INTEGER NOT NULL DEFAULT 1,
                codigo_endereco TEXT NOT NULL UNIQUE,
                tipo TEXT NOT NULL DEFAULT 'porta_palete',
                status TEXT NOT NULL DEFAULT 'vazia',
                capacidade_max INTEGER NOT NULL DEFAULT 1,
                bloqueio_entrada INTEGER NOT NULL DEFAULT 0,
                bloqueio_saida INTEGER NOT NULL DEFAULT 0,
                bloqueio_inventario INTEGER NOT NULL DEFAULT 0,
                area TEXT,
                categoria_zona TEXT,
                criado_em TEXT NOT NULL,
                atualizado_em TEXT NOT NULL,
                UNIQUE (camara, rua, posicao, nivel)
            )'''
        )
        conn.execute(
            '''CREATE TABLE IF NOT EXISTS wms_produto_enderecamento (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sku TEXT NOT NULL UNIQUE,
                descricao TEXT,
                medida_cx TEXT,
                cubagem REAL,
                peso_cx REAL,
                padrao_plt TEXT,
                conversao INTEGER,
                categoria TEXT NOT NULL DEFAULT 'C',
                temperatura_zona TEXT DEFAULT 'congelado',
                ativo INTEGER NOT NULL DEFAULT 1,
                criado_em TEXT NOT NULL,
                atualizado_em TEXT NOT NULL
            )'''
        )
        conn.execute(
            '''CREATE TABLE IF NOT EXISTS wms_zoneamento (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                categoria TEXT NOT NULL,
                camara INTEGER NOT NULL,
                prioridade INTEGER NOT NULL DEFAULT 1,
                ativo INTEGER NOT NULL DEFAULT 1,
                UNIQUE (categoria, camara)
            )'''
        )
        conn.execute(
            '''CREATE TABLE IF NOT EXISTS wms_palete (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                etiqueta TEXT NOT NULL UNIQUE,
                localizacao_id INTEGER,
                status TEXT NOT NULL DEFAULT 'em_conferencia',
                estado_fisico TEXT DEFAULT 'bom',
                temperatura REAL,
                bloqueio_tipo TEXT,
                bloqueio_motivo TEXT,
                recebimento_id INTEGER,
                criado_em TEXT NOT NULL,
                atualizado_em TEXT NOT NULL,
                criado_por TEXT
            )'''
        )
        conn.execute(
            '''CREATE TABLE IF NOT EXISTS wms_palete_item (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                palete_id INTEGER NOT NULL,
                sku TEXT NOT NULL,
                descricao TEXT,
                lote TEXT,
                data_producao TEXT,
                data_validade TEXT,
                sif TEXT,
                quantidade_caixas INTEGER NOT NULL DEFAULT 0,
                peso_liquido REAL,
                rg_caixa TEXT,
                shelf_dias INTEGER,
                criado_em TEXT NOT NULL
            )'''
        )
        conn.execute(
            '''CREATE TABLE IF NOT EXISTS wms_movimentacao (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tipo TEXT NOT NULL,
                palete_id INTEGER NOT NULL,
                origem_localizacao_id INTEGER,
                destino_localizacao_id INTEGER,
                status TEXT NOT NULL DEFAULT 'pendente',
                prioridade INTEGER NOT NULL DEFAULT 5,
                observacao TEXT,
                criado_em TEXT NOT NULL,
                concluida_em TEXT,
                criado_por TEXT,
                concluida_por TEXT
            )'''
        )
        conn.execute(
            '''CREATE TABLE IF NOT EXISTS wms_posicao_picking (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                localizacao_id INTEGER NOT NULL UNIQUE,
                sku TEXT,
                shelf_min_dias INTEGER,
                qtd_minima INTEGER DEFAULT 0,
                buffer INTEGER NOT NULL DEFAULT 0,
                ativo INTEGER NOT NULL DEFAULT 1,
                criado_em TEXT NOT NULL
            )'''
        )
        conn.execute(
            '''CREATE TABLE IF NOT EXISTS wms_recebimento (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                numero_nf TEXT,
                fornecedor TEXT,
                placa TEXT,
                doca TEXT,
                origem TEXT NOT NULL DEFAULT 'manual',
                status TEXT NOT NULL DEFAULT 'aguardando',
                check_qualidade_ok INTEGER,
                criado_em TEXT NOT NULL,
                atualizado_em TEXT NOT NULL,
                criado_por TEXT
            )'''
        )
        conn.execute(
            '''CREATE TABLE IF NOT EXISTS wms_recebimento_palete (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                recebimento_id INTEGER NOT NULL,
                palete_id INTEGER NOT NULL,
                estado_palete TEXT DEFAULT 'bom',
                conferencia_cega INTEGER NOT NULL DEFAULT 1,
                UNIQUE (recebimento_id, palete_id)
            )'''
        )
        conn.execute(
            '''CREATE TABLE IF NOT EXISTS wms_check_qualidade (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                contexto TEXT NOT NULL DEFAULT 'recebimento',
                ordem INTEGER NOT NULL DEFAULT 1,
                pergunta TEXT NOT NULL,
                tipo_resposta TEXT NOT NULL DEFAULT 'sim_nao',
                ativo INTEGER NOT NULL DEFAULT 1
            )'''
        )
        conn.execute(
            '''CREATE TABLE IF NOT EXISTS wms_check_qualidade_resposta (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                recebimento_id INTEGER NOT NULL,
                pergunta_id INTEGER NOT NULL,
                resposta TEXT,
                valor_numerico REAL,
                respondido_em TEXT NOT NULL,
                respondido_por TEXT
            )'''
        )
        conn.execute(
            '''CREATE TABLE IF NOT EXISTS wms_inventario (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tipo TEXT NOT NULL,
                descricao TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'ativo',
                criado_em TEXT NOT NULL,
                finalizado_em TEXT,
                criado_por TEXT
            )'''
        )
        conn.execute(
            '''CREATE TABLE IF NOT EXISTS wms_inventario_linha (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                inventario_id INTEGER NOT NULL,
                localizacao_id INTEGER,
                palete_etiqueta TEXT,
                sku TEXT,
                status_esperado TEXT,
                status_informado TEXT,
                quantidade_contada INTEGER,
                divergencia INTEGER NOT NULL DEFAULT 0,
                contado_em TEXT,
                contado_por TEXT
            )'''
        )
    try:
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
    _ensure_categoria_zona_column(conn)
    _WMS_SCHEMA_READY = True


def _seed_wms_defaults(conn):
    """Câmaras, zoneamento e perguntas de qualidade padrão."""
    t_cam = _tbl(conn, 'wms_camara')
    n = conn.execute(f'SELECT COUNT(*) AS c FROM {t_cam}').fetchone()
    if n and (n['c'] if isinstance(n, dict) else n[0]) > 0:
        return
    now = _now_iso()
    camaras = [
        (11, 'Câmara 11', 138),
        (12, 'Câmara 12', 134),
        (13, 'Câmara 13', 138),
        (21, 'Câmara 21', 82),
    ]
    for cod, desc, tot in camaras:
        if _is_pg(conn):
            conn.execute(
                f'INSERT INTO {t_cam} (codigo, descricao, total_posicoes) VALUES (?, ?, ?) ON CONFLICT (codigo) DO NOTHING',
                (cod, desc, tot),
            )
        else:
            conn.execute(
                f'INSERT OR IGNORE INTO {t_cam} (codigo, descricao, total_posicoes, ativo, criado_em) VALUES (?, ?, ?, 1, ?)',
                (cod, desc, tot, now),
            )
    zone = [
        ('A', 11, 1), ('A', 12, 2),
        ('B', 11, 1), ('B', 12, 2),
        ('C', 12, 1), ('C', 13, 2),
        ('D', 13, 1), ('D', 21, 2),
    ]
    t_z = _tbl(conn, 'wms_zoneamento')
    for cat, cam, pri in zone:
        if _is_pg(conn):
            conn.execute(
                f'INSERT INTO {t_z} (categoria, camara, prioridade) VALUES (?, ?, ?) ON CONFLICT (categoria, camara) DO NOTHING',
                (cat, cam, pri),
            )
        else:
            conn.execute(
                f'INSERT OR IGNORE INTO {t_z} (categoria, camara, prioridade, ativo) VALUES (?, ?, ?, 1)',
                (cat, cam, pri),
            )
    perguntas = [
        (1, 'Veículo consta lacrado?'),
        (2, 'Divisória térmica em boas condições?'),
        (3, 'Condições higiênicas do baú adequadas?'),
        (4, 'Temperatura do baú (°C)'),
        (5, 'Número do lacre'),
        (6, 'Integridade das embalagens'),
    ]
    t_cq = _tbl(conn, 'wms_check_qualidade')
    for ordem, pergunta in perguntas:
        tipo = 'numero' if 'Temperatura' in pergunta or 'lacre' in pergunta.lower() else 'sim_nao'
        exist = conn.execute(
            f'SELECT 1 FROM {t_cq} WHERE contexto = ? AND pergunta = ?',
            ('recebimento', pergunta),
        ).fetchone()
        if not exist:
            if _is_pg(conn):
                conn.execute(
                    f'INSERT INTO {t_cq} (contexto, ordem, pergunta, tipo_resposta) VALUES (?, ?, ?, ?)',
                    ('recebimento', ordem, pergunta, tipo),
                )
            else:
                conn.execute(
                    f'INSERT INTO {t_cq} (contexto, ordem, pergunta, tipo_resposta, ativo) VALUES (?, ?, ?, ?, 1)',
                    ('recebimento', ordem, pergunta, tipo),
                )
    try:
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass


def _row_dict(row):
    if row is None:
        return None
    if isinstance(row, dict):
        return dict(row)
    return dict(row) if hasattr(row, 'keys') else None


def _ocupacao_camara(conn):
    t_loc = _tbl(conn, 'wms_localizacao')
    t_cam = _tbl(conn, 'wms_camara')
    rows = conn.execute(
        f'''SELECT c.codigo, c.descricao, c.total_posicoes,
                   COUNT(l.id) AS cadastradas,
                   SUM(CASE WHEN l.status = 'ocupada' THEN 1 ELSE 0 END) AS ocupadas,
                   SUM(CASE WHEN l.status = 'vazia' THEN 1 ELSE 0 END) AS vazias
            FROM {t_cam} c
            LEFT JOIN {t_loc} l ON l.camara = c.codigo
            WHERE {_ativo_sql(conn, 'c')}
            GROUP BY c.codigo, c.descricao, c.total_posicoes
            ORDER BY c.codigo'''
    ).fetchall()
    refs = _map_totais_ref_camaras()
    out = []
    for r in rows:
        d = _row_dict(r) or {}
        cod = int(d.get('codigo') or 0)
        cad = int(d.get('cadastradas') or 0)
        ocup = int(d.get('ocupadas') or 0)
        vaz = int(d.get('vazias') or 0)
        total_ref = refs.get(cod) or int(d.get('total_posicoes') or cad or 1)
        base = cad if cad > 0 else total_ref
        vaz_calc = cad - ocup if cad > 0 else max(total_ref - ocup, 0)
        pct = round(100.0 * ocup / base, 1) if base else 0
        out.append({
            'camara': cod,
            'descricao': d.get('descricao'),
            'total_posicoes': total_ref,
            'cadastradas': cad,
            'ocupadas': ocup,
            'vazias': vaz if cad else vaz_calc,
            'ocupacao_pct': pct,
        })
    return out


def _sugerir_putaway(conn, sku, lote=None):
    """Regras simplificadas de putaway conforme documento WYMS."""
    t_prod = _tbl(conn, 'wms_produto_enderecamento')
    t_z = _tbl(conn, 'wms_zoneamento')
    t_loc = _tbl(conn, 'wms_localizacao')
    t_pal = _tbl(conn, 'wms_palete')
    t_item = _tbl(conn, 'wms_palete_item')

    prod = conn.execute(f'SELECT * FROM {t_prod} WHERE sku = ? AND {_ativo_sql(conn)}', (sku,)).fetchone()
    cat = (prod['categoria'] if prod else 'C') or 'C'

    camaras = conn.execute(
        f'''SELECT camara FROM {t_z}
            WHERE categoria = ? AND {_ativo_sql(conn)}
            ORDER BY prioridade ASC''',
        (cat,),
    ).fetchall()
    cam_list = [r['camara'] if isinstance(r, dict) else r[0] for r in camaras]
    if not cam_list:
        cam_list = [11, 12, 13]

    motivo = []

    if lote:
        row = conn.execute(
            f'''SELECT l.id, l.codigo_endereco, l.camara
                FROM {t_loc} l
                JOIN {t_pal} p ON p.localizacao_id = l.id
                JOIN {t_item} i ON i.palete_id = p.id
                WHERE i.sku = ? AND i.lote = ? AND l.status = 'ocupada'
                  AND (p.bloqueio_tipo IS NULL OR p.bloqueio_tipo = '')
                LIMIT 1''',
            (sku, lote),
        ).fetchone()
        if row:
            motivo.append('Mesmo produto e lote em posição existente (adensamento)')
            return {'localizacao_id': row['id'], 'codigo_endereco': row['codigo_endereco'], 'camara': row['camara'], 'motivo': motivo}

    for cam in cam_list:
        row = conn.execute(
            f'''SELECT id, codigo_endereco, camara FROM {t_loc}
                WHERE camara = ? AND status = 'vazia'
                  AND UPPER(TRIM(COALESCE(categoria_zona, ''))) = ?
                  AND (bloqueio_entrada IS FALSE OR bloqueio_entrada = 0)
                ORDER BY rua, posicao, nivel LIMIT 1''',
            (cam, cat),
        ).fetchone()
        if row:
            motivo.append(f'Zona categoria {cat} na câmara {cam}')
            return {
                'localizacao_id': row['id'],
                'codigo_endereco': row['codigo_endereco'],
                'camara': row['camara'],
                'motivo': motivo,
            }

    motivo.append('Nenhuma posição vazia nas câmaras do zoneamento')
    return {'localizacao_id': None, 'codigo_endereco': None, 'camara': None, 'motivo': motivo}


def _aplicar_bloqueios_palete(conn, palete_id, estado_fisico, data_validade, temperatura):
    bloqueios = []
    t_pal = _tbl(conn, 'wms_palete')
    if estado_fisico in ('avaria', 'deteriorado'):
        tipo = 'QC' if estado_fisico == 'avaria' else 'deteriorado'
        bloqueios.append(tipo)
        conn.execute(
            f'UPDATE {t_pal} SET bloqueio_tipo = ?, bloqueio_motivo = ?, status = ? WHERE id = ?',
            (tipo, f'Estado palete: {estado_fisico}', 'bloqueado', palete_id),
        )
    if data_validade:
        try:
            if isinstance(data_validade, str):
                dv = date.fromisoformat(data_validade[:10])
            else:
                dv = data_validade
            if dv < date.today():
                bloqueios.append('vencimento')
                conn.execute(
                    f'UPDATE {t_pal} SET bloqueio_tipo = ?, bloqueio_motivo = ?, status = ? WHERE id = ?',
                    ('vencimento', 'Data de validade expirada', 'bloqueado', palete_id),
                )
        except Exception:
            pass
    try:
        conn.commit()
    except Exception:
        conn.rollback()
    return bloqueios


@bp.route('/painel', methods=['GET'])
def api_wms_painel():
    conn = _db()
    ensure_wms_schema(conn)
    _seed_wms_defaults(conn)
    try:
        pesos = _pesos_categoria_produtos(conn)
        camaras = _ocupacao_camara(conn)
        dist_cat = _distribuicao_categoria(conn)
        t_mov = _tbl(conn, 'wms_movimentacao')
        t_rec = _tbl(conn, 'wms_recebimento')
        t_inv = _tbl(conn, 'wms_inventario')
        pendentes = conn.execute(
            f"SELECT COUNT(*) AS c FROM {t_mov} WHERE status = 'pendente'"
        ).fetchone()
        rec_abertos = conn.execute(
            f"SELECT COUNT(*) AS c FROM {t_rec} WHERE status NOT IN ('finalizado', 'cancelado')"
        ).fetchone()
        inv_ativos = conn.execute(
            f"SELECT COUNT(*) AS c FROM {t_inv} WHERE status = 'ativo'"
        ).fetchone()
        conn.close()
        return jsonify({
            'camaras': camaras,
            'distribuicao_categoria': dist_cat,
            'pesos_categoria': pesos,
            'movimentacoes_pendentes': _int_col(pendentes),
            'recebimentos_abertos': _int_col(rec_abertos),
            'inventarios_ativos': _int_col(inv_ativos),
        })
    except Exception as e:
        try:
            conn.close()
        except Exception:
            pass
        return jsonify({'erro': str(e)}), 500


@bp.route('/layout/gerar', methods=['POST'])
def api_wms_layout_gerar():
    conn = _db()
    ensure_wms_schema(conn)
    data = request.get_json() or {}
    force = bool(data.get('force'))
    try:
        result = gerar_layout_enderecos(conn, force=force)
        conn.close()
        return jsonify(result)
    except Exception as e:
        try:
            conn.rollback()
            conn.close()
        except Exception:
            pass
        return jsonify({'erro': str(e)}), 500


@bp.route('/localizacoes', methods=['GET'])
def api_wms_localizacoes():
    conn = _db()
    ensure_wms_schema(conn)
    camara = request.args.get('camara', type=int)
    status = (request.args.get('status') or '').strip()
    categoria = (request.args.get('categoria') or '').strip().upper()
    q = (request.args.get('q') or '').strip()
    t = _tbl(conn, 'wms_localizacao')
    sql = f'SELECT * FROM {t} WHERE 1=1'
    params = []
    if camara:
        sql += ' AND camara = ?'
        params.append(camara)
    if categoria:
        sql += ' AND UPPER(TRIM(categoria_zona)) = ?'
        params.append(categoria)
    if status:
        sql += ' AND status = ?'
        params.append(status)
    if q:
        sql += ' AND (codigo_endereco ILIKE ? OR rua ILIKE ?)' if _is_pg(conn) else ' AND (codigo_endereco LIKE ? OR rua LIKE ?)'
        params.extend([f'%{q}%', f'%{q}%'])
    sql += ' ORDER BY camara, rua, posicao, nivel LIMIT 500'
    try:
        rows = conn.execute(sql, tuple(params)).fetchall()
        conn.close()
        return jsonify({'localizacoes': [dict(r) for r in rows]})
    except Exception as e:
        try:
            conn.close()
        except Exception:
            pass
        return jsonify({'erro': str(e)}), 500


@bp.route('/produtos', methods=['GET'])
def api_wms_produtos():
    conn = _db()
    ensure_wms_schema(conn)
    cat = (request.args.get('categoria') or '').strip().upper()
    q = (request.args.get('q') or '').strip()
    t = _tbl(conn, 'wms_produto_enderecamento')
    sql = f'SELECT * FROM {t} WHERE {_ativo_sql(conn)}'
    params = []
    if cat:
        sql += ' AND categoria = ?'
        params.append(cat)
    if q:
        sql += ' AND (sku ILIKE ? OR descricao ILIKE ?)' if _is_pg(conn) else ' AND (sku LIKE ? OR descricao LIKE ?)'
        params.extend([f'%{q}%', f'%{q}%'])
    sql += ' ORDER BY categoria, sku LIMIT 1000'
    try:
        rows = conn.execute(sql, tuple(params)).fetchall()
        conn.close()
        return jsonify({'produtos': [dict(r) for r in rows]})
    except Exception as e:
        try:
            conn.close()
        except Exception:
            pass
        return jsonify({'erro': str(e)}), 500


@bp.route('/paletes', methods=['GET', 'POST'])
def api_wms_paletes():
    conn = _db()
    ensure_wms_schema(conn)
    t_pal = _tbl(conn, 'wms_palete')
    t_item = _tbl(conn, 'wms_palete_item')
    t_loc = _tbl(conn, 'wms_localizacao')

    if request.method == 'GET':
        etiqueta = (request.args.get('etiqueta') or '').strip()
        try:
            if etiqueta:
                pal = conn.execute(f'SELECT * FROM {t_pal} WHERE etiqueta = ?', (etiqueta,)).fetchone()
                if not pal:
                    conn.close()
                    return jsonify({'erro': 'Palete não encontrado.'}), 404
                itens = conn.execute(f'SELECT * FROM {t_item} WHERE palete_id = ?', (pal['id'],)).fetchall()
                loc = None
                if pal.get('localizacao_id'):
                    loc = conn.execute(f'SELECT * FROM {t_loc} WHERE id = ?', (pal['localizacao_id'],)).fetchone()
                conn.close()
                return jsonify({'palete': dict(pal), 'itens': [dict(i) for i in itens], 'localizacao': dict(loc) if loc else None})
            rows = conn.execute(
                f'''SELECT p.*, l.codigo_endereco
                    FROM {t_pal} p
                    LEFT JOIN {t_loc} l ON l.id = p.localizacao_id
                    ORDER BY p.id DESC LIMIT 200'''
            ).fetchall()
            conn.close()
            return jsonify({'paletes': [dict(r) for r in rows]})
        except Exception as e:
            try:
                conn.close()
            except Exception:
                pass
            return jsonify({'erro': str(e)}), 500

    data = request.get_json() or {}
    now = _now_iso()
    etiqueta = (data.get('etiqueta') or '').strip() or _gerar_etiqueta_palete()
    if len(etiqueta) != 22:
        conn.close()
        return jsonify({'erro': 'Etiqueta deve ter exatamente 22 caracteres.'}), 400
    try:
        if _is_pg(conn):
            cur = conn.execute(
                f'''INSERT INTO {t_pal} (etiqueta, status, estado_fisico, criado_em, atualizado_em, criado_por)
                    VALUES (?, ?, ?, NOW(), NOW(), ?) RETURNING id''',
                (etiqueta, data.get('status') or 'em_conferencia', data.get('estado_fisico') or 'bom', _usuario()),
            )
            pid = cur.fetchone()['id']
        else:
            conn.execute(
                f'''INSERT INTO {t_pal} (etiqueta, status, estado_fisico, criado_em, atualizado_em, criado_por)
                    VALUES (?, ?, ?, ?, ?, ?)''',
                (etiqueta, data.get('status') or 'em_conferencia', data.get('estado_fisico') or 'bom', now, now, _usuario()),
            )
            pid = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        for item in data.get('itens') or []:
            conn.execute(
                f'''INSERT INTO {t_item}
                    (palete_id, sku, descricao, lote, data_producao, data_validade, sif,
                     quantidade_caixas, peso_liquido, rg_caixa, criado_em)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                (
                    pid,
                    item.get('sku'),
                    item.get('descricao'),
                    item.get('lote'),
                    item.get('data_producao'),
                    item.get('data_validade'),
                    item.get('sif'),
                    int(item.get('quantidade_caixas') or 0),
                    item.get('peso_liquido'),
                    item.get('rg_caixa'),
                    now if not _is_pg(conn) else None,
                ),
            )
        conn.commit()
        conn.close()
        return jsonify({'ok': True, 'palete_id': pid, 'etiqueta': etiqueta})
    except Exception as e:
        try:
            conn.rollback()
            conn.close()
        except Exception:
            pass
        return jsonify({'erro': str(e)}), 500


@bp.route('/movimentacoes', methods=['GET', 'POST'])
def api_wms_movimentacoes():
    conn = _db()
    ensure_wms_schema(conn)
    t_mov = _tbl(conn, 'wms_movimentacao')
    t_pal = _tbl(conn, 'wms_palete')
    t_loc = _tbl(conn, 'wms_localizacao')

    if request.method == 'GET':
        status = (request.args.get('status') or 'pendente').strip()
        try:
            rows = conn.execute(
                f'''SELECT m.*, p.etiqueta,
                           lo.codigo_endereco AS origem,
                           ld.codigo_endereco AS destino
                    FROM {t_mov} m
                    JOIN {t_pal} p ON p.id = m.palete_id
                    LEFT JOIN {t_loc} lo ON lo.id = m.origem_localizacao_id
                    LEFT JOIN {t_loc} ld ON ld.id = m.destino_localizacao_id
                    WHERE m.status = ?
                    ORDER BY m.prioridade ASC, m.id ASC LIMIT 300''',
                (status,),
            ).fetchall()
            conn.close()
            return jsonify({'movimentacoes': [dict(r) for r in rows]})
        except Exception as e:
            try:
                conn.close()
            except Exception:
                pass
            return jsonify({'erro': str(e)}), 500

    data = request.get_json() or {}
    acao = (data.get('acao') or 'criar').strip()
    now = _now_iso()

    try:
        if acao == 'concluir':
            mov_id = data.get('id')
            if _is_pg(conn):
                conn.execute(
                    f'''UPDATE {t_mov} SET status = 'concluida', concluida_em = NOW(), concluida_por = ?
                        WHERE id = ?''',
                    (_usuario(), mov_id),
                )
            else:
                conn.execute(
                    f'''UPDATE {t_mov} SET status = 'concluida', concluida_em = ?, concluida_por = ? WHERE id = ?''',
                    (now, _usuario(), mov_id),
                )
            mov = _row_dict(conn.execute(f'SELECT * FROM {t_mov} WHERE id = ?', (mov_id,)).fetchone())
            if mov and mov.get('destino_localizacao_id'):
                dest = mov['destino_localizacao_id']
                pid = mov['palete_id']
                orig = mov.get('origem_localizacao_id')
                if orig:
                    if _is_pg(conn):
                        conn.execute(f"UPDATE {t_loc} SET status = 'vazia', atualizado_em = NOW() WHERE id = ?", (orig,))
                    else:
                        conn.execute(f"UPDATE {t_loc} SET status = 'vazia', atualizado_em = ? WHERE id = ?", (now, orig))
                if _is_pg(conn):
                    conn.execute(f"UPDATE {t_loc} SET status = 'ocupada', atualizado_em = NOW() WHERE id = ?", (dest,))
                    conn.execute(
                        f"UPDATE {t_pal} SET localizacao_id = ?, status = 'armazenado', atualizado_em = NOW() WHERE id = ?",
                        (dest, pid),
                    )
                else:
                    conn.execute(f"UPDATE {t_loc} SET status = 'ocupada', atualizado_em = ? WHERE id = ?", (now, dest))
                    conn.execute(
                        f'UPDATE {t_pal} SET localizacao_id = ?, status = ?, atualizado_em = ? WHERE id = ?',
                        (dest, 'armazenado', now, pid),
                    )
            conn.commit()
            conn.close()
            return jsonify({'ok': True})

        palete_id = data.get('palete_id')
        sku = (data.get('sku') or '').strip()
        lote = (data.get('lote') or '').strip() or None
        sugestao = _sugerir_putaway(conn, sku, lote) if sku else {}
        dest_id = data.get('destino_localizacao_id') or sugestao.get('localizacao_id')
        if not palete_id or not dest_id:
            conn.close()
            return jsonify({'erro': 'Informe palete_id e destino (ou SKU para sugestão automática).', 'sugestao': sugestao}), 400
        if _is_pg(conn):
            conn.execute(
                f'''INSERT INTO {t_mov} (tipo, palete_id, origem_localizacao_id, destino_localizacao_id,
                    status, prioridade, observacao, criado_em, criado_por)
                    VALUES (?, ?, ?, ?, 'pendente', ?, ?, NOW(), ?)''',
                (
                    data.get('tipo') or 'putaway',
                    palete_id,
                    data.get('origem_localizacao_id'),
                    dest_id,
                    int(data.get('prioridade') or 5),
                    data.get('observacao') or ('; '.join(sugestao.get('motivo') or [])),
                    _usuario(),
                ),
            )
        else:
            conn.execute(
                f'''INSERT INTO {t_mov} (tipo, palete_id, origem_localizacao_id, destino_localizacao_id,
                    status, prioridade, observacao, criado_em, criado_por)
                    VALUES (?, ?, ?, ?, 'pendente', ?, ?, ?, ?)''',
                (
                    data.get('tipo') or 'putaway',
                    palete_id,
                    data.get('origem_localizacao_id'),
                    dest_id,
                    int(data.get('prioridade') or 5),
                    data.get('observacao') or ('; '.join(sugestao.get('motivo') or [])),
                    now,
                    _usuario(),
                ),
            )
        conn.commit()
        conn.close()
        return jsonify({'ok': True, 'sugestao': sugestao})
    except Exception as e:
        try:
            conn.rollback()
            conn.close()
        except Exception:
            pass
        return jsonify({'erro': str(e)}), 500


@bp.route('/putaway/sugerir', methods=['POST'])
def api_wms_putaway_sugerir():
    data = request.get_json() or {}
    sku = (data.get('sku') or '').strip()
    if not sku:
        return jsonify({'erro': 'Informe SKU.'}), 400
    conn = _db()
    ensure_wms_schema(conn)
    try:
        sug = _sugerir_putaway(conn, sku, (data.get('lote') or '').strip() or None)
        conn.close()
        return jsonify(sug)
    except Exception as e:
        try:
            conn.close()
        except Exception:
            pass
        return jsonify({'erro': str(e)}), 500


@bp.route('/pesquisa-sku', methods=['GET'])
def api_wms_pesquisa_sku():
    q = (request.args.get('q') or '').strip()
    lote = (request.args.get('lote') or '').strip()
    conn = _db()
    ensure_wms_schema(conn)
    t_item = _tbl(conn, 'wms_palete_item')
    t_pal = _tbl(conn, 'wms_palete')
    t_loc = _tbl(conn, 'wms_localizacao')
    sql = f'''SELECT i.*, p.etiqueta, p.status AS palete_status, p.bloqueio_tipo, p.bloqueio_motivo,
                     p.temperatura, l.codigo_endereco, l.camara, l.status AS loc_status
              FROM {t_item} i
              JOIN {t_pal} p ON p.id = i.palete_id
              LEFT JOIN {t_loc} l ON l.id = p.localizacao_id
              WHERE 1=1'''
    params = []
    if q:
        if _is_pg(conn):
            sql += ' AND (i.sku ILIKE ? OR i.descricao ILIKE ? OR p.etiqueta ILIKE ? OR i.rg_caixa ILIKE ?)'
        else:
            sql += ' AND (i.sku LIKE ? OR i.descricao LIKE ? OR p.etiqueta LIKE ? OR i.rg_caixa LIKE ?)'
        params.extend([f'%{q}%'] * 4)
    if lote:
        sql += ' AND i.lote = ?'
        params.append(lote)
    sql += ' ORDER BY i.data_validade ASC NULLS LAST LIMIT 500' if _is_pg(conn) else ' ORDER BY i.data_validade ASC LIMIT 500'
    try:
        rows = conn.execute(sql, tuple(params)).fetchall()
        conn.close()
        return jsonify({'resultados': [dict(r) for r in rows]})
    except Exception as e:
        try:
            conn.close()
        except Exception:
            pass
        return jsonify({'erro': str(e)}), 500


@bp.route('/recebimentos', methods=['GET', 'POST'])
def api_wms_recebimentos():
    conn = _db()
    ensure_wms_schema(conn)
    _seed_wms_defaults(conn)
    t_rec = _tbl(conn, 'wms_recebimento')
    t_rp = _tbl(conn, 'wms_recebimento_palete')
    t_pal = _tbl(conn, 'wms_palete')
    t_item = _tbl(conn, 'wms_palete_item')
    t_mov = _tbl(conn, 'wms_movimentacao')
    t_cq = _tbl(conn, 'wms_check_qualidade')
    t_cqr = _tbl(conn, 'wms_check_qualidade_resposta')

    if request.method == 'GET':
        rid = request.args.get('id', type=int)
        try:
            if rid:
                rec = conn.execute(f'SELECT * FROM {t_rec} WHERE id = ?', (rid,)).fetchone()
                pals = conn.execute(
                    f'''SELECT rp.*, p.etiqueta, p.status
                        FROM {t_rp} rp JOIN {t_pal} p ON p.id = rp.palete_id
                        WHERE rp.recebimento_id = ?''',
                    (rid,),
                ).fetchall()
                perg = conn.execute(
                    f'SELECT * FROM {t_cq} WHERE contexto = ? AND {_ativo_sql(conn)} ORDER BY ordem',
                    ('recebimento',),
                ).fetchall()
                resp = conn.execute(f'SELECT * FROM {t_cqr} WHERE recebimento_id = ?', (rid,)).fetchall()
                conn.close()
                return jsonify({
                    'recebimento': dict(rec) if rec else None,
                    'paletes': [dict(p) for p in pals],
                    'perguntas': [dict(p) for p in perg],
                    'respostas': [dict(r) for r in resp],
                })
            rows = conn.execute(f'SELECT * FROM {t_rec} ORDER BY id DESC LIMIT 100').fetchall()
            conn.close()
            return jsonify({'recebimentos': [dict(r) for r in rows]})
        except Exception as e:
            try:
                conn.close()
            except Exception:
                pass
            return jsonify({'erro': str(e)}), 500

    data = request.get_json() or {}
    acao = (data.get('acao') or 'criar').strip()
    now = _now_iso()

    try:
        if acao == 'conferir_palete':
            rid = data.get('recebimento_id')
            etiqueta = (data.get('etiqueta') or '').strip() or _gerar_etiqueta_palete()
            if len(etiqueta) != 22:
                etiqueta = _gerar_etiqueta_palete()
            estado = data.get('estado_palete') or 'bom'
            item = data.get('item') or {}
            if _is_pg(conn):
                cur = conn.execute(
                    f'''INSERT INTO {t_pal} (etiqueta, status, estado_fisico, recebimento_id, criado_em, atualizado_em, criado_por)
                        VALUES (?, 'em_conferencia', ?, ?, NOW(), NOW(), ?) RETURNING id''',
                    (etiqueta, estado, rid, _usuario()),
                )
                pid = cur.fetchone()['id']
            else:
                conn.execute(
                    f'''INSERT INTO {t_pal} (etiqueta, status, estado_fisico, recebimento_id, criado_em, atualizado_em, criado_por)
                        VALUES (?, 'em_conferencia', ?, ?, ?, ?, ?)''',
                    (etiqueta, estado, rid, now, now, _usuario()),
                )
                pid = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
            conn.execute(
                f'''INSERT INTO {t_rp} (recebimento_id, palete_id, estado_palete, conferencia_cega)
                    VALUES (?, ?, ?, 1)''',
                (rid, pid, estado),
            )
            sku = (item.get('sku') or '').strip()
            conn.execute(
                f'''INSERT INTO {t_item}
                    (palete_id, sku, descricao, lote, data_producao, data_validade, sif,
                     quantidade_caixas, peso_liquido, rg_caixa, criado_em)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                (
                    pid, sku, item.get('descricao'), item.get('lote'),
                    item.get('data_producao'), item.get('data_validade'), item.get('sif'),
                    int(item.get('quantidade_caixas') or 0), item.get('peso_liquido'),
                    item.get('rg_caixa'), now,
                ),
            )
            bloqueios = _aplicar_bloqueios_palete(conn, pid, estado, item.get('data_validade'), item.get('temperatura'))
            if _is_pg(conn):
                conn.execute(f"UPDATE {t_rec} SET status = 'em_conferencia', atualizado_em = NOW() WHERE id = ?", (rid,))
            else:
                conn.execute(f"UPDATE {t_rec} SET status = 'em_conferencia', atualizado_em = ? WHERE id = ?", (now, rid))
            conn.commit()
            conn.close()
            return jsonify({'ok': True, 'palete_id': pid, 'etiqueta': etiqueta, 'bloqueios': bloqueios})

        if acao == 'finalizar':
            rid = data.get('recebimento_id')
            for resp in data.get('respostas') or []:
                conn.execute(
                    f'''INSERT INTO {t_cqr} (recebimento_id, pergunta_id, resposta, valor_numerico, respondido_em, respondido_por)
                        VALUES (?, ?, ?, ?, ?, ?)''',
                    (rid, resp.get('pergunta_id'), resp.get('resposta'), resp.get('valor_numerico'), now, _usuario()),
                )
            pals = conn.execute(
                f'SELECT palete_id FROM {t_rp} WHERE recebimento_id = ?', (rid,)
            ).fetchall()
            movs = 0
            for pr in pals:
                pid = pr['palete_id'] if isinstance(pr, dict) else pr[0]
                it = conn.execute(f'SELECT sku, lote FROM {t_item} WHERE palete_id = ? LIMIT 1', (pid,)).fetchone()
                if not it:
                    continue
                sku = it['sku'] if isinstance(it, dict) else it[0]
                lote = it['lote'] if isinstance(it, dict) else it[1]
                sug = _sugerir_putaway(conn, sku, lote)
                if sug.get('localizacao_id'):
                    conn.execute(
                        f'''INSERT INTO {t_mov} (tipo, palete_id, destino_localizacao_id, status, prioridade, observacao, criado_em, criado_por)
                            VALUES ('putaway', ?, ?, 'pendente', 3, ?, ?, ?)''',
                        (pid, sug['localizacao_id'], '; '.join(sug.get('motivo') or []), now, _usuario()),
                    )
                    if _is_pg(conn):
                        conn.execute(
                            f'''INSERT INTO {t_mov} (tipo, palete_id, destino_localizacao_id, status, prioridade, observacao, criado_em, criado_por)
                                VALUES ('putaway', ?, ?, 'pendente', 3, ?, NOW(), ?)''',
                            (pid, sug['localizacao_id'], '; '.join(sug.get('motivo') or []), _usuario()),
                        )
                    movs += 1
            if _is_pg(conn):
                conn.execute(
                    f"UPDATE {t_rec} SET status = 'aguardando_armazenagem', check_qualidade_ok = TRUE, atualizado_em = NOW() WHERE id = ?",
                    (rid,),
                )
            else:
                conn.execute(
                    f"UPDATE {t_rec} SET status = 'aguardando_armazenagem', check_qualidade_ok = 1, atualizado_em = ? WHERE id = ?",
                    (now, rid),
                )
            conn.commit()
            conn.close()
            return jsonify({'ok': True, 'movimentacoes_geradas': movs})

        if _is_pg(conn):
            cur = conn.execute(
                f'''INSERT INTO {t_rec} (numero_nf, fornecedor, placa, doca, origem, status, criado_em, atualizado_em, criado_por)
                    VALUES (?, ?, ?, ?, ?, 'aguardando', NOW(), NOW(), ?) RETURNING id''',
                (
                    data.get('numero_nf'), data.get('fornecedor'), data.get('placa'), data.get('doca'),
                    data.get('origem') or 'manual', _usuario(),
                ),
            )
            new_id = cur.fetchone()['id']
        else:
            conn.execute(
                f'''INSERT INTO {t_rec} (numero_nf, fornecedor, placa, doca, origem, status, criado_em, atualizado_em, criado_por)
                    VALUES (?, ?, ?, ?, ?, 'aguardando', ?, ?, ?)''',
                (
                    data.get('numero_nf'), data.get('fornecedor'), data.get('placa'), data.get('doca'),
                    data.get('origem') or 'manual', now, now, _usuario(),
                ),
            )
            new_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        conn.commit()
        conn.close()
        return jsonify({'ok': True, 'id': new_id})
    except Exception as e:
        try:
            conn.rollback()
            conn.close()
        except Exception:
            pass
        return jsonify({'erro': str(e)}), 500


@bp.route('/inventarios', methods=['GET', 'POST'])
def api_wms_inventarios():
    conn = _db()
    ensure_wms_schema(conn)
    t_inv = _tbl(conn, 'wms_inventario')
    t_lin = _tbl(conn, 'wms_inventario_linha')
    t_loc = _tbl(conn, 'wms_localizacao')

    if request.method == 'GET':
        iid = request.args.get('id', type=int)
        try:
            if iid:
                inv = conn.execute(f'SELECT * FROM {t_inv} WHERE id = ?', (iid,)).fetchone()
                linhas = conn.execute(
                    f'''SELECT il.*, l.codigo_endereco
                        FROM {t_lin} il
                        LEFT JOIN {t_loc} l ON l.id = il.localizacao_id
                        WHERE il.inventario_id = ?''',
                    (iid,),
                ).fetchall()
                conn.close()
                return jsonify({'inventario': dict(inv) if inv else None, 'linhas': [dict(x) for x in linhas]})
            rows = conn.execute(f'SELECT * FROM {t_inv} ORDER BY id DESC LIMIT 50').fetchall()
            conn.close()
            return jsonify({'inventarios': [dict(r) for r in rows]})
        except Exception as e:
            try:
                conn.close()
            except Exception:
                pass
            return jsonify({'erro': str(e)}), 500

    data = request.get_json() or {}
    acao = (data.get('acao') or 'criar').strip()
    now = _now_iso()
    try:
        if acao == 'contar':
            conn.execute(
                f'''INSERT INTO {t_lin}
                    (inventario_id, localizacao_id, palete_etiqueta, sku, status_esperado, status_informado,
                     quantidade_contada, divergencia, contado_em, contado_por)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                (
                    data.get('inventario_id'), data.get('localizacao_id'), data.get('palete_etiqueta'),
                    data.get('sku'), data.get('status_esperado'), data.get('status_informado'),
                    data.get('quantidade_contada'), 1 if data.get('divergencia') else 0,
                    now, _usuario(),
                ),
            )
            conn.commit()
            conn.close()
            return jsonify({'ok': True})

        tipo = data.get('tipo') or 'localizacao'
        desc = data.get('descricao') or f'Inventário {tipo}'
        if _is_pg(conn):
            cur = conn.execute(
                f"INSERT INTO {t_inv} (tipo, descricao, status, criado_em, criado_por) VALUES (?, ?, 'ativo', NOW(), ?) RETURNING id",
                (tipo, desc, _usuario()),
            )
            iid = cur.fetchone()['id']
        else:
            conn.execute(
                f"INSERT INTO {t_inv} (tipo, descricao, status, criado_em, criado_por) VALUES (?, ?, 'ativo', ?, ?)",
                (tipo, desc, now, _usuario()),
            )
            iid = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        filtro_cam = data.get('camara')
        sql_loc = f"SELECT id, status FROM {t_loc} WHERE 1=1"
        params = []
        if filtro_cam:
            sql_loc += ' AND camara = ?'
            params.append(filtro_cam)
        if tipo == 'vazio_ocupado_vazio':
            sql_loc += " AND status = 'vazia'"
        elif tipo == 'vazio_ocupado_ocupado':
            sql_loc += " AND status = 'ocupada'"
        locs = conn.execute(sql_loc, tuple(params)).fetchall()
        for loc in locs:
            ld = _row_dict(loc) or {}
            conn.execute(
                f'''INSERT INTO {t_lin} (inventario_id, localizacao_id, status_esperado)
                    VALUES (?, ?, ?)''',
                (iid, ld.get('id'), ld.get('status')),
            )
        conn.commit()
        conn.close()
        return jsonify({'ok': True, 'id': iid, 'linhas': len(locs)})
    except Exception as e:
        try:
            conn.rollback()
            conn.close()
        except Exception:
            pass
        return jsonify({'erro': str(e)}), 500


@bp.route('/zoneamento', methods=['GET'])
def api_wms_zoneamento():
    conn = _db()
    ensure_wms_schema(conn)
    _seed_wms_defaults(conn)
    t = _tbl(conn, 'wms_zoneamento')
    try:
        rows = conn.execute(
            f'''SELECT z.*, c.descricao AS camara_descricao
                FROM {t} z
                LEFT JOIN {_tbl(conn, "wms_camara")} c ON c.codigo = z.camara
                WHERE {_ativo_sql(conn, 'z')}
                ORDER BY z.categoria, z.prioridade'''
        ).fetchall()
        conn.close()
        return jsonify({'zoneamento': [dict(r) for r in rows]})
    except Exception as e:
        try:
            conn.close()
        except Exception:
            pass
        return jsonify({'erro': str(e)}), 500
