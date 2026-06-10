"""
Módulo WMS Endereçamento — localizações, paletes, putaway, recebimento e inventário.
"""
from __future__ import annotations

import json
import os
import re
import secrets
import string
from collections import Counter
from datetime import date, datetime, timezone

from flask import Blueprint, jsonify, make_response, render_template, request, session

bp = Blueprint('wms_enderecamento', __name__)

_get_db = None
_WMS_SCHEMA_READY = False


def init_wms_enderecamento(get_db_func):
    global _get_db
    _get_db = get_db_func
    try:
        conn = get_db_func()
        ensure_wms_schema(conn)
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


def _bind_bool(conn, val=True):
    """Valor booleano para INSERT/UPDATE (Postgres bool, SQLite 0/1)."""
    if _is_pg(conn):
        return bool(val)
    return 1 if val else 0


def _bloqueio_off_sql(conn, col):
    """Filtro sem bloqueio ativo (boolean Postgres, integer SQLite)."""
    if _is_pg(conn):
        return f'({col} IS NOT TRUE)'
    return f'({col} = 0 OR {col} IS NULL)'


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


def _ruas_camara(camara):
    cfg = _layout_camaras_config()
    for bloco in cfg.get('camaras') or []:
        if int(bloco['codigo']) == int(camara):
            return [str(r).strip().upper() for r in (bloco.get('ruas') or ['R'])]
    return ['R']


def _rua_para_apto(camara, rua):
    ruas = _ruas_camara(camara)
    r = str(rua or '').strip().upper()
    if r in ruas:
        return ruas.index(r) + 1
    return 1


def _apto_para_rua(camara, apto):
    ruas = _ruas_camara(camara)
    idx = int(apto) - 1
    if 0 <= idx < len(ruas):
        return ruas[idx]
    return ruas[0] if ruas else 'R'


def _barcode_longarina(camara, posicao, nivel, apto=None, rua=None):
    """Código da etiqueta colada na longarina (ex.: 21.13.1.1)."""
    apt = int(apto) if apto is not None else _rua_para_apto(camara, rua)
    return f'{int(camara)}.{int(posicao)}.{int(nivel)}.{apt}'


def _resolver_codigo_endereco_bip(codigo):
    """Aceita bip da etiqueta longarina (21.13.1.1) ou código interno (21-R-01-1)."""
    raw = (codigo or '').strip()
    if not raw:
        return None
    up = raw.upper()
    if re.match(r'^\d{2}-[A-Z]-\d{2}-\d+$', up):
        return up
    m = re.match(r'^(\d+)\.(\d+)\.(\d+)\.(\d+)$', raw)
    if m:
        cam, pos, niv, apto = (int(x) for x in m.groups())
        rua = _apto_para_rua(cam, apto)
        return _codigo_endereco(cam, rua, pos, niv)
    return None


_WMS_CAMARA_TOTAIS_PADRAO = {11: 138, 12: 134, 13: 138, 21: 82}


def _layout_camaras_config():
    path = os.path.join(os.path.dirname(__file__), 'data', 'wms_layout_camaras.json')
    if not os.path.isfile(path):
        return {
            'camaras': [
                {'codigo': 11, 'ruas': ['U', 'V'], 'niveis': 5, 'total_posicoes': 138},
                {'codigo': 12, 'ruas': ['X', 'Y'], 'niveis': 5, 'total_posicoes': 134},
                {'codigo': 13, 'ruas': ['W', 'Z'], 'niveis': 5, 'total_posicoes': 138},
                {'codigo': 21, 'ruas': ['R'], 'niveis': 5, 'total_posicoes': 82},
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
        coords = _gerar_coordenadas_camara(cod, bloco.get('ruas'), bloco.get('niveis', 5), total)
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


def _ensure_zona_armazenagem_column(conn):
    _ensure_categoria_zona_column(conn)
    if _is_pg(conn):
        try:
            conn.execute(
                'ALTER TABLE public.wms_localizacao ADD COLUMN IF NOT EXISTS zona_armazenagem TEXT'
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
            if 'zona_armazenagem' not in names:
                conn.execute('ALTER TABLE wms_localizacao ADD COLUMN zona_armazenagem TEXT')
                conn.commit()
        except Exception:
            pass
    t_loc = _tbl(conn, 'wms_localizacao')
    try:
        conn.execute(
            f"""UPDATE {t_loc} SET zona_armazenagem = CASE
                WHEN COALESCE(nivel, 0) = 1 THEN 'picking' ELSE 'pulmao' END
                WHERE zona_armazenagem IS NULL OR TRIM(zona_armazenagem) = ''"""
        )
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass


def _zona_por_nivel(nivel):
    return 'picking' if int(nivel or 0) == 1 else 'pulmao'


def _zona_label(zona):
    return 'PICKING' if (zona or '').lower() == 'picking' else 'PULMÃO'


def _format_locacao(loc):
    d = _row_dict(loc) or {}
    if not d:
        return {}
    zona = (d.get('zona_armazenagem') or _zona_por_nivel(d.get('nivel'))).lower()
    cam = d.get('camara')
    rua = d.get('rua')
    pos = d.get('posicao')
    niv = d.get('nivel')
    zl = _zona_label(zona)
    apto = _rua_para_apto(cam, rua)
    bc_long = _barcode_longarina(cam, pos, niv, apto=apto)
    return {
        **d,
        'zona_armazenagem': zona,
        'zona_label': zl,
        'texto': f'Rua {cam} · Prédio {pos} · Nív {niv} · Apto {apto} ({zl})',
        'barcode_longarina': bc_long,
        'rua_num': str(int(cam)),
        'predio': str(int(pos)),
        'apto': str(apto),
    }


def _tbl_romaneio(conn):
    return 'public.romaneio_por_item' if _is_pg(conn) else 'romaneio_por_item'


def _filtro_zona_sql(zona, alias=''):
    p = f'{alias}.' if alias else ''
    z = (zona or 'pulmao').lower()
    if z == 'picking':
        return f"({p}nivel = 1 OR LOWER(COALESCE({p}zona_armazenagem, '')) = 'picking')"
    return f"({p}nivel >= 2 OR LOWER(COALESCE({p}zona_armazenagem, '')) = 'pulmao')"


def _ensure_produto_planejamento_columns(conn):
    cols_pg = [
        ('pedido_med_abril', 'INTEGER'),
        ('pedido_max_abril', 'INTEGER'),
        ('media_5_dias', 'INTEGER'),
        ('estoque_ideal_max', 'INTEGER'),
        ('estoque_ideal_med', 'INTEGER'),
        ('estoque_ideal_min', 'INTEGER'),
        ('dias_estoque_max', 'SMALLINT'),
        ('dias_estoque_med', 'SMALLINT'),
        ('dias_estoque_min', 'SMALLINT'),
        ('posicoes_max', 'SMALLINT'),
        ('posicoes_med', 'SMALLINT'),
        ('posicoes_min', 'SMALLINT'),
        ('estoque_atual', 'INTEGER'),
        ('posicao_atual', 'SMALLINT'),
        ('status_condicional', 'TEXT'),
    ]
    if _is_pg(conn):
        for name, typ in cols_pg:
            try:
                conn.execute(f'ALTER TABLE public.wms_produto_enderecamento ADD COLUMN IF NOT EXISTS {name} {typ}')
            except Exception:
                try:
                    conn.rollback()
                except Exception:
                    pass
        try:
            conn.commit()
        except Exception:
            pass
    else:
        try:
            existing = conn.execute('PRAGMA table_info(wms_produto_enderecamento)').fetchall()
            names = {c[1] if not isinstance(c, dict) else c.get('name') for c in (existing or [])}
            for name, typ in cols_pg:
                if name not in names:
                    conn.execute(f'ALTER TABLE wms_produto_enderecamento ADD COLUMN {name} {typ}')
            conn.commit()
        except Exception:
            pass


def _ensure_wms_palete_controle_table(conn):
    t = _tbl(conn, 'wms_palete_controle')
    t_pal = _tbl(conn, 'wms_palete')
    t_loc = _tbl(conn, 'wms_localizacao')
    if _is_pg(conn):
        try:
            conn.execute(
                f'''CREATE TABLE IF NOT EXISTS {t} (
                    id BIGSERIAL PRIMARY KEY,
                    palete_id BIGINT NOT NULL REFERENCES {t_pal}(id) ON DELETE CASCADE,
                    tipo TEXT NOT NULL,
                    subtipo TEXT,
                    motivo TEXT,
                    destino_externo TEXT,
                    localizacao_id BIGINT REFERENCES {t_loc}(id) ON DELETE SET NULL,
                    codigo_endereco TEXT,
                    observacao TEXT,
                    registro_saida_id BIGINT REFERENCES {t}(id) ON DELETE SET NULL,
                    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    criado_por TEXT
                )'''
            )
            conn.execute(f'CREATE INDEX IF NOT EXISTS idx_wms_pal_ctrl_palete ON {t} (palete_id, criado_em DESC)')
            conn.commit()
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass
    else:
        try:
            conn.execute(
                '''CREATE TABLE IF NOT EXISTS wms_palete_controle (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    palete_id INTEGER NOT NULL,
                    tipo TEXT NOT NULL,
                    subtipo TEXT,
                    motivo TEXT,
                    destino_externo TEXT,
                    localizacao_id INTEGER,
                    codigo_endereco TEXT,
                    observacao TEXT,
                    registro_saida_id INTEGER,
                    criado_em TEXT NOT NULL,
                    criado_por TEXT
                )'''
            )
            conn.commit()
        except Exception:
            pass


def _ensure_wms_recebimento_terceiros_columns(conn):
    cols = [
        ('terceiros_documento_id', 'BIGINT' if _is_pg(conn) else 'INTEGER'),
        ('terceiros_area', 'TEXT'),
    ]
    t = _tbl(conn, 'wms_recebimento')
    if _is_pg(conn):
        for name, typ in cols:
            try:
                conn.execute(f'ALTER TABLE {t} ADD COLUMN IF NOT EXISTS {name} {typ}')
            except Exception:
                try:
                    conn.rollback()
                except Exception:
                    pass
        try:
            conn.commit()
        except Exception:
            pass
    else:
        try:
            existing = conn.execute('PRAGMA table_info(wms_recebimento)').fetchall()
            names = {c[1] if not isinstance(c, dict) else c.get('name') for c in (existing or [])}
            for name, typ in cols:
                if name not in names:
                    conn.execute(f'ALTER TABLE wms_recebimento ADD COLUMN {name} {typ}')
            conn.commit()
        except Exception:
            pass


def _normalizar_nf_wms(numero_nf):
    s = ''.join(c for c in str(numero_nf or '').strip() if c.isdigit())
    return s.lstrip('0') or '0'


def _terceiros_bool_sim_local(valor):
    if valor is True or valor == 1:
        return True
    return str(valor or '').strip().lower() in ('1', 'true', 'sim', 's', 'yes', 't')


def _tbl_terceiros_doc(conn):
    return 'public.terceiros_documentos' if _is_pg(conn) else 'terceiros_documentos'


def _tbl_terceiros_itens(conn):
    return 'public.terceiros_documento_itens' if _is_pg(conn) else 'terceiros_documento_itens'


def _tbl_terceiros_eventos(conn):
    return 'public.terceiros_documento_eventos' if _is_pg(conn) else 'terceiros_documento_eventos'


def _terceiros_tabelas_existem(conn):
    try:
        conn.execute(f'SELECT 1 FROM {_tbl_terceiros_doc(conn)} LIMIT 1')
        return True
    except Exception:
        return False


def _sku_terceiros_item(item):
    d = _row_dict(item) or item or {}
    for k in ('codigo_produto_base', 'codigo_produto_xml'):
        v = (d.get(k) or '').strip()
        if v:
            return v
    return ''


def _buscar_documento_terceiros_por_nf(conn, numero_nf):
    """Localiza NF no módulo descarga/recebimento (prioriza carreta em pendência)."""
    nf_norm = _normalizar_nf_wms(numero_nf)
    if not nf_norm or nf_norm == '0':
        return None, 'Informe o número da NF.'
    if not _terceiros_tabelas_existem(conn):
        return None, 'Módulo de descarga/recebimento não disponível neste banco.'
    t_doc = _tbl_terceiros_doc(conn)
    rows = conn.execute(
        f'''SELECT id, area, numero_nf, serie_nf, remetente_nome, remetente_cnpj,
                   placa_carreta, motorista_carreta, recebimento_concluido, previsao_chegada,
                   chave_nfe, destinatario_nome, criado_em
            FROM {t_doc}
            WHERE area IN ('carreta', 'recebimento', 'expedicao')
            ORDER BY criado_em DESC, id DESC
            LIMIT 1200'''
    ).fetchall()
    matches = []
    for r in rows or []:
        rd = _row_dict(r) or {}
        if _normalizar_nf_wms(rd.get('numero_nf')) == nf_norm:
            matches.append(rd)
    if not matches:
        return None, 'NF não encontrada no módulo de descarga/recebimento (carreta/recebimento).'
    matches.sort(key=lambda m: (
        1 if _terceiros_bool_sim_local(m.get('recebimento_concluido')) else 0,
        0 if (m.get('area') or '').lower() == 'carreta' else (
            1 if (m.get('area') or '').lower() == 'recebimento' else 2
        ),
        -int(m.get('id') or 0),
    ))
    doc = matches[0]
    t_it = _tbl_terceiros_itens(conn)
    itens_raw = conn.execute(
        f'''SELECT id, n_item, codigo_produto_xml, codigo_produto_base, descricao_xml, descricao_base,
                   quantidade_xml, quantidade_bipada, codigo_ean, unidade_xml
            FROM {t_it} WHERE documento_id = ? ORDER BY n_item, id''',
        (doc['id'],),
    ).fetchall()
    itens = []
    for it in itens_raw or []:
        rd = _row_dict(it) or {}
        q_xml = float(rd.get('quantidade_xml') or 0)
        q_bip = float(rd.get('quantidade_bipada') or 0)
        sku = _sku_terceiros_item(rd)
        itens.append({
            'id': rd.get('id'),
            'n_item': rd.get('n_item'),
            'sku': sku,
            'descricao': (rd.get('descricao_base') or rd.get('descricao_xml') or '').strip(),
            'quantidade_xml': q_xml,
            'quantidade_bipada': q_bip,
            'codigo_ean': rd.get('codigo_ean') or '',
            'unidade': rd.get('unidade_xml') or '',
        })
    area = (doc.get('area') or '').lower()
    return {
        'documento_id': doc['id'],
        'area': area,
        'numero_nf': doc.get('numero_nf') or '',
        'serie_nf': doc.get('serie_nf') or '',
        'fornecedor': (doc.get('remetente_nome') or '').strip(),
        'remetente_cnpj': doc.get('remetente_cnpj') or '',
        'placa': (doc.get('placa_carreta') or '').strip().upper(),
        'motorista': (doc.get('motorista_carreta') or '').strip(),
        'previsao_chegada': doc.get('previsao_chegada') or '',
        'recebimento_concluido': _terceiros_bool_sim_local(doc.get('recebimento_concluido')),
        'chave_nfe': doc.get('chave_nfe') or '',
        'itens': itens,
        'total_itens': len(itens),
        'quantidade_total_xml': round(sum(i['quantidade_xml'] for i in itens), 3),
    }, None


def _buscar_recebimento_wms_por_nf(conn, documento_id=None, numero_nf=None):
    t_rec = _tbl(conn, 'wms_recebimento')
    if documento_id:
        row = conn.execute(
            f'''SELECT id, status, numero_nf FROM {t_rec}
                WHERE terceiros_documento_id = ?
                ORDER BY id DESC LIMIT 1''',
            (int(documento_id),),
        ).fetchone()
        if row:
            return _row_dict(row) or {}
    nf = (numero_nf or '').strip()
    if nf:
        row = conn.execute(
            f'''SELECT id, status, numero_nf FROM {t_rec}
                WHERE numero_nf = ?
                ORDER BY id DESC LIMIT 1''',
            (nf,),
        ).fetchone()
        if row:
            return _row_dict(row) or {}
    return None


def _quantidades_wms_recebimento(conn, recebimento_id):
    if not recebimento_id:
        return {}
    t_rp = _tbl(conn, 'wms_recebimento_palete')
    t_item = _tbl(conn, 'wms_palete_item')
    rows = conn.execute(
        f'''SELECT i.sku, SUM(COALESCE(i.quantidade_caixas, 0)) AS qtd
            FROM {t_rp} rp
            JOIN {t_item} i ON i.palete_id = rp.palete_id
            WHERE rp.recebimento_id = ?
            GROUP BY i.sku''',
        (int(recebimento_id),),
    ).fetchall()
    out = {}
    for r in rows or []:
        rd = _row_dict(r) or {}
        sku = (rd.get('sku') or '').strip()
        if sku:
            out[sku.upper()] = float(rd.get('qtd') or 0)
    return out


def _enriquecer_documento_nf_wms(conn, doc):
    if not doc:
        return doc
    rec = _buscar_recebimento_wms_por_nf(conn, doc.get('documento_id'), doc.get('numero_nf'))
    doc = dict(doc)
    doc['recebimento_wms_id'] = rec.get('id') if rec else None
    doc['recebimento_wms_status'] = rec.get('status') if rec else None
    qtd_wms = _quantidades_wms_recebimento(conn, doc.get('recebimento_wms_id'))
    itens = []
    for it in doc.get('itens') or []:
        rd = dict(it)
        sku = (rd.get('sku') or '').strip()
        q_wms = qtd_wms.get(sku.upper(), 0) if sku else 0
        rd['quantidade_wms'] = q_wms
        rd['pendente_wms'] = max(float(rd.get('quantidade_xml') or 0) - q_wms, 0)
        rd['status_wms'] = 'ok' if q_wms >= float(rd.get('quantidade_xml') or 0) and float(rd.get('quantidade_xml') or 0) > 0 else (
            'parcial' if q_wms > 0 else 'pendente'
        )
        itens.append(rd)
    doc['itens'] = itens
    return doc


def _codigo_barras_produto_nf(item):
    ean = ''.join(c for c in str((item or {}).get('codigo_ean') or '').strip() if c.isdigit())
    sku = (item or {}).get('sku') or ''
    if len(ean) in (8, 12, 13, 14):
        fmt = 'EAN13' if len(ean) == 13 else ('EAN8' if len(ean) == 8 else 'CODE128')
        return ean, fmt
    if sku:
        return str(sku).strip(), 'CODE128'
    return ean or '0', 'CODE128'


def _itens_para_etiquetas_nf(doc, sku_filtro=None, n_item_filtro=None):
    itens_out = []
    for it in doc.get('itens') or []:
        sku = (it.get('sku') or '').strip()
        n_item = it.get('n_item')
        if sku_filtro and sku.upper() != str(sku_filtro).strip().upper():
            continue
        if n_item_filtro is not None and str(n_item) != str(n_item_filtro):
            continue
        cod, fmt = _codigo_barras_produto_nf(it)
        q = float(it.get('quantidade_xml') or 0)
        itens_out.append({
            'n_item': n_item,
            'sku': sku,
            'descricao': it.get('descricao') or '',
            'codigo_ean': it.get('codigo_ean') or '',
            'codigo_barras': cod,
            'formato_barras': fmt,
            'quantidade_xml_fmt': int(q) if q == int(q) else q,
            'unidade': it.get('unidade') or 'UN',
        })
    return itens_out


def _html_etiquetas_produto_nf(doc, auto_print=True, sku_filtro=None, n_item_filtro=None):
    itens = _itens_para_etiquetas_nf(doc, sku_filtro=sku_filtro, n_item_filtro=n_item_filtro)
    return render_template(
        'wms/etiquetas_produto_nf.html',
        numero_nf=doc.get('numero_nf') or '',
        fornecedor=doc.get('fornecedor') or '',
        itens=itens,
        total=len(itens),
        auto_print=auto_print,
    )


def _concluir_terceiros_recebimento_wms(conn, documento_id, usuario=None):
    """Marca recebimento_concluido no módulo terceiros/descarga (sai da pendência)."""
    if not documento_id or not _terceiros_tabelas_existem(conn):
        return False, 'Documento terceiros indisponível.'
    t_doc = _tbl_terceiros_doc(conn)
    t_ev = _tbl_terceiros_eventos(conn)
    row = conn.execute(
        f'SELECT id, recebimento_concluido FROM {t_doc} WHERE id = ?', (int(documento_id),)
    ).fetchone()
    if not row:
        return False, 'Documento terceiros não encontrado.'
    rd = _row_dict(row) or {}
    if _terceiros_bool_sim_local(rd.get('recebimento_concluido')):
        return True, None
    user = (usuario or _usuario() or 'wms').strip()
    now = _now_iso()
    if _is_pg(conn):
        conn.execute(
            f'''UPDATE {t_doc} SET recebimento_concluido = TRUE, recebimento_concluido_em = NOW(),
                recebimento_concluido_por = ?, atualizado_em = NOW(), atualizado_por = ? WHERE id = ?''',
            (user, user, int(documento_id)),
        )
    else:
        conn.execute(
            f'''UPDATE {t_doc} SET recebimento_concluido = 1, recebimento_concluido_em = ?,
                recebimento_concluido_por = ?, atualizado_em = ?, atualizado_por = ? WHERE id = ?''',
            (now, user, now, user, int(documento_id)),
        )
    try:
        conn.execute(
            f'''INSERT INTO {t_ev} (documento_id, evento, valor_anterior, valor_novo, usuario, criado_em, detalhes)
                VALUES (?, 'recebimento_concluido', '0', '1', ?, ?, 'via_wms_enderecamento')''',
            (int(documento_id), user, now),
        )
    except Exception:
        pass
    return True, None


def _pesos_categoria_produtos(conn):
    """Peso de cada categoria pela soma de posições médias (planejamento)."""
    _ensure_produto_planejamento_columns(conn)
    t = _tbl(conn, 'wms_produto_enderecamento')
    rows = conn.execute(
        f'''SELECT UPPER(SUBSTR(categoria, 1, 1)) AS cat,
                   SUM(COALESCE(NULLIF(posicoes_med, 0), 1)) AS n
            FROM {t}
            WHERE {_ativo_sql(conn)}
            GROUP BY UPPER(SUBSTR(categoria, 1, 1))'''
    ).fetchall()
    pesos = {}
    for r in rows:
        d = _row_dict(r) or {}
        cat = (d.get('cat') or 'C').strip().upper()
        if cat in ('A', 'B', 'C', 'D'):
            pesos[cat] = int(float(d.get('n') or 0))
    if not pesos:
        rows = conn.execute(
            f'''SELECT UPPER(SUBSTR(categoria, 1, 1)) AS cat, COUNT(*) AS n
                FROM {t} WHERE {_ativo_sql(conn)}
                GROUP BY UPPER(SUBSTR(categoria, 1, 1))'''
        ).fetchall()
        for r in rows:
            d = _row_dict(r) or {}
            cat = (d.get('cat') or 'C').strip().upper()
            if cat in ('A', 'B', 'C', 'D'):
                pesos[cat] = int(d.get('n') or 0)
    if not pesos:
        pesos = {'A': 1, 'B': 1, 'C': 1, 'D': 1}
    return pesos


def _calcular_status_condicional(pos_wms, pos_min, pos_med, pos_max, qtd_wms=0, est_min=0, est_med=0, est_max=0):
    """Status Verde/Amarelo/Vermelho/Excedido a partir do estoque WMS vs metas planejadas."""
    pos_wms = int(pos_wms or 0)
    pos_min = int(pos_min or 0)
    pos_med = int(pos_med or 0)
    pos_max = int(pos_max or 0)
    if pos_max > 0 or pos_med > 0 or pos_min > 0:
        if pos_max > 0 and pos_wms > pos_max:
            return 'Excedido'
        if pos_min > 0 and pos_wms < pos_min:
            return 'Vermelho'
        if pos_med > 0 and pos_wms < pos_med:
            return 'Amarelo'
        return 'Verde'
    qtd = int(qtd_wms or 0)
    est_min = int(est_min or 0)
    est_med = int(est_med or 0)
    est_max = int(est_max or 0)
    if est_max > 0 and qtd > est_max:
        return 'Excedido'
    if est_min > 0 and qtd < est_min:
        return 'Vermelho'
    if est_med > 0 and qtd < est_med:
        return 'Amarelo'
    return 'Verde' if qtd > 0 else 'Verde'


def _info_produto_wms(conn, sku, prod=None):
    """Fonte única de verdade: estoque/posições/status sempre do WMS endereçado (paletes armazenados)."""
    _ensure_produto_planejamento_columns(conn)
    t_prod = _tbl(conn, 'wms_produto_enderecamento')
    if prod is None:
        prod = conn.execute(
            f'SELECT * FROM {t_prod} WHERE sku = ? AND {_ativo_sql(conn)} LIMIT 1',
            (sku,),
        ).fetchone()
    pd = _row_dict(prod) or {}
    metricas = _metricas_sku_wms(conn, sku)
    pos_wms = metricas['posicoes_wms']
    qtd_wms = metricas['quantidade_wms']
    status = _calcular_status_condicional(
        pos_wms,
        pd.get('posicoes_min'),
        pd.get('posicoes_med'),
        pd.get('posicoes_max'),
        qtd_wms,
        pd.get('estoque_ideal_min'),
        pd.get('estoque_ideal_med'),
        pd.get('estoque_ideal_max'),
    )
    return {
        **pd,
        'sku': sku,
        'estoque_atual': qtd_wms,
        'posicao_atual': pos_wms,
        'status_condicional': status,
        'posicoes_wms': pos_wms,
        'quantidade_wms': qtd_wms,
    }


def _sync_all_produtos_estoque_cache(conn):
    """Recalcula cache de todos os SKUs a partir do estoque WMS real."""
    t_prod = _tbl(conn, 'wms_produto_enderecamento')
    rows = conn.execute(f'SELECT sku FROM {t_prod} WHERE {_ativo_sql(conn)}').fetchall()
    n = 0
    for r in rows:
        sku = (_row_dict(r) or {}).get('sku') or (r[0] if not isinstance(r, dict) else None)
        if sku:
            _sync_produto_estoque_cache(conn, str(sku).strip())
            n += 1
    return n


def _aplicar_estoque_real_dict(conn, d, sku=None):
    """Substitui estoque/status no dict pelos valores reais do WMS."""
    sku = (sku or d.get('sku') or '').strip()
    if not sku:
        d['fonte_estoque'] = 'wms'
        return d
    info = _info_produto_wms(conn, sku)
    d['estoque_atual'] = info.get('estoque_atual', 0)
    d['posicao_atual'] = info.get('posicao_atual', 0)
    d['status_condicional'] = info.get('status_condicional')
    d['quantidade_wms'] = info.get('quantidade_wms', 0)
    d['posicoes_wms'] = info.get('posicoes_wms', 0)
    d['fonte_estoque'] = 'wms'
    return d


def _sync_produto_estoque_cache(conn, sku):
    """Grava cache de estoque/status após bipagem + armazenagem."""
    t_prod = _tbl(conn, 'wms_produto_enderecamento')
    existe = conn.execute(f'SELECT sku FROM {t_prod} WHERE sku = ? LIMIT 1', (sku,)).fetchone()
    info = _info_produto_wms(conn, sku)
    if not existe:
        return info
    now = _now_iso()
    if _is_pg(conn):
        conn.execute(
            f'''UPDATE {t_prod} SET estoque_atual = ?, posicao_atual = ?, status_condicional = ?,
                atualizado_em = NOW() WHERE sku = ?''',
            (info['estoque_atual'], info['posicao_atual'], info['status_condicional'], sku),
        )
    else:
        conn.execute(
            f'''UPDATE {t_prod} SET estoque_atual = ?, posicao_atual = ?, status_condicional = ?,
                atualizado_em = ? WHERE sku = ?''',
            (info['estoque_atual'], info['posicao_atual'], info['status_condicional'], now, sku),
        )
    return info


def _skus_do_palete(conn, palete_id):
    t_item = _tbl(conn, 'wms_palete_item')
    rows = conn.execute(
        f'SELECT DISTINCT sku FROM {t_item} WHERE palete_id = ? AND sku IS NOT NULL',
        (palete_id,),
    ).fetchall()
    out = []
    for r in rows:
        s = (_row_dict(r) or {}).get('sku') or (r[0] if not isinstance(r, dict) else None)
        if s and str(s).strip():
            out.append(str(s).strip())
    return out


def _resumo_status_planejamento(conn):
    """Resumo rápido a partir do cache (status recalculado na armazenagem)."""
    t_prod = _tbl(conn, 'wms_produto_enderecamento')
    rows = conn.execute(
        f'''SELECT COALESCE(NULLIF(TRIM(status_condicional), ''), 'Verde') AS st, COUNT(*) AS c
            FROM {t_prod} WHERE {_ativo_sql(conn)}
            GROUP BY COALESCE(NULLIF(TRIM(status_condicional), ''), 'Verde')'''
    ).fetchall()
    out = {}
    for r in rows:
        rd = _row_dict(r) or {}
        st = rd.get('st') or 'Verde'
        out[st] = int(rd.get('c') or 0)
    return out


def _prioridade_status_condicional(status):
    s = (status or '').strip().lower()
    if s == 'vermelho':
        return 0
    if s == 'amarelo':
        return 1
    if s == 'verde':
        return 2
    if s == 'excedido':
        return 3
    return 2


def _metricas_sku_wms(conn, sku):
    """Posições ocupadas e quantidade total do SKU no estoque endereçado."""
    t_item = _tbl(conn, 'wms_palete_item')
    t_pal = _tbl(conn, 'wms_palete')
    t_loc = _tbl(conn, 'wms_localizacao')
    row = conn.execute(
        f'''SELECT COUNT(DISTINCT l.id) AS posicoes,
                   COALESCE(SUM(i.quantidade_caixas), 0) AS qtd
            FROM {t_item} i
            JOIN {t_pal} p ON p.id = i.palete_id
            JOIN {t_loc} l ON l.id = p.localizacao_id
            WHERE i.sku = ? AND p.status = 'armazenado'
              AND l.status = 'ocupada'
              AND (p.bloqueio_tipo IS NULL OR p.bloqueio_tipo = '')''',
        (sku,),
    ).fetchone()
    d = _row_dict(row) or {}
    return {
        'posicoes_wms': int(d.get('posicoes') or 0),
        'quantidade_wms': int(d.get('qtd') or 0),
    }


def _rua_cluster_sku(conn, sku, cat):
    """Rua com maior concentração do SKU (adensamento por coluna)."""
    t_item = _tbl(conn, 'wms_palete_item')
    t_pal = _tbl(conn, 'wms_palete')
    t_loc = _tbl(conn, 'wms_localizacao')
    row = conn.execute(
        f'''SELECT l.camara, l.rua, COUNT(*) AS n
            FROM {t_loc} l
            JOIN {t_pal} p ON p.localizacao_id = l.id
            JOIN {t_item} i ON i.palete_id = p.id
            WHERE i.sku = ? AND l.status = 'ocupada'
              AND UPPER(TRIM(COALESCE(l.categoria_zona, ''))) = ?
              AND (p.bloqueio_tipo IS NULL OR p.bloqueio_tipo = '')
            GROUP BY l.camara, l.rua
            ORDER BY n DESC, l.rua
            LIMIT 1''',
        (sku, cat),
    ).fetchone()
    return _row_dict(row) or {}


def _rua_cluster_categoria(conn, cat, camaras=None):
    """Rua com maior concentração da categoria (produtos da mesma família perto)."""
    t_pal = _tbl(conn, 'wms_palete')
    t_loc = _tbl(conn, 'wms_localizacao')
    params = [cat]
    filtro_cam = ''
    if camaras:
        placeholders = ','.join('?' * len(camaras))
        filtro_cam = f' AND l.camara IN ({placeholders})'
        params.extend(camaras)
    row = conn.execute(
        f'''SELECT l.camara, l.rua, COUNT(*) AS n
            FROM {t_loc} l
            JOIN {t_pal} p ON p.localizacao_id = l.id
            WHERE l.status = 'ocupada'
              AND UPPER(TRIM(COALESCE(l.categoria_zona, ''))) = ?
              AND (p.bloqueio_tipo IS NULL OR p.bloqueio_tipo = '')
              {filtro_cam}
            GROUP BY l.camara, l.rua
            ORDER BY n DESC, l.rua
            LIMIT 1''',
        tuple(params),
    ).fetchone()
    return _row_dict(row) or {}


def _anchor_fifo_sku(conn, sku, cat):
    """Endereço do estoque mais antigo do SKU (referência FIFO na armazenagem)."""
    t_item = _tbl(conn, 'wms_palete_item')
    t_pal = _tbl(conn, 'wms_palete')
    t_loc = _tbl(conn, 'wms_localizacao')
    order_fifo = 'i.data_producao ASC NULLS LAST, i.data_validade ASC NULLS LAST, l.rua, l.posicao, l.nivel'
    if not _is_pg(conn):
        order_fifo = 'i.data_producao ASC, i.data_validade ASC, l.rua, l.posicao, l.nivel'
    row = conn.execute(
        f'''SELECT l.camara, l.rua, l.posicao, l.nivel, i.data_producao
            FROM {t_loc} l
            JOIN {t_pal} p ON p.localizacao_id = l.id
            JOIN {t_item} i ON i.palete_id = p.id
            WHERE i.sku = ? AND l.status = 'ocupada'
              AND UPPER(TRIM(COALESCE(l.categoria_zona, ''))) = ?
              AND i.data_producao IS NOT NULL
              AND (p.bloqueio_tipo IS NULL OR p.bloqueio_tipo = '')
            ORDER BY {order_fifo}
            LIMIT 1''',
        (sku, cat),
    ).fetchone()
    return _row_dict(row) or {}


def _buscar_vaga_vazia_putaway(conn, cat, cam_list, zona, order_prefix, order_params, motivo, prioridade):
    """Primeira posição vazia nas câmaras do zoneamento, com ordenação de prioridade."""
    t_loc = _tbl(conn, 'wms_localizacao')
    zona_sql = _filtro_zona_sql(zona, 'l')
    prefix = (order_prefix + ', ') if order_prefix else ''
    for cam in cam_list:
        row = conn.execute(
            f'''SELECT l.id, l.codigo_endereco, l.camara, l.rua, l.posicao, l.nivel, l.zona_armazenagem
                FROM {t_loc} l
                WHERE l.camara = ? AND l.status = 'vazia'
                  AND UPPER(TRIM(COALESCE(l.categoria_zona, ''))) = ?
                  AND {zona_sql}
                  AND {_bloqueio_off_sql(conn, 'l.bloqueio_entrada')}
                ORDER BY {prefix}l.rua, l.posicao, l.nivel
                LIMIT 1''',
            tuple([cam, cat, *order_params]),
        ).fetchone()
        if row:
            motivo.append(f'Câmara {cam} — posição vazia (prioridade: {prioridade})')
            loc = _format_locacao(row)
            return loc, prioridade
    return None, None


def _putaway_resposta(loc, motivo, status, pos_wms, pos_med, alerta, prioridade):
    if not loc:
        return {
            'localizacao_id': None,
            'codigo_endereco': None,
            'camara': None,
            'zona_label': None,
            'texto': None,
            'motivo': motivo,
            'status_condicional': status,
            'posicoes_wms': pos_wms,
            'posicoes_planejadas': pos_med,
            'alerta': alerta,
            'prioridade': prioridade,
        }
    return {
        'localizacao_id': loc.get('id'),
        'codigo_endereco': loc.get('codigo_endereco'),
        'barcode_longarina': loc.get('barcode_longarina'),
        'camara': loc.get('camara'),
        'zona_armazenagem': loc.get('zona_armazenagem'),
        'zona_label': loc.get('zona_label'),
        'texto': loc.get('texto'),
        'motivo': motivo,
        'status_condicional': status,
        'posicoes_wms': pos_wms,
        'posicoes_planejadas': pos_med,
        'alerta': alerta,
        'prioridade': prioridade,
    }


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
    """Gera (camara, rua, posicao, nivel) — coluna cheia com todos os níveis antes da próxima."""
    ruas = [str(r).strip().upper() for r in (ruas or ['A']) if str(r).strip()] or ['A']
    niveis = max(1, int(niveis or 5))
    out = []
    base = total // len(ruas)
    extra = total % len(ruas)
    for idx, rua in enumerate(ruas):
        slots_rua = base + (1 if idx < extra else 0)
        pos = 1
        i = 0
        while i < slots_rua:
            for niv in range(1, niveis + 1):
                if i >= slots_rua:
                    break
                out.append((int(camara), rua, pos, niv))
                i += 1
            pos += 1
    return out[:total]


def _layout_niveis_esperados():
    return {
        int(b['codigo']): max(1, int(b.get('niveis') or 5))
        for b in (_layout_camaras_config().get('camaras') or [])
    }


def _precisa_regenerar_layout_niveis(conn):
    """Só regera quando falta nível 4/5 no banco (ex.: layout antigo com max=3)."""
    if not _wms_tabelas_existem(conn):
        return False
    t_loc = _tbl(conn, 'wms_localizacao')
    esperados = _layout_niveis_esperados()
    if not esperados:
        return False
    total = _int_col(conn.execute(f'SELECT COUNT(*) AS c FROM {t_loc}').fetchone(), 'c')
    if total <= 0:
        return True
    for cam, n_esp in esperados.items():
        row = conn.execute(
            f'SELECT MAX(nivel) AS mx FROM {t_loc} WHERE camara = ?', (cam,),
        ).fetchone()
        mx = int((_row_dict(row) or {}).get('mx') or 0)
        if mx < n_esp:
            return True
    return False


def _ensure_layout_enderecos_atualizado(conn):
    """Gera endereços se vazio; regera com force se níveis do banco ≠ layout JSON (ex.: 3 → 5)."""
    t_loc = _tbl(conn, 'wms_localizacao')
    total = _int_col(conn.execute(f'SELECT COUNT(*) AS c FROM {t_loc}').fetchone(), 'c')
    if total <= 0:
        gerar_layout_enderecos(conn, force=False)
    elif _precisa_regenerar_layout_niveis(conn):
        gerar_layout_enderecos(conn, force=True)
    try:
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return _int_col(conn.execute(f'SELECT COUNT(*) AS c FROM {t_loc}').fetchone(), 'c')


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
        coords = _gerar_coordenadas_camara(cod, bloco.get('ruas'), bloco.get('niveis', 5), total)
        codigos_validos = []
        for i, (cam, rua, pos, nivel) in enumerate(coords):
            cat_z = seq_cat[i] if i < len(seq_cat) else cats[0]
            cod_end = _codigo_endereco(cam, rua, pos, nivel)
            zona = _zona_por_nivel(nivel)
            codigos_validos.append(cod_end)
            if _is_pg(conn):
                conn.execute(
                    f'''INSERT INTO {t_loc}
                        (camara, rua, posicao, nivel, codigo_endereco, status, area, categoria_zona, zona_armazenagem)
                        VALUES (?, ?, ?, ?, ?, 'vazia', ?, ?, ?)
                        ON CONFLICT (codigo_endereco) DO UPDATE SET
                          area = EXCLUDED.area,
                          categoria_zona = EXCLUDED.categoria_zona,
                          zona_armazenagem = EXCLUDED.zona_armazenagem,
                          atualizado_em = NOW()''',
                    (cam, rua, pos, nivel, cod_end, cat_z, cat_z, zona),
                )
            else:
                conn.execute(
                    f'''INSERT INTO {t_loc}
                        (camara, rua, posicao, nivel, codigo_endereco, status, area, categoria_zona, zona_armazenagem,
                         criado_em, atualizado_em)
                        VALUES (?, ?, ?, ?, ?, 'vazia', ?, ?, ?, ?, ?)
                        ON CONFLICT (codigo_endereco) DO UPDATE SET
                          area = excluded.area,
                          categoria_zona = excluded.categoria_zona,
                          zona_armazenagem = excluded.zona_armazenagem,
                          atualizado_em = excluded.atualizado_em''',
                    (cam, rua, pos, nivel, cod_end, cat_z, cat_z, zona, now, now),
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
    return [_row_dict(r) or {} for r in rows]


def _listar_zoneamento(conn):
    t = _tbl(conn, 'wms_zoneamento')
    rows = conn.execute(
        f'''SELECT z.categoria, z.camara, z.prioridade, c.descricao AS camara_descricao
            FROM {t} z
            LEFT JOIN {_tbl(conn, "wms_camara")} c ON c.codigo = z.camara
            WHERE {_ativo_sql(conn, 'z')}
            ORDER BY z.categoria, z.prioridade'''
    ).fetchall()
    out = []
    for r in rows:
        rd = _row_dict(r) or {}
        out.append({
            'categoria': rd.get('categoria'),
            'camara': rd.get('camara'),
            'prioridade': rd.get('prioridade'),
            'camara_descricao': rd.get('camara_descricao'),
        })
    return out


def _ensure_layout_enderecos(conn):
    """Gera endereços se ainda não existirem (primeira carga do WMS)."""
    t_loc = _tbl(conn, 'wms_localizacao')
    total = _int_col(conn.execute(f'SELECT COUNT(*) AS c FROM {t_loc}').fetchone(), 'c')
    if total > 0:
        return total
    gerar_layout_enderecos(conn, force=False)
    try:
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    return _int_col(conn.execute(f'SELECT COUNT(*) AS c FROM {t_loc}').fetchone(), 'c')


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
        _ensure_zona_armazenagem_column(conn)
        _ensure_produto_planejamento_columns(conn)
        _ensure_wms_recebimento_terceiros_columns(conn)
        _ensure_wms_palete_controle_table(conn)
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
    _ensure_produto_planejamento_columns(conn)
    _ensure_wms_palete_controle_table(conn)
    _WMS_SCHEMA_READY = True


def _obter_palete_por_etiqueta(conn, etiqueta):
    etiqueta = (etiqueta or '').strip()
    if not etiqueta:
        return None
    t_pal = _tbl(conn, 'wms_palete')
    row = conn.execute(f'SELECT * FROM {t_pal} WHERE etiqueta = ?', (etiqueta,)).fetchone()
    if not row and len(etiqueta) == 22:
        row = conn.execute(f'SELECT * FROM {t_pal} WHERE UPPER(etiqueta) = ?', (etiqueta.upper(),)).fetchone()
    return _row_dict(row)


def _saida_aberta_palete(conn, palete_id):
    t = _tbl(conn, 'wms_palete_controle')
    row = conn.execute(
        f'''SELECT c.* FROM {t} c
            WHERE c.palete_id = ? AND c.tipo = 'saida'
              AND NOT EXISTS (
                SELECT 1 FROM {t} r
                WHERE r.tipo = 'retorno' AND r.registro_saida_id = c.id
              )
            ORDER BY c.id DESC LIMIT 1''',
        (int(palete_id),),
    ).fetchone()
    return _row_dict(row)


def _registrar_controle_palete(
    conn, palete_id, tipo, subtipo=None, motivo=None, destino_externo=None,
    localizacao_id=None, codigo_endereco=None, observacao=None, registro_saida_id=None,
):
    t = _tbl(conn, 'wms_palete_controle')
    user = _usuario()
    now = _now_iso()
    if _is_pg(conn):
        cur = conn.execute(
            f'''INSERT INTO {t}
                (palete_id, tipo, subtipo, motivo, destino_externo, localizacao_id,
                 codigo_endereco, observacao, registro_saida_id, criado_em, criado_por)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?) RETURNING id''',
            (
                int(palete_id), tipo, subtipo, motivo, destino_externo,
                localizacao_id, codigo_endereco, observacao, registro_saida_id, user,
            ),
        )
        rid = cur.fetchone()['id']
    else:
        conn.execute(
            f'''INSERT INTO {t}
                (palete_id, tipo, subtipo, motivo, destino_externo, localizacao_id,
                 codigo_endereco, observacao, registro_saida_id, criado_em, criado_por)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
            (
                int(palete_id), tipo, subtipo, motivo, destino_externo,
                localizacao_id, codigo_endereco, observacao, registro_saida_id, now, user,
            ),
        )
        rid = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
    return rid


def _info_palete_controle(conn, palete_id):
    t_pal = _tbl(conn, 'wms_palete')
    t_item = _tbl(conn, 'wms_palete_item')
    t_loc = _tbl(conn, 'wms_localizacao')
    t_rec = _tbl(conn, 'wms_recebimento')
    t_ctrl = _tbl(conn, 'wms_palete_controle')
    pal = conn.execute(
        f'''SELECT p.*, l.codigo_endereco, r.numero_nf, r.fornecedor
            FROM {t_pal} p
            LEFT JOIN {t_loc} l ON l.id = p.localizacao_id
            LEFT JOIN {t_rec} r ON r.id = p.recebimento_id
            WHERE p.id = ?''',
        (int(palete_id),),
    ).fetchone()
    if not pal:
        return None
    rd = _row_dict(pal) or {}
    itens = conn.execute(
        f'''SELECT sku, descricao, lote, quantidade_caixas, data_producao, data_validade, criado_em
            FROM {t_item} WHERE palete_id = ? ORDER BY id''',
        (int(palete_id),),
    ).fetchall()
    hist = conn.execute(
        f'''SELECT * FROM {t_ctrl} WHERE palete_id = ? ORDER BY criado_em DESC, id DESC LIMIT 100''',
        (int(palete_id),),
    ).fetchall()
    saida_aberta = _saida_aberta_palete(conn, palete_id)
    return {
        'palete': rd,
        'itens': [_row_dict(i) for i in itens or []],
        'historico': [_row_dict(h) for h in hist or []],
        'saida_aberta': saida_aberta,
        'fora_armazem': (rd.get('status') == 'fora_armazem') or bool(saida_aberta),
    }


def _registrar_saida_palete(conn, palete_id, motivo, destino_externo=None, observacao=None):
    t_pal = _tbl(conn, 'wms_palete')
    t_loc = _tbl(conn, 'wms_localizacao')
    pal = conn.execute(f'SELECT * FROM {t_pal} WHERE id = ?', (int(palete_id),)).fetchone()
    if not pal:
        return None, 'Palete não encontrado.'
    rd = _row_dict(pal) or {}
    if _saida_aberta_palete(conn, palete_id):
        return None, 'Este palete já possui saída em aberto (aguardando retorno).'
    st = (rd.get('status') or '').lower()
    if st == 'fora_armazem':
        return None, 'Palete já está marcado como fora do armazém.'
    if st == 'bloqueado':
        return None, 'Palete bloqueado — não é possível registrar saída.'
    loc_id = rd.get('localizacao_id')
    cod_end = None
    if loc_id:
        loc = conn.execute(f'SELECT codigo_endereco FROM {t_loc} WHERE id = ?', (loc_id,)).fetchone()
        cod_end = (_row_dict(loc) or {}).get('codigo_endereco')
    rid = _registrar_controle_palete(
        conn, palete_id, 'saida',
        subtipo='apontamento_saida',
        motivo=motivo or 'nao_informado',
        destino_externo=(destino_externo or '').strip() or None,
        localizacao_id=loc_id,
        codigo_endereco=cod_end,
        observacao=observacao,
    )
    now = _now_iso()
    if loc_id and st == 'armazenado':
        if _is_pg(conn):
            conn.execute(f"UPDATE {t_loc} SET status = 'vazia', atualizado_em = NOW() WHERE id = ?", (loc_id,))
            conn.execute(
                f"UPDATE {t_pal} SET localizacao_id = NULL, status = 'fora_armazem', atualizado_em = NOW() WHERE id = ?",
                (int(palete_id),),
            )
        else:
            conn.execute(f"UPDATE {t_loc} SET status = 'vazia', atualizado_em = ? WHERE id = ?", (now, loc_id))
            conn.execute(
                f"UPDATE {t_pal} SET localizacao_id = NULL, status = 'fora_armazem', atualizado_em = ? WHERE id = ?",
                (now, int(palete_id)),
            )
    else:
        if _is_pg(conn):
            conn.execute(f"UPDATE {t_pal} SET status = 'fora_armazem', atualizado_em = NOW() WHERE id = ?", (int(palete_id),))
        else:
            conn.execute(f"UPDATE {t_pal} SET status = 'fora_armazem', atualizado_em = ? WHERE id = ?", (now, int(palete_id)))
    return {'registro_id': rid, 'codigo_endereco_origem': cod_end}, None


def _registrar_retorno_palete(conn, palete_id, motivo=None, codigo_endereco=None, observacao=None):
    t_pal = _tbl(conn, 'wms_palete')
    saida = _saida_aberta_palete(conn, palete_id)
    if not saida:
        return None, 'Não há saída em aberto para este palete. Registre a saída antes do retorno.'
    pal = conn.execute(f'SELECT * FROM {t_pal} WHERE id = ?', (int(palete_id),)).fetchone()
    if not pal:
        return None, 'Palete não encontrado.'
    loc_id = None
    cod_end = (codigo_endereco or '').strip() or None
    loc_info = None
    if cod_end:
        loc_info, err = _confirmar_armazenagem_palete(conn, int(palete_id), cod_end)
        if err:
            return None, err
        loc_id = (loc_info or {}).get('id')
        cod_end = (loc_info or {}).get('codigo_endereco') or cod_end
    else:
        now = _now_iso()
        if _is_pg(conn):
            conn.execute(
                f"UPDATE {t_pal} SET status = 'em_conferencia', atualizado_em = NOW() WHERE id = ?",
                (int(palete_id),),
            )
        else:
            conn.execute(
                f"UPDATE {t_pal} SET status = 'em_conferencia', atualizado_em = ? WHERE id = ?",
                (now, int(palete_id)),
            )
    rid = _registrar_controle_palete(
        conn, palete_id, 'retorno',
        subtipo='apontamento_retorno',
        motivo=motivo or 'retorno',
        localizacao_id=loc_id,
        codigo_endereco=cod_end or saida.get('codigo_endereco'),
        observacao=observacao,
        registro_saida_id=saida.get('id'),
    )
    return {
        'registro_id': rid,
        'saida_registro_id': saida.get('id'),
        'localizacao': loc_info,
    }, None


def _contar_paletes_fora(conn):
    t_pal = _tbl(conn, 'wms_palete')
    t_ctrl = _tbl(conn, 'wms_palete_controle')
    row = conn.execute(
        f'''SELECT COUNT(*) AS c FROM {t_pal} p
            WHERE EXISTS (
                SELECT 1 FROM {t_ctrl} c
                WHERE c.palete_id = p.id AND c.tipo = 'saida'
                  AND NOT EXISTS (
                    SELECT 1 FROM {t_ctrl} r
                    WHERE r.tipo = 'retorno' AND r.registro_saida_id = c.id
                  )
            )''',
    ).fetchone()
    return _int_col(row)


def _listar_paletes_fora(conn):
    data = _relatorio_wms(conn, 'paletes_fora')
    return (data or {}).get('linhas') or []


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


def _sugerir_putaway(conn, sku, lote=None, data_producao=None, zona='pulmao'):
    """Putaway: FIFO + mesmo SKU junto + mesma categoria perto + zoneamento."""
    t_prod = _tbl(conn, 'wms_produto_enderecamento')
    t_z = _tbl(conn, 'wms_zoneamento')
    t_loc = _tbl(conn, 'wms_localizacao')
    t_pal = _tbl(conn, 'wms_palete')
    t_item = _tbl(conn, 'wms_palete_item')
    _ensure_zona_armazenagem_column(conn)
    _ensure_produto_planejamento_columns(conn)

    prod = conn.execute(f'SELECT * FROM {t_prod} WHERE sku = ? AND {_ativo_sql(conn)}', (sku,)).fetchone()
    info = _info_produto_wms(conn, sku, prod)
    pd = info
    cat = (pd.get('categoria') or 'C').strip().upper()
    zona = (zona or 'pulmao').lower()
    status = info.get('status_condicional') or ''
    pos_wms = info.get('posicoes_wms') or 0
    pos_max = int(pd.get('posicoes_max') or 0)
    pos_med = int(pd.get('posicoes_med') or 0)
    alerta = None

    motivo = [f'Categoria {cat}', f'Zona {_zona_label(zona)}']
    if status:
        motivo.append(f'Status planejamento: {status}')
    if pos_med:
        motivo.append(f'Posições ref.: {pos_wms}/{pos_med} (média planejada)')
    if status == 'Vermelho':
        motivo.append('Prioridade reposição — estoque abaixo do ideal')
    elif status == 'Excedido':
        motivo.append('Atenção — estoque acima do ideal')
        if pos_max and pos_wms >= pos_max:
            alerta = 'capacidade_posicoes_excedida'

    camaras = conn.execute(
        f'''SELECT camara FROM {t_z}
            WHERE categoria = ? AND {_ativo_sql(conn)}
            ORDER BY prioridade ASC''',
        (cat,),
    ).fetchall()
    cam_list = [r['camara'] if isinstance(r, dict) else r[0] for r in camaras]
    if not cam_list:
        cam_list = [11, 12, 13]

    order_parts = []
    order_params = []

    # 1) Mesmo SKU + mesmo lote: vaga vazia na mesma rua do estoque existente
    if lote:
        anchor_lote = conn.execute(
            f'''SELECT l.camara, l.rua, l.posicao
                FROM {t_loc} l
                JOIN {t_pal} p ON p.localizacao_id = l.id
                JOIN {t_item} i ON i.palete_id = p.id
                WHERE i.sku = ? AND i.lote = ? AND l.status = 'ocupada'
                  AND UPPER(TRIM(COALESCE(l.categoria_zona, ''))) = ?
                  AND (p.bloqueio_tipo IS NULL OR p.bloqueio_tipo = '')
                ORDER BY l.rua, l.posicao, l.nivel
                LIMIT 1''',
            (sku, lote, cat),
        ).fetchone()
        if anchor_lote:
            ad = _row_dict(anchor_lote) or {}
            motivo.insert(0, f'Mesmo SKU e lote — adensar na Rua {ad.get("rua")}')
            order_parts.append('CASE WHEN l.camara = ? AND UPPER(TRIM(l.rua)) = ? THEN 0 ELSE 1 END')
            order_params.extend([ad.get('camara'), str(ad.get('rua') or '').upper()])
            if ad.get('posicao') is not None:
                order_parts.append('ABS(l.posicao - ?)')
                order_params.append(int(ad.get('posicao')))
            loc, pri = _buscar_vaga_vazia_putaway(
                conn, cat, cam_list, zona, ', '.join(order_parts), order_params, motivo, 'adensamento_lote',
            )
            if loc:
                return _putaway_resposta(loc, motivo, status, pos_wms, pos_med, alerta, pri)

    # 2) Mesmo SKU: cluster na rua com mais paletes do código
    cluster = _rua_cluster_sku(conn, sku, cat)
    if cluster.get('camara') and cluster.get('rua'):
        motivo.append(f'Mesmo código: cluster na Rua {cluster["rua"]} (Câm {cluster["camara"]})')
        order_parts.append('CASE WHEN l.camara = ? AND UPPER(TRIM(l.rua)) = ? THEN 0 ELSE 1 END')
        order_params.extend([cluster['camara'], str(cluster['rua']).upper()])

    # 3) FIFO: alinhar com estoque mais antigo (data de produção)
    fifo_anchor = _anchor_fifo_sku(conn, sku, cat)
    if fifo_anchor.get('camara') and fifo_anchor.get('rua'):
        dp_ant = fifo_anchor.get('data_producao')
        motivo.append(
            f'FIFO: estoque mais antigo em Rua {fifo_anchor.get("rua")}'
            + (f' (prod. {dp_ant})' if dp_ant else '')
        )
        order_parts.append('CASE WHEN l.camara = ? AND UPPER(TRIM(l.rua)) = ? THEN 0 ELSE 1 END')
        order_params.extend([fifo_anchor['camara'], str(fifo_anchor['rua']).upper()])
        if fifo_anchor.get('posicao') is not None:
            order_parts.append('ABS(l.posicao - ?)')
            order_params.append(int(fifo_anchor['posicao']))
    elif data_producao:
        motivo.append(f'FIFO: primeira entrada deste SKU (prod. {str(data_producao)[:10]})')

    # 4) Mesma categoria: próximo à rua com mais produtos da família
    cat_cluster = _rua_cluster_categoria(conn, cat, cam_list)
    if cat_cluster.get('camara') and cat_cluster.get('rua'):
        motivo.append(f'Categoria {cat}: próximo à Rua {cat_cluster["rua"]} (Câm {cat_cluster["camara"]})')
        order_parts.append('CASE WHEN l.camara = ? AND UPPER(TRIM(l.rua)) = ? THEN 0 ELSE 1 END')
        order_params.extend([cat_cluster['camara'], str(cat_cluster['rua']).upper()])

    order_prefix = ', '.join(order_parts)
    loc, pri = _buscar_vaga_vazia_putaway(
        conn, cat, cam_list, zona, order_prefix, order_params, motivo, 'zoneamento',
    )
    if loc:
        return _putaway_resposta(loc, motivo, status, pos_wms, pos_med, alerta, pri)

    motivo.append('Nenhuma posição vazia nas câmaras do zoneamento')
    out = _putaway_resposta(None, motivo, status, pos_wms, pos_med, alerta, None)
    out['zona_label'] = _zona_label(zona)
    return out


def _estoque_fifo_por_sku(conn, sku, qtd_necessaria=0, preferir_picking=True):
    """Paletes/endereços do SKU ordenados FIFO (data produção mais antiga primeiro)."""
    t_item = _tbl(conn, 'wms_palete_item')
    t_pal = _tbl(conn, 'wms_palete')
    t_loc = _tbl(conn, 'wms_localizacao')
    _ensure_zona_armazenagem_column(conn)
    zona_pick = _filtro_zona_sql('picking', 'l')
    zona_pul = _filtro_zona_sql('pulmao', 'l')
    order_fifo = 'i.data_producao ASC NULLS LAST, i.data_validade ASC NULLS LAST, l.rua, l.posicao, l.nivel'
    if not _is_pg(conn):
        order_fifo = 'i.data_producao ASC, i.data_validade ASC, l.rua, l.posicao, l.nivel'
    sql = f'''SELECT i.sku, i.lote, i.data_producao, i.data_validade, i.quantidade_caixas,
                     p.id AS palete_id, p.etiqueta, p.status AS palete_status,
                     l.id AS localizacao_id, l.codigo_endereco, l.camara, l.rua, l.posicao, l.nivel,
                     l.zona_armazenagem
              FROM {t_item} i
              JOIN {t_pal} p ON p.id = i.palete_id
              JOIN {t_loc} l ON l.id = p.localizacao_id
              WHERE i.sku = ? AND p.status = 'armazenado'
                AND (p.bloqueio_tipo IS NULL OR p.bloqueio_tipo = '')
                AND l.status = 'ocupada'
                AND {_bloqueio_off_sql(conn, 'l.bloqueio_saida')}'''
    params = [sku]
    if preferir_picking:
        sql += f' ORDER BY CASE WHEN {zona_pick} THEN 0 ELSE 1 END, {order_fifo}'
    else:
        sql += f' ORDER BY {order_fifo}'
    rows = conn.execute(sql, tuple(params)).fetchall()
    out = []
    acum = 0
    for r in rows:
        rd = _row_dict(r) or {}
        item = {
            **_format_locacao(rd),
            'quantidade_caixas': int(rd.get('quantidade_caixas') or 0),
            'lote': rd.get('lote'),
            'data_producao': rd.get('data_producao'),
            'data_validade': rd.get('data_validade'),
            'etiqueta': rd.get('etiqueta'),
            'palete_id': rd.get('palete_id'),
        }
        out.append(item)
        acum += item['quantidade_caixas']
        if qtd_necessaria and acum >= qtd_necessaria:
            break
    return out


def _lista_picking_roteiro(conn, id_roteiro, id_viagem):
    t_rom = _tbl_romaneio(conn)
    try:
        conn.execute(f'SELECT 1 FROM {t_rom} LIMIT 1')
    except Exception:
        return [], 'Tabela romaneio_por_item não encontrada.'
    rows = conn.execute(
        f'''SELECT codigo_produto AS sku,
                   SUM(COALESCE(quantidade, 0)) AS quantidade
            FROM {t_rom}
            WHERE id_roteiro = ? AND id_viagem = ?
            GROUP BY codigo_produto
            HAVING SUM(COALESCE(quantidade, 0)) > 0
            ORDER BY codigo_produto''',
        (str(id_roteiro).strip(), str(id_viagem).strip()),
    ).fetchall()
    if not rows:
        return [], 'Nenhum item no romaneio para este roteiro/viagem.'
    t_prod = _tbl(conn, 'wms_produto_enderecamento')
    _ensure_produto_planejamento_columns(conn)

    def _info_sku(sku):
        pr = conn.execute(
            f'''SELECT * FROM {t_prod} WHERE sku = ? AND {_ativo_sql(conn)} LIMIT 1''',
            (sku,),
        ).fetchone()
        info = _info_produto_wms(conn, sku, pr)
        return info

    rom_itens = []
    for r in rows:
        rd = _row_dict(r) or {}
        sku = (rd.get('sku') or '').strip()
        qtd = int(rd.get('quantidade') or 0)
        if not sku or qtd <= 0:
            continue
        info = _info_sku(sku)
        rom_itens.append({
            'sku': sku,
            'quantidade': qtd,
            'status_condicional': info.get('status_condicional') or '',
            'categoria': info.get('categoria') or '',
            'descricao': info.get('descricao') or '',
            'prioridade': _prioridade_status_condicional(info.get('status_condicional')),
        })
    rom_itens.sort(key=lambda x: (x['prioridade'], x['sku']))

    lista = []
    seq = 0
    for item_rom in rom_itens:
        sku = item_rom['sku']
        qtd = item_rom['quantidade']
        status = item_rom['status_condicional']
        estoque = _estoque_fifo_por_sku(conn, sku, qtd, preferir_picking=True)
        if not estoque:
            seq += 1
            lista.append({
                'sequencia': seq,
                'sku': sku,
                'descricao': item_rom.get('descricao'),
                'categoria': item_rom.get('categoria'),
                'status_condicional': status,
                'quantidade_romaneio': qtd,
                'quantidade_atendida': 0,
                'endereco': None,
                'texto': 'Sem estoque endereçado',
                'zona_label': '—',
                'data_producao': None,
                'etiqueta': None,
                'alerta': 'sem_estoque',
            })
            continue
        restante = qtd
        for e in estoque:
            if restante <= 0:
                break
            q_palete = min(restante, int(e.get('quantidade_caixas') or 0))
            seq += 1
            lista.append({
                'sequencia': seq,
                'sku': sku,
                'descricao': item_rom.get('descricao'),
                'categoria': item_rom.get('categoria'),
                'status_condicional': status,
                'quantidade_romaneio': qtd,
                'quantidade_separar': q_palete,
                'quantidade_atendida': q_palete,
                'endereco': e.get('codigo_endereco'),
                'texto': e.get('texto'),
                'camara': e.get('camara'),
                'rua': e.get('rua'),
                'posicao': e.get('posicao'),
                'nivel': e.get('nivel'),
                'zona_label': e.get('zona_label'),
                'data_producao': e.get('data_producao'),
                'etiqueta': e.get('etiqueta'),
                'palete_id': e.get('palete_id'),
                'alerta': None,
            })
            restante -= q_palete
        if restante > 0:
            seq += 1
            lista.append({
                'sequencia': seq,
                'sku': sku,
                'descricao': item_rom.get('descricao'),
                'categoria': item_rom.get('categoria'),
                'status_condicional': status,
                'quantidade_romaneio': qtd,
                'quantidade_separar': restante,
                'quantidade_atendida': qtd - restante,
                'endereco': None,
                'texto': f'Faltam {restante} caixas no estoque WMS',
                'zona_label': '—',
                'alerta': 'quantidade_insuficiente',
            })
    return lista, None


def _excluir_recebimento_wms(conn, recebimento_id):
    """Remove recebimento e paletes em conferência. Bloqueia se houver palete armazenado (estoque real)."""
    t_rec = _tbl(conn, 'wms_recebimento')
    t_rp = _tbl(conn, 'wms_recebimento_palete')
    t_pal = _tbl(conn, 'wms_palete')
    t_item = _tbl(conn, 'wms_palete_item')
    t_mov = _tbl(conn, 'wms_movimentacao')
    t_cqr = _tbl(conn, 'wms_check_qualidade_resposta')

    rec = conn.execute(f'SELECT id FROM {t_rec} WHERE id = ?', (recebimento_id,)).fetchone()
    if not rec:
        return None, 'Recebimento não encontrado.'

    pals = conn.execute(
        f'''SELECT DISTINCT p.id, p.etiqueta, p.status
            FROM {t_pal} p
            WHERE p.recebimento_id = ?
               OR p.id IN (SELECT palete_id FROM {t_rp} WHERE recebimento_id = ?)''',
        (recebimento_id, recebimento_id),
    ).fetchall()

    armazenados = []
    palete_ids = []
    for p in pals:
        rd = _row_dict(p) or {}
        pid = rd.get('id')
        if pid:
            palete_ids.append(pid)
        if (rd.get('status') or '').lower() == 'armazenado':
            armazenados.append(rd.get('etiqueta') or str(pid))

    if armazenados:
        lista = ', '.join(str(x) for x in armazenados[:5])
        extra = f' (+{len(armazenados) - 5})' if len(armazenados) > 5 else ''
        return None, (
            'Não é possível excluir: há palete(s) já armazenado(s) no WMS '
            f'({lista}{extra}). O estoque real não pode ser removido por exclusão de recebimento.'
        )

    for pid in palete_ids:
        conn.execute(f'DELETE FROM {t_mov} WHERE palete_id = ?', (pid,))
        conn.execute(f'DELETE FROM {t_item} WHERE palete_id = ?', (pid,))

    conn.execute(f'DELETE FROM {t_rp} WHERE recebimento_id = ?', (recebimento_id,))
    for pid in palete_ids:
        conn.execute(f'DELETE FROM {t_pal} WHERE id = ?', (pid,))
    conn.execute(f'DELETE FROM {t_cqr} WHERE recebimento_id = ?', (recebimento_id,))
    conn.execute(f'DELETE FROM {t_rec} WHERE id = ?', (recebimento_id,))

    return {'ok': True, 'paletes_removidos': len(palete_ids)}, None


def _mov_pendente_putaway(conn, palete_id):
    t_mov = _tbl(conn, 'wms_movimentacao')
    row = conn.execute(
        f'''SELECT * FROM {t_mov}
            WHERE palete_id = ? AND status = 'pendente' AND tipo = 'putaway'
            ORDER BY id DESC LIMIT 1''',
        (int(palete_id),),
    ).fetchone()
    return _row_dict(row)


def _criar_mov_pendente_putaway(conn, palete_id, sug, obs_extra=None):
    """Gera tarefa de putaway pendente para aparecer na fila até bipar a longarina."""
    if not sug or not sug.get('localizacao_id'):
        return None
    existente = _mov_pendente_putaway(conn, palete_id)
    if existente:
        return existente.get('id')
    t_mov = _tbl(conn, 'wms_movimentacao')
    obs_parts = list(sug.get('motivo') or [])
    if obs_extra:
        obs_parts.insert(0, obs_extra)
    obs = '; '.join(obs_parts) or 'Putaway pendente — aguardando bip da longarina'
    now = _now_iso()
    dest_id = sug['localizacao_id']
    if _is_pg(conn):
        cur = conn.execute(
            f'''INSERT INTO {t_mov} (tipo, palete_id, destino_localizacao_id, status, prioridade, observacao, criado_em, criado_por)
                VALUES ('putaway', ?, ?, 'pendente', 1, ?, NOW(), ?) RETURNING id''',
            (int(palete_id), dest_id, obs, _usuario()),
        )
        return (cur.fetchone() or {}).get('id')
    conn.execute(
        f'''INSERT INTO {t_mov} (tipo, palete_id, destino_localizacao_id, status, prioridade, observacao, criado_em, criado_por)
            VALUES ('putaway', ?, ?, 'pendente', 1, ?, ?, ?)''',
        (int(palete_id), dest_id, obs, now, _usuario()),
    )
    return conn.execute('SELECT last_insert_rowid()').fetchone()[0]


def _sync_recebimento_status_armazenagem(conn, recebimento_id):
    """Atualiza status do recebimento conforme paletes armazenados."""
    if not recebimento_id:
        return None
    t_rp = _tbl(conn, 'wms_recebimento_palete')
    t_pal = _tbl(conn, 'wms_palete')
    t_rec = _tbl(conn, 'wms_recebimento')
    rows = conn.execute(
        f'''SELECT p.status FROM {t_rp} rp
            JOIN {t_pal} p ON p.id = rp.palete_id
            WHERE rp.recebimento_id = ?''',
        (int(recebimento_id),),
    ).fetchall()
    if not rows:
        return None
    statuses = [((_row_dict(r) or {}).get('status') or '').lower() for r in rows]
    if all(s == 'armazenado' for s in statuses):
        novo = 'concluido'
    elif any(s == 'armazenado' for s in statuses):
        novo = 'aguardando_armazenagem'
    else:
        return None
    now = _now_iso()
    if _is_pg(conn):
        conn.execute(f"UPDATE {t_rec} SET status = ?, atualizado_em = NOW() WHERE id = ?", (novo, int(recebimento_id)))
    else:
        conn.execute(f"UPDATE {t_rec} SET status = ?, atualizado_em = ? WHERE id = ?", (novo, now, int(recebimento_id)))
    return novo


def _resumo_finalizacao_recebimento(conn, recebimento_id):
    """Indica se o recebimento pode ser finalizado (todos paletes guardados, NF ok)."""
    rec = _resolver_recebimento_wms(conn, recebimento_id=recebimento_id)
    if not rec:
        return None
    rid = int(rec['id'])
    t_rp = _tbl(conn, 'wms_recebimento_palete')
    t_pal = _tbl(conn, 'wms_palete')
    t_item = _tbl(conn, 'wms_palete_item')
    t_mov = _tbl(conn, 'wms_movimentacao')

    pals = conn.execute(
        f'''SELECT p.id, p.etiqueta, p.status
            FROM {t_rp} rp JOIN {t_pal} p ON p.id = rp.palete_id
            WHERE rp.recebimento_id = ?''',
        (rid,),
    ).fetchall()

    paletes_total = 0
    paletes_armazenados = 0
    paletes_pendentes = []
    pid_list = []
    for p in pals or []:
        rd = _row_dict(p) or {}
        pid = rd.get('id')
        status = (rd.get('status') or '').lower()
        cnt = conn.execute(f'SELECT COUNT(*) AS n FROM {t_item} WHERE palete_id = ?', (pid,)).fetchone()
        n_items = int((_row_dict(cnt) or {}).get('n') or 0)
        if n_items == 0 and status != 'armazenado':
            continue
        paletes_total += 1
        pid_list.append(pid)
        if status == 'armazenado':
            paletes_armazenados += 1
        else:
            paletes_pendentes.append({'etiqueta': rd.get('etiqueta'), 'status': status})

    mov_pendentes = 0
    if pid_list:
        ph = ','.join('?' * len(pid_list))
        row_mov = conn.execute(
            f"SELECT COUNT(*) AS n FROM {t_mov} WHERE palete_id IN ({ph}) AND LOWER(COALESCE(status, '')) = 'pendente'",
            pid_list,
        ).fetchone()
        mov_pendentes = int((_row_dict(row_mov) or {}).get('n') or 0)

    itens_nf_ok = True
    itens_nf_pendentes = 0
    numero_nf = rec.get('numero_nf')
    doc_id = rec.get('terceiros_documento_id')
    if doc_id and numero_nf:
        doc_nf, _err = _buscar_documento_terceiros_por_nf(conn, numero_nf)
        if doc_nf:
            doc_enr = _enriquecer_documento_nf_wms(conn, doc_nf)
            for it in doc_enr.get('itens') or []:
                if it.get('status_wms') != 'ok':
                    itens_nf_ok = False
                    itens_nf_pendentes += 1

    st_rec = (rec.get('status') or '').lower()
    motivos = []
    if st_rec == 'finalizado':
        motivos.append('Recebimento já finalizado.')
    elif st_rec == 'cancelado':
        motivos.append('Recebimento cancelado.')
    if paletes_total == 0:
        motivos.append('Nenhum palete conferido ainda.')
    elif paletes_pendentes:
        motivos.append(f'{len(paletes_pendentes)} palete(s) ainda não guardado(s).')
    if mov_pendentes:
        motivos.append(f'{mov_pendentes} movimentação(ões) pendente(s).')
    if not itens_nf_ok:
        motivos.append(f'{itens_nf_pendentes} item(ns) da NF ainda pendente(s).')

    pode = (
        st_rec not in ('finalizado', 'cancelado')
        and paletes_total > 0
        and paletes_armazenados == paletes_total
        and mov_pendentes == 0
        and itens_nf_ok
    )
    return {
        'pode_finalizar': pode,
        'motivo': ' · '.join(motivos) if motivos else 'Pronto para finalizar.',
        'motivos': motivos,
        'paletes_total': paletes_total,
        'paletes_armazenados': paletes_armazenados,
        'mov_pendentes': mov_pendentes,
        'itens_nf_ok': itens_nf_ok,
        'itens_nf_pendentes': itens_nf_pendentes,
        'status_recebimento': st_rec,
    }


def _confirmar_armazenagem_palete(conn, palete_id, codigo_endereco):
    t_pal = _tbl(conn, 'wms_palete')
    t_loc = _tbl(conn, 'wms_localizacao')
    t_mov = _tbl(conn, 'wms_movimentacao')
    now = _now_iso()
    pal = conn.execute(f'SELECT * FROM {t_pal} WHERE id = ?', (palete_id,)).fetchone()
    if not pal:
        return None, 'Palete não encontrado.'
    cod_resolvido = _resolver_codigo_endereco_bip(codigo_endereco) or (codigo_endereco or '').strip().upper()
    loc = conn.execute(
        f'''SELECT * FROM {t_loc} WHERE codigo_endereco = ? OR codigo_endereco = ?''',
        (cod_resolvido, cod_resolvido.upper()),
    ).fetchone()
    if not loc:
        return None, 'Endereço não encontrado. Bipe a etiqueta da longarina (ex.: 21.13.1.1).'
    ld = _row_dict(loc) or {}
    if ld.get('status') != 'vazia':
        return None, 'Endereço não está vazio.'
    pid = pal['id'] if isinstance(pal, dict) else pal[0]
    dest_id = ld.get('id')
    orig = pal.get('localizacao_id') if isinstance(pal, dict) else None
    obs = f'Armazenagem confirmada em {ld.get("codigo_endereco")}'
    mov_pend = _mov_pendente_putaway(conn, pid)
    mov_id = mov_pend.get('id') if mov_pend else None
    if mov_pend:
        if _is_pg(conn):
            conn.execute(
                f'''UPDATE {t_mov} SET status = 'concluida', destino_localizacao_id = ?,
                    origem_localizacao_id = COALESCE(origem_localizacao_id, ?),
                    observacao = ?, concluida_em = NOW(), concluida_por = ?
                    WHERE id = ?''',
                (dest_id, orig, obs, _usuario(), mov_id),
            )
        else:
            conn.execute(
                f'''UPDATE {t_mov} SET status = 'concluida', destino_localizacao_id = ?,
                    origem_localizacao_id = COALESCE(origem_localizacao_id, ?),
                    observacao = ?, concluida_em = ?, concluida_por = ? WHERE id = ?''',
                (dest_id, orig, obs, now, _usuario(), mov_id),
            )
    elif _is_pg(conn):
        conn.execute(
            f'''INSERT INTO {t_mov} (tipo, palete_id, origem_localizacao_id, destino_localizacao_id,
                status, prioridade, observacao, criado_em, criado_por, concluida_em, concluida_por)
                VALUES ('putaway', ?, ?, ?, 'concluida', 1, ?, NOW(), ?, NOW(), ?)''',
            (pid, orig, dest_id, obs, _usuario(), _usuario()),
        )
    else:
        conn.execute(
            f'''INSERT INTO {t_mov} (tipo, palete_id, origem_localizacao_id, destino_localizacao_id,
                status, prioridade, observacao, criado_em, criado_por, concluida_em, concluida_por)
                VALUES ('putaway', ?, ?, ?, 'concluida', 1, ?, ?, ?, ?, ?)''',
            (pid, orig, dest_id, obs, now, _usuario(), now, _usuario()),
        )
    if _is_pg(conn):
        conn.execute(f"UPDATE {t_loc} SET status = 'ocupada', atualizado_em = NOW() WHERE id = ?", (dest_id,))
        if orig:
            conn.execute(f"UPDATE {t_loc} SET status = 'vazia', atualizado_em = NOW() WHERE id = ?", (orig,))
        conn.execute(
            f"UPDATE {t_pal} SET localizacao_id = ?, status = 'armazenado', atualizado_em = NOW() WHERE id = ?",
            (dest_id, pid),
        )
    else:
        conn.execute(f"UPDATE {t_loc} SET status = 'ocupada', atualizado_em = ? WHERE id = ?", (now, dest_id))
        if orig:
            conn.execute(f"UPDATE {t_loc} SET status = 'vazia', atualizado_em = ? WHERE id = ?", (now, orig))
        conn.execute(
            f"UPDATE {t_pal} SET localizacao_id = ?, status = 'armazenado', atualizado_em = ? WHERE id = ?",
            (dest_id, now, pid),
        )
    pal_rd = _row_dict(pal) or {}
    rid = pal_rd.get('recebimento_id')
    if not rid:
        t_rp = _tbl(conn, 'wms_recebimento_palete')
        rp = conn.execute(
            f'SELECT recebimento_id FROM {t_rp} WHERE palete_id = ? ORDER BY id DESC LIMIT 1', (pid,),
        ).fetchone()
        rid = (_row_dict(rp) or {}).get('recebimento_id')
    rec_status = _sync_recebimento_status_armazenagem(conn, rid)
    _ensure_wms_palete_controle_table(conn)
    _registrar_controle_palete(
        conn, pid, 'entrada',
        subtipo='armazenagem',
        localizacao_id=dest_id,
        codigo_endereco=ld.get('codigo_endereco'),
        observacao='Entrada no endereço do armazém',
    )
    loc_fmt = _format_locacao(loc)
    if loc_fmt is not None and isinstance(loc_fmt, dict):
        loc_fmt['movimentacao_id'] = mov_id
        loc_fmt['movimentacao_status'] = 'concluida'
        loc_fmt['recebimento_status'] = rec_status
    return loc_fmt, None


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
    return bloqueios


def _sql_filtro_periodo(conn, col, data_inicio, data_fim):
    parts = []
    params = []
    if data_inicio:
        di = str(data_inicio)[:10]
        if _is_pg(conn):
            parts.append(f'({col}::date >= ?::date)')
        else:
            parts.append(f'(date({col}) >= date(?))')
        params.append(di)
    if data_fim:
        df = str(data_fim)[:10]
        if _is_pg(conn):
            parts.append(f'({col}::date <= ?::date)')
        else:
            parts.append(f'(date({col}) <= date(?))')
        params.append(df)
    return (' AND '.join(parts) if parts else ''), params


def _parse_dt_iso(val):
    if val is None or val == '':
        return None
    s = str(val).strip().replace('Z', '+00:00')
    if not s:
        return None
    try:
        if len(s) <= 10:
            return datetime.fromisoformat(s[:10] + 'T00:00:00')
        return datetime.fromisoformat(s[:19])
    except Exception:
        return None


def _duracao_minutos_entre(inicio, fim):
    d1, d2 = _parse_dt_iso(inicio), _parse_dt_iso(fim)
    if not d1 or not d2 or d2 < d1:
        return None
    return int((d2 - d1).total_seconds() // 60)


def _resolver_recebimento_wms(conn, recebimento_id=None, numero_nf=None):
    t_rec = _tbl(conn, 'wms_recebimento')
    if recebimento_id:
        row = conn.execute(f'SELECT * FROM {t_rec} WHERE id = ?', (int(recebimento_id),)).fetchone()
        if row:
            return _row_dict(row)
    nf = (numero_nf or '').strip()
    if nf:
        row = conn.execute(
            f'SELECT * FROM {t_rec} WHERE numero_nf = ? ORDER BY id DESC LIMIT 1',
            (nf,),
        ).fetchone()
        if row:
            return _row_dict(row)
    return None


def _historico_recebimento_nf(conn, recebimento_id=None, numero_nf=None):
    rec = _resolver_recebimento_wms(conn, recebimento_id=recebimento_id, numero_nf=numero_nf)
    if not rec:
        return None, 'Recebimento WMS não encontrado para esta NF.'
    rid = int(rec['id'])
    t_rp = _tbl(conn, 'wms_recebimento_palete')
    t_pal = _tbl(conn, 'wms_palete')
    t_item = _tbl(conn, 'wms_palete_item')
    t_mov = _tbl(conn, 'wms_movimentacao')
    t_loc = _tbl(conn, 'wms_localizacao')

    pals = conn.execute(
        f'''SELECT p.*, rp.estado_palete, rp.conferencia_cega,
                   l.codigo_endereco, l.camara AS loc_camara, l.rua AS loc_rua,
                   l.posicao AS loc_posicao, l.nivel AS loc_nivel
            FROM {t_rp} rp
            JOIN {t_pal} p ON p.id = rp.palete_id
            LEFT JOIN {t_loc} l ON l.id = p.localizacao_id
            WHERE rp.recebimento_id = ?
            ORDER BY p.id''',
        (rid,),
    ).fetchall()

    itens = conn.execute(
        f'''SELECT i.*, p.etiqueta AS palete_etiqueta, p.status AS palete_status,
                   p.criado_por AS palete_criado_por
            FROM {t_item} i
            JOIN {t_pal} p ON p.id = i.palete_id
            JOIN {t_rp} rp ON rp.palete_id = p.id
            WHERE rp.recebimento_id = ?
            ORDER BY i.criado_em, i.id''',
        (rid,),
    ).fetchall()

    movs = conn.execute(
        f'''SELECT m.*, p.etiqueta AS palete_etiqueta,
                   lo.codigo_endereco AS origem_codigo,
                   ld.codigo_endereco AS destino_codigo
            FROM {t_mov} m
            JOIN {t_pal} p ON p.id = m.palete_id
            JOIN {t_rp} rp ON rp.palete_id = p.id
            LEFT JOIN {t_loc} lo ON lo.id = m.origem_localizacao_id
            LEFT JOIN {t_loc} ld ON ld.id = m.destino_localizacao_id
            WHERE rp.recebimento_id = ?
            ORDER BY m.criado_em, m.id''',
        (rid,),
    ).fetchall()

    paletes_out = []
    eventos = []
    ts_inicio = []
    ts_fim = []
    operadores = set()

    for p in pals or []:
        rd = _row_dict(p) or {}
        if rd.get('criado_por'):
            operadores.add(str(rd['criado_por']))
        if rd.get('criado_em'):
            ts_inicio.append(rd['criado_em'])
            eventos.append({
                'quando': rd['criado_em'],
                'tipo': 'palete_criado',
                'descricao': f"Palete {rd.get('etiqueta') or rd.get('id')} vinculado ao recebimento",
                'detalhe': f"Status: {rd.get('status') or '-'}",
                'usuario': rd.get('criado_por'),
            })
        loc_txt = rd.get('codigo_endereco') or ''
        if not loc_txt and rd.get('loc_camara'):
            loc_txt = f"{rd.get('loc_camara')}-{rd.get('loc_rua')}-{rd.get('loc_posicao')}-{rd.get('loc_nivel')}"
        paletes_out.append({
            'id': rd.get('id'),
            'etiqueta': rd.get('etiqueta'),
            'status': rd.get('status'),
            'estado_fisico': rd.get('estado_palete') or rd.get('estado_fisico'),
            'bloqueio_tipo': rd.get('bloqueio_tipo'),
            'endereco': loc_txt or None,
            'criado_em': rd.get('criado_em'),
            'atualizado_em': rd.get('atualizado_em'),
            'criado_por': rd.get('criado_por'),
        })
        if rd.get('status') == 'armazenado' and rd.get('atualizado_em'):
            ts_fim.append(rd['atualizado_em'])

    itens_out = []
    total_caixas = 0
    skus_unicos = set()
    for it in itens or []:
        rd = _row_dict(it) or {}
        q = int(rd.get('quantidade_caixas') or 0)
        total_caixas += q
        sku = (rd.get('sku') or '').strip()
        if sku:
            skus_unicos.add(sku.upper())
        if rd.get('criado_em'):
            ts_inicio.append(rd['criado_em'])
            ts_fim.append(rd['criado_em'])
        if rd.get('palete_criado_por'):
            operadores.add(str(rd['palete_criado_por']))
        itens_out.append({
            'id': rd.get('id'),
            'sku': sku,
            'descricao': rd.get('descricao'),
            'lote': rd.get('lote'),
            'data_producao': rd.get('data_producao'),
            'data_validade': rd.get('data_validade'),
            'quantidade_caixas': q,
            'rg_caixa': rd.get('rg_caixa'),
            'palete_etiqueta': rd.get('palete_etiqueta'),
            'palete_status': rd.get('palete_status'),
            'bipado_em': rd.get('criado_em'),
        })
        eventos.append({
            'quando': rd.get('criado_em'),
            'tipo': 'produto_bipado',
            'descricao': f"SKU {sku} — {q} cx no palete {rd.get('palete_etiqueta') or '-'}",
            'detalhe': f"Lote {rd.get('lote') or '-'} · Prod. {rd.get('data_producao') or '-'} · Val. {rd.get('data_validade') or '-'}",
            'usuario': rd.get('palete_criado_por'),
        })

    movs_out = []
    for m in movs or []:
        rd = _row_dict(m) or {}
        if rd.get('criado_por'):
            operadores.add(str(rd['criado_por']))
        if rd.get('concluida_por'):
            operadores.add(str(rd['concluida_por']))
        when = rd.get('concluida_em') or rd.get('criado_em')
        if rd.get('concluida_em'):
            ts_fim.append(rd['concluida_em'])
        movs_out.append({
            'id': rd.get('id'),
            'tipo': rd.get('tipo'),
            'status': rd.get('status'),
            'palete_etiqueta': rd.get('palete_etiqueta'),
            'origem': rd.get('origem_codigo'),
            'destino': rd.get('destino_codigo'),
            'observacao': rd.get('observacao'),
            'criado_em': rd.get('criado_em'),
            'concluida_em': rd.get('concluida_em'),
            'criado_por': rd.get('criado_por'),
            'concluida_por': rd.get('concluida_por'),
        })
        eventos.append({
            'quando': when,
            'tipo': 'movimentacao',
            'descricao': f"{rd.get('tipo') or 'mov.'} palete {rd.get('palete_etiqueta') or '-'} → {rd.get('destino_codigo') or '-'}",
            'detalhe': rd.get('observacao') or f"Status: {rd.get('status') or '-'}",
            'usuario': rd.get('concluida_por') or rd.get('criado_por'),
        })

    inicio_bip = min(ts_inicio) if ts_inicio else rec.get('criado_em')
    fim_bip = max(ts_fim) if ts_fim else rec.get('atualizado_em')
    dur_min = _duracao_minutos_entre(inicio_bip, fim_bip)

    terceiros = None
    doc_nf = None
    doc_id = rec.get('terceiros_documento_id')
    if doc_id:
        try:
            doc_nf, _err = _buscar_documento_terceiros_por_nf(conn, rec.get('numero_nf') or numero_nf)
            if doc_nf:
                terceiros = {
                    'documento_id': doc_nf.get('documento_id'),
                    'area': doc_nf.get('area'),
                    'motorista': doc_nf.get('motorista'),
                    'recebimento_concluido': doc_nf.get('recebimento_concluido'),
                    'quantidade_total_xml': doc_nf.get('quantidade_total_xml'),
                }
        except Exception:
            pass

    t_ctrl = _tbl(conn, 'wms_palete_controle')
    ctrl_rows = conn.execute(
        f'''SELECT c.*, p.etiqueta AS palete_etiqueta
            FROM {t_ctrl} c
            JOIN {t_pal} p ON p.id = c.palete_id
            JOIN {t_rp} rp ON rp.palete_id = p.id
            WHERE rp.recebimento_id = ?
            ORDER BY c.criado_em, c.id''',
        (rid,),
    ).fetchall()
    controle_out = []
    _lbl_ctrl = {'entrada': 'Entrada palete', 'saida': 'Saída palete', 'retorno': 'Retorno palete'}
    for c in ctrl_rows or []:
        rd = _row_dict(c) or {}
        controle_out.append(rd)
        tipo_c = rd.get('tipo') or ''
        det = []
        if rd.get('subtipo'):
            det.append(str(rd.get('subtipo')))
        if rd.get('motivo'):
            det.append('Motivo: ' + str(rd.get('motivo')))
        if rd.get('destino_externo'):
            det.append('Destino: ' + str(rd.get('destino_externo')))
        if rd.get('codigo_endereco'):
            det.append('Endereço: ' + str(rd.get('codigo_endereco')))
        eventos.append({
            'quando': rd.get('criado_em'),
            'tipo': 'controle_palete_' + tipo_c,
            'descricao': (_lbl_ctrl.get(tipo_c) or tipo_c) + ' — ' + str(rd.get('palete_etiqueta') or ''),
            'detalhe': ' · '.join(det) if det else (rd.get('observacao') or ''),
            'usuario': rd.get('criado_por'),
        })

    eventos = [e for e in eventos if e.get('quando')]
    eventos.sort(key=lambda e: str(e.get('quando') or ''))

    resumo_nf = []
    if terceiros and doc_id:
        doc_enr = _enriquecer_documento_nf_wms(conn, doc_nf) if doc_nf else None
        if doc_enr:
            for it in doc_enr.get('itens') or []:
                resumo_nf.append({
                    'n_item': it.get('n_item'),
                    'sku': it.get('sku'),
                    'descricao': it.get('descricao'),
                    'quantidade_xml': it.get('quantidade_xml'),
                    'quantidade_wms': it.get('quantidade_wms'),
                    'pendente_wms': it.get('pendente_wms'),
                    'status_wms': it.get('status_wms'),
                    'codigo_ean': it.get('codigo_ean'),
                })

    return {
        'recebimento': rec,
        'terceiros': terceiros,
        'periodo': {
            'inicio_bipagem': inicio_bip,
            'fim_bipagem': fim_bip,
            'duracao_minutos': dur_min,
            'criado_em': rec.get('criado_em'),
            'atualizado_em': rec.get('atualizado_em'),
            'criado_por': rec.get('criado_por'),
            'operadores': sorted(operadores),
        },
        'totais': {
            'paletes': len(paletes_out),
            'linhas_bipagem': len(itens_out),
            'skus_unicos': len(skus_unicos),
            'caixas_bipadas': total_caixas,
            'movimentacoes': len(movs_out),
        },
        'itens_nf': resumo_nf,
        'paletes': paletes_out,
        'itens_bipados': itens_out,
        'movimentacoes': movs_out,
        'controle_paletes': controle_out,
        'linha_do_tempo': eventos,
    }, None


def _relatorio_wms(conn, tipo, data_inicio=None, data_fim=None, extra=None):
    extra = extra or {}
    t_rec = _tbl(conn, 'wms_recebimento')
    t_rp = _tbl(conn, 'wms_recebimento_palete')
    t_pal = _tbl(conn, 'wms_palete')
    t_item = _tbl(conn, 'wms_palete_item')
    t_mov = _tbl(conn, 'wms_movimentacao')
    t_loc = _tbl(conn, 'wms_localizacao')
    tipo = (tipo or 'recebimentos').strip().lower()

    if tipo == 'recebimentos':
        filtro, params = _sql_filtro_periodo(conn, 'r.criado_em', data_inicio, data_fim)
        where = ('WHERE ' + filtro) if filtro else ''
        rows = conn.execute(
            f'''SELECT r.id, r.numero_nf, r.fornecedor, r.placa, r.status, r.origem,
                       r.criado_em, r.atualizado_em, r.criado_por,
                       COUNT(DISTINCT rp.palete_id) AS qtd_paletes,
                       COALESCE(SUM(i.quantidade_caixas), 0) AS qtd_caixas
                FROM {t_rec} r
                LEFT JOIN {t_rp} rp ON rp.recebimento_id = r.id
                LEFT JOIN {t_item} i ON i.palete_id = rp.palete_id
                {where}
                GROUP BY r.id
                ORDER BY r.id DESC
                LIMIT 500''',
            tuple(params),
        ).fetchall()
        return {'tipo': tipo, 'titulo': 'Recebimentos WMS por período', 'colunas': [
            'id', 'numero_nf', 'fornecedor', 'placa', 'status', 'origem', 'qtd_paletes', 'qtd_caixas',
            'criado_em', 'atualizado_em', 'criado_por',
        ], 'linhas': [_row_dict(r) for r in rows or []]}

    if tipo == 'bipagem_itens':
        filtro, params = _sql_filtro_periodo(conn, 'i.criado_em', data_inicio, data_fim)
        where = ('WHERE ' + filtro) if filtro else ''
        rows = conn.execute(
            f'''SELECT i.criado_em AS bipado_em, r.numero_nf, r.fornecedor, p.etiqueta AS palete,
                       i.sku, i.descricao, i.lote, i.data_producao, i.data_validade,
                       i.quantidade_caixas, p.criado_por
                FROM {t_item} i
                JOIN {t_pal} p ON p.id = i.palete_id
                LEFT JOIN {t_rec} r ON r.id = p.recebimento_id
                {where}
                ORDER BY i.criado_em DESC
                LIMIT 2000''',
            tuple(params),
        ).fetchall()
        return {'tipo': tipo, 'titulo': 'Itens bipados (detalhe)', 'colunas': [
            'bipado_em', 'numero_nf', 'fornecedor', 'palete', 'sku', 'descricao', 'lote',
            'data_producao', 'data_validade', 'quantidade_caixas', 'criado_por',
        ], 'linhas': [_row_dict(r) for r in rows or []]}

    if tipo == 'paletes':
        filtro, params = _sql_filtro_periodo(conn, 'p.criado_em', data_inicio, data_fim)
        where = ('WHERE ' + filtro) if filtro else ''
        rows = conn.execute(
            f'''SELECT p.etiqueta, p.status, r.numero_nf, l.codigo_endereco AS endereco,
                       p.criado_em, p.atualizado_em, p.criado_por, p.bloqueio_tipo
                FROM {t_pal} p
                LEFT JOIN {t_rec} r ON r.id = p.recebimento_id
                LEFT JOIN {t_loc} l ON l.id = p.localizacao_id
                {where}
                ORDER BY p.id DESC
                LIMIT 2000''',
            tuple(params),
        ).fetchall()
        return {'tipo': tipo, 'titulo': 'Paletes criados / armazenados', 'colunas': [
            'etiqueta', 'status', 'numero_nf', 'endereco', 'criado_em', 'atualizado_em', 'criado_por', 'bloqueio_tipo',
        ], 'linhas': [_row_dict(r) for r in rows or []]}

    if tipo == 'movimentacoes':
        filtro, params = _sql_filtro_periodo(conn, 'm.criado_em', data_inicio, data_fim)
        where = ('WHERE ' + filtro) if filtro else ''
        rows = conn.execute(
            f'''SELECT m.tipo, m.status, p.etiqueta AS palete, lo.codigo_endereco AS origem,
                       ld.codigo_endereco AS destino, m.criado_em, m.concluida_em,
                       m.criado_por, m.concluida_por, m.observacao
                FROM {t_mov} m
                JOIN {t_pal} p ON p.id = m.palete_id
                LEFT JOIN {t_loc} lo ON lo.id = m.origem_localizacao_id
                LEFT JOIN {t_loc} ld ON ld.id = m.destino_localizacao_id
                {where}
                ORDER BY m.id DESC
                LIMIT 2000''',
            tuple(params),
        ).fetchall()
        return {'tipo': tipo, 'titulo': 'Movimentações WMS', 'colunas': [
            'tipo', 'status', 'palete', 'origem', 'destino', 'criado_em', 'concluida_em',
            'criado_por', 'concluida_por', 'observacao',
        ], 'linhas': [_row_dict(r) for r in rows or []]}

    if tipo == 'produtos_recebidos':
        filtro, params = _sql_filtro_periodo(conn, 'i.criado_em', data_inicio, data_fim)
        where = ('WHERE ' + filtro) if filtro else ''
        rows = conn.execute(
            f'''SELECT i.sku, MAX(i.descricao) AS descricao,
                       SUM(COALESCE(i.quantidade_caixas, 0)) AS total_caixas,
                       COUNT(*) AS linhas_bipagem,
                       COUNT(DISTINCT p.id) AS paletes,
                       MIN(i.data_producao) AS prod_mais_antiga,
                       MAX(i.data_validade) AS validade_max
                FROM {t_item} i
                JOIN {t_pal} p ON p.id = i.palete_id
                {where}
                GROUP BY i.sku
                ORDER BY total_caixas DESC
                LIMIT 500''',
            tuple(params),
        ).fetchall()
        return {'tipo': tipo, 'titulo': 'Produtos recebidos (consolidado por SKU)', 'colunas': [
            'sku', 'descricao', 'total_caixas', 'linhas_bipagem', 'paletes',
            'prod_mais_antiga', 'validade_max',
        ], 'linhas': [_row_dict(r) for r in rows or []]}

    if tipo == 'operadores':
        filtro, params = _sql_filtro_periodo(conn, 'i.criado_em', data_inicio, data_fim)
        where = ('WHERE ' + filtro) if filtro else ''
        rows = conn.execute(
            f'''SELECT COALESCE(p.criado_por, '—') AS operador,
                       COUNT(DISTINCT i.id) AS itens_bipados,
                       SUM(COALESCE(i.quantidade_caixas, 0)) AS caixas,
                       COUNT(DISTINCT p.id) AS paletes
                FROM {t_item} i
                JOIN {t_pal} p ON p.id = i.palete_id
                {where}
                GROUP BY COALESCE(p.criado_por, '—')
                ORDER BY itens_bipados DESC''',
            tuple(params),
        ).fetchall()
        return {'tipo': tipo, 'titulo': 'Produtividade por operador', 'colunas': [
            'operador', 'itens_bipados', 'caixas', 'paletes',
        ], 'linhas': [_row_dict(r) for r in rows or []]}

    if tipo == 'ocupacao':
        camaras = _ocupacao_camara(conn)
        return {'tipo': tipo, 'titulo': 'Ocupação por câmara (snapshot)', 'colunas': [
            'camara', 'descricao', 'total_posicoes', 'cadastradas', 'ocupadas', 'vazias', 'ocupacao_pct',
        ], 'linhas': camaras}

    if tipo == 'nfs_pendentes':
        rows = conn.execute(
            f'''SELECT r.id, r.numero_nf, r.fornecedor, r.placa, r.status, r.criado_em,
                       COALESCE(SUM(i.quantidade_caixas), 0) AS qtd_bipada
                FROM {t_rec} r
                LEFT JOIN {t_rp} rp ON rp.recebimento_id = r.id
                LEFT JOIN {t_item} i ON i.palete_id = rp.palete_id
                WHERE r.status NOT IN ('finalizado', 'concluido')
                GROUP BY r.id
                ORDER BY r.id DESC
                LIMIT 200''',
        ).fetchall()
        return {'tipo': tipo, 'titulo': 'NFs / recebimentos em aberto', 'colunas': [
            'id', 'numero_nf', 'fornecedor', 'placa', 'status', 'qtd_bipada', 'criado_em',
        ], 'linhas': [_row_dict(r) for r in rows or []]}

    t_ctrl = _tbl(conn, 'wms_palete_controle')
    if tipo == 'controle_paletes':
        filtro, params = _sql_filtro_periodo(conn, 'c.criado_em', data_inicio, data_fim)
        where = ('WHERE ' + filtro) if filtro else ''
        rows = conn.execute(
            f'''SELECT c.criado_em, c.tipo, c.subtipo, c.motivo, c.destino_externo,
                       c.codigo_endereco, c.observacao, c.criado_por,
                       p.etiqueta AS palete, p.status AS status_palete, r.numero_nf
                FROM {t_ctrl} c
                JOIN {t_pal} p ON p.id = c.palete_id
                LEFT JOIN {t_rec} r ON r.id = p.recebimento_id
                {where}
                ORDER BY c.id DESC
                LIMIT 3000''',
            tuple(params),
        ).fetchall()
        return {'tipo': tipo, 'titulo': 'Entrada / saída / retorno de paletes', 'colunas': [
            'criado_em', 'tipo', 'subtipo', 'palete', 'status_palete', 'numero_nf',
            'motivo', 'destino_externo', 'codigo_endereco', 'observacao', 'criado_por',
        ], 'linhas': [_row_dict(r) for r in rows or []]}

    if tipo == 'paletes_fora':
        rows = conn.execute(
            f'''SELECT p.etiqueta, p.status, l.codigo_endereco AS ultimo_endereco,
                       s.criado_em AS saida_em, s.motivo AS motivo_saida,
                       s.destino_externo, s.criado_por AS operador_saida, r.numero_nf
                FROM {t_pal} p
                JOIN {t_ctrl} s ON s.id = (
                    SELECT c.id FROM {t_ctrl} c
                    WHERE c.palete_id = p.id AND c.tipo = 'saida'
                      AND NOT EXISTS (
                        SELECT 1 FROM {t_ctrl} r2
                        WHERE r2.tipo = 'retorno' AND r2.registro_saida_id = c.id
                      )
                    ORDER BY c.id DESC LIMIT 1
                )
                LEFT JOIN {t_loc} l ON l.id = p.localizacao_id
                LEFT JOIN {t_rec} r ON r.id = p.recebimento_id
                ORDER BY s.criado_em DESC
                LIMIT 500''',
        ).fetchall()
        return {'tipo': tipo, 'titulo': 'Paletes fora do armazém (saída sem retorno)', 'colunas': [
            'etiqueta', 'status', 'numero_nf', 'ultimo_endereco', 'saida_em',
            'motivo_saida', 'destino_externo', 'operador_saida',
        ], 'linhas': [_row_dict(r) for r in rows or []]}

    return None


@bp.route('/painel', methods=['GET'])
def api_wms_painel():
    conn = _db()
    ensure_wms_schema(conn)
    _seed_wms_defaults(conn)
    try:
        pesos = _pesos_categoria_produtos(conn)
        camaras = _ocupacao_camara(conn)
        dist_cat = _distribuicao_categoria(conn)
        zoneamento = _listar_zoneamento(conn)
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
        paletes_fora = _contar_paletes_fora(conn)
        _ensure_produto_planejamento_columns(conn)
        t_prod = _tbl(conn, 'wms_produto_enderecamento')
        resumo_status = _resumo_status_planejamento(conn)
        pesos_pos = conn.execute(
            f'''SELECT UPPER(SUBSTR(categoria, 1, 1)) AS cat,
                       SUM(COALESCE(NULLIF(posicoes_med, 0), 1)) AS posicoes
                FROM {t_prod} WHERE {_ativo_sql(conn)}
                GROUP BY UPPER(SUBSTR(categoria, 1, 1))'''
        ).fetchall()
        conn.close()
        return jsonify({
            'camaras': camaras,
            'distribuicao_categoria': dist_cat,
            'zoneamento': zoneamento,
            'pesos_categoria': pesos,
            'pesos_posicoes_categoria': {(_row_dict(r) or {}).get('cat'): int((_row_dict(r) or {}).get('posicoes') or 0) for r in pesos_pos},
            'resumo_status_planejamento': resumo_status,
            'fonte_estoque': 'wms',
            'movimentacoes_pendentes': _int_col(pendentes),
            'recebimentos_abertos': _int_col(rec_abertos),
            'inventarios_ativos': _int_col(inv_ativos),
            'paletes_fora_armazem': paletes_fora,
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
    _seed_wms_defaults(conn)
    camara = request.args.get('camara', type=int)
    status = (request.args.get('status') or '').strip()
    categoria = (request.args.get('categoria') or '').strip().upper()
    q = (request.args.get('q') or '').strip()
    t = _tbl(conn, 'wms_localizacao')
    try:
        total_row = conn.execute(f'SELECT COUNT(*) AS c FROM {t}').fetchone()
        total_loc = _int_col(total_row, 'c')
        if total_loc == 0 and request.args.get('auto_layout', '1') != '0':
            _ensure_layout_enderecos(conn)
        sql = f'SELECT id, camara, rua, posicao, nivel, codigo_endereco, status, area, categoria_zona, zona_armazenagem FROM {t} WHERE 1=1'
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
        rows = conn.execute(sql, tuple(params)).fetchall()
        conn.close()
        locs = []
        for r in rows:
            locs.append(_format_locacao(r))
        return jsonify({'localizacoes': locs, 'total': len(locs)})
    except Exception as e:
        try:
            conn.rollback()
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
    sync = (request.args.get('sync') or '').strip().lower() in ('1', 'sim', 'true', 'yes')
    t = _tbl(conn, 'wms_produto_enderecamento')
    sql = f'''SELECT sku, descricao, categoria, medida_cx, padrao_plt, conversao,
                     posicoes_min, posicoes_med, posicoes_max,
                     estoque_atual, posicao_atual, status_condicional
              FROM {t} WHERE {_ativo_sql(conn)}'''
    params = []
    if cat:
        sql += ' AND categoria = ?'
        params.append(cat)
    if q:
        sql += ' AND (sku ILIKE ? OR descricao ILIKE ?)' if _is_pg(conn) else ' AND (sku LIKE ? OR descricao LIKE ?)'
        params.extend([f'%{q}%', f'%{q}%'])
    sql += ' ORDER BY categoria, sku LIMIT 1000'
    try:
        if sync:
            _sync_all_produtos_estoque_cache(conn)
            try:
                conn.commit()
            except Exception:
                conn.rollback()
        rows = conn.execute(sql, tuple(params)).fetchall()
        produtos = [_row_dict(r) or {} for r in rows]
        conn.close()
        return jsonify({'produtos': produtos, 'fonte_estoque': 'wms'})
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
                if pid:
                    for sku in _skus_do_palete(conn, pid):
                        _sync_produto_estoque_cache(conn, sku)
            conn.commit()
            conn.close()
            return jsonify({'ok': True})

        palete_id = data.get('palete_id')
        sku = (data.get('sku') or '').strip()
        lote = (data.get('lote') or '').strip() or None
        dp = (data.get('data_producao') or '').strip() or None
        zona = (data.get('zona') or 'pulmao').strip().lower()
        sugestao = _sugerir_putaway(conn, sku, lote, dp, zona) if sku else {}
        dest_id = data.get('destino_localizacao_id') or sugestao.get('localizacao_id')
        if not palete_id or not dest_id:
            conn.close()
            return jsonify({'erro': 'Informe palete_id e destino (ou SKU para indicação automática).', 'sugestao': sugestao}), 400
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
        sug = _sugerir_putaway(
            conn,
            sku,
            (data.get('lote') or '').strip() or None,
            (data.get('data_producao') or '').strip() or None,
            (data.get('zona') or 'pulmao').strip().lower(),
        )
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
        resultados = [dict(r) for r in rows]
        resumo = None
        if q and len(q) >= 3:
            sku_exato = None
            for r in resultados:
                s = (r.get('sku') or '').strip()
                if s and s.upper() == q.upper():
                    sku_exato = s
                    break
            if not sku_exato and resultados:
                sku_exato = (resultados[0].get('sku') or '').strip()
            if sku_exato:
                resumo = _aplicar_estoque_real_dict(conn, {'sku': sku_exato}, sku_exato)
        conn.close()
        return jsonify({'resultados': resultados, 'resumo_estoque_real': resumo, 'fonte_estoque': 'wms'})
    except Exception as e:
        try:
            conn.close()
        except Exception:
            pass
        return jsonify({'erro': str(e)}), 500


@bp.route('/recebimentos/buscar-nf', methods=['GET'])
def api_wms_recebimentos_buscar_nf():
    """Busca NF no módulo descarga/recebimento (carreta) para preencher recebimento WMS."""
    numero_nf = (request.args.get('numero_nf') or request.args.get('nf') or '').strip()
    conn = _db()
    try:
        _ensure_wms_recebimento_terceiros_columns(conn)
        doc, err = _buscar_documento_terceiros_por_nf(conn, numero_nf)
        if err:
            conn.close()
            return jsonify({'erro': err}), 404
        doc = _enriquecer_documento_nf_wms(conn, doc)
        conn.close()
        return jsonify({'ok': True, 'documento': doc})
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
    _ensure_wms_recebimento_terceiros_columns(conn)
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
                finalizacao = _resumo_finalizacao_recebimento(conn, rid)
                conn.close()
                return jsonify({
                    'recebimento': dict(rec) if rec else None,
                    'paletes': [dict(p) for p in pals],
                    'perguntas': [dict(p) for p in perg],
                    'respostas': [dict(r) for r in resp],
                    'finalizacao': finalizacao,
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
        if acao == 'bip_palete':
            rid = data.get('recebimento_id')
            if not rid:
                conn.close()
                return jsonify({'erro': 'Informe recebimento_id.'}), 400
            etiqueta = (data.get('etiqueta') or '').strip()
            if etiqueta and len(etiqueta) != 22:
                conn.close()
                return jsonify({'erro': 'Etiqueta deve ter 22 caracteres.'}), 400
            if not etiqueta:
                etiqueta = _gerar_etiqueta_palete()
            existente = conn.execute(f'SELECT * FROM {t_pal} WHERE etiqueta = ?', (etiqueta,)).fetchone()
            palete_novo = False
            if existente:
                pid = existente['id'] if isinstance(existente, dict) else existente[0]
                if _is_pg(conn):
                    conn.execute(f"UPDATE {t_pal} SET recebimento_id = ?, atualizado_em = NOW() WHERE id = ?", (rid, pid))
                else:
                    conn.execute(f'UPDATE {t_pal} SET recebimento_id = ?, atualizado_em = ? WHERE id = ?', (rid, now, pid))
            else:
                palete_novo = True
                if _is_pg(conn):
                    cur = conn.execute(
                        f'''INSERT INTO {t_pal} (etiqueta, status, estado_fisico, recebimento_id, criado_em, atualizado_em, criado_por)
                            VALUES (?, 'em_conferencia', 'bom', ?, NOW(), NOW(), ?) RETURNING id''',
                        (etiqueta, rid, _usuario()),
                    )
                    pid = cur.fetchone()['id']
                else:
                    conn.execute(
                        f'''INSERT INTO {t_pal} (etiqueta, status, estado_fisico, recebimento_id, criado_em, atualizado_em, criado_por)
                            VALUES (?, 'em_conferencia', 'bom', ?, ?, ?, ?)''',
                        (etiqueta, rid, now, now, _usuario()),
                    )
                    pid = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
            vinc = conn.execute(
                f'SELECT 1 FROM {t_rp} WHERE recebimento_id = ? AND palete_id = ?', (rid, pid)
            ).fetchone()
            if not vinc:
                conn.execute(
                    f'INSERT INTO {t_rp} (recebimento_id, palete_id, estado_palete, conferencia_cega) VALUES (?, ?, ?, ?)',
                    (rid, pid, 'bom', _bind_bool(conn, True)),
                )
            if _is_pg(conn):
                conn.execute(f"UPDATE {t_rec} SET status = 'em_conferencia', atualizado_em = NOW() WHERE id = ?", (rid,))
            else:
                conn.execute(f"UPDATE {t_rec} SET status = 'em_conferencia', atualizado_em = ? WHERE id = ?", (now, rid))
            if palete_novo:
                _ensure_wms_palete_controle_table(conn)
                _registrar_controle_palete(
                    conn, pid, 'entrada',
                    subtipo='recebimento',
                    observacao='Palete criado na bipagem do recebimento',
                )
            conn.commit()
            conn.close()
            return jsonify({'ok': True, 'palete_id': pid, 'etiqueta': etiqueta})

        if acao == 'bip_produto':
            pid = data.get('palete_id')
            if not pid:
                conn.close()
                return jsonify({'erro': 'Informe palete_id (bipe o palete primeiro).'}), 400
            item = data.get('item') or {}
            sku = (item.get('sku') or '').strip()
            if not sku:
                conn.close()
                return jsonify({'erro': 'Informe SKU do produto.'}), 400
            dp = (item.get('data_producao') or '').strip() or None
            dv = (item.get('data_validade') or '').strip() or None
            if not dp:
                conn.close()
                return jsonify({'erro': 'Informe a data de produção na bipagem (FIFO).'}), 400
            if not dv:
                conn.close()
                return jsonify({'erro': 'Informe a data de validade na bipagem.'}), 400
            estado = data.get('estado_palete') or 'bom'
            lote = (item.get('lote') or '').strip() or None
            rg_up = (item.get('rg_caixa') or item.get('up') or '').strip() or None
            qtd_cx = int(item.get('quantidade_caixas') or 0)
            if qtd_cx < 1:
                conn.close()
                return jsonify({'erro': 'Informe a quantidade de caixas (mínimo 1).'}), 400
            conn.execute(
                f'''INSERT INTO {t_item}
                    (palete_id, sku, descricao, lote, data_producao, data_validade, sif,
                     quantidade_caixas, peso_liquido, rg_caixa, criado_em)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                (
                    pid, sku, item.get('descricao'), lote, dp,
                    dv, item.get('sif'),
                    qtd_cx, item.get('peso_liquido'),
                    rg_up, now,
                ),
            )
            bloqueios = _aplicar_bloqueios_palete(conn, pid, estado, dv, item.get('temperatura'))
            sug = _sugerir_putaway(conn, sku, lote, dp, 'pulmao')
            if not sug.get('codigo_endereco'):
                sug_pick = _sugerir_putaway(conn, sku, lote, dp, 'picking')
                if sug_pick.get('codigo_endereco'):
                    sug = sug_pick
            pal = conn.execute(f'SELECT etiqueta FROM {t_pal} WHERE id = ?', (pid,)).fetchone()
            etiqueta = (pal['etiqueta'] if isinstance(pal, dict) else pal[0]) if pal else None
            mov_id = _criar_mov_pendente_putaway(conn, pid, sug, 'Aguardando bip da longarina')
            pal_rec = conn.execute(f'SELECT recebimento_id FROM {t_pal} WHERE id = ?', (pid,)).fetchone()
            rid = (_row_dict(pal_rec) or {}).get('recebimento_id')
            if rid:
                if _is_pg(conn):
                    conn.execute(
                        f"UPDATE {t_rec} SET status = 'aguardando_armazenagem', atualizado_em = NOW() WHERE id = ? AND status NOT IN ('concluido', 'finalizado', 'cancelado')",
                        (rid,),
                    )
                else:
                    conn.execute(
                        f"UPDATE {t_rec} SET status = 'aguardando_armazenagem', atualizado_em = ? WHERE id = ? AND status NOT IN ('concluido', 'finalizado', 'cancelado')",
                        (now, rid),
                    )
            conn.commit()
            conn.close()
            return jsonify({
                'ok': True,
                'palete_id': pid,
                'etiqueta': etiqueta,
                'bloqueios': bloqueios,
                'sugestao': sug,
                'movimentacao_id': mov_id,
                'movimentacao_status': 'pendente' if mov_id else None,
                'mensagem': 'Datas registradas na bipagem. Status será atualizado após confirmar armazenagem.',
            })

        if acao == 'sugerir_destino':
            pid = data.get('palete_id')
            it = conn.execute(
                f'SELECT sku, lote, data_producao FROM {t_item} WHERE palete_id = ? ORDER BY id DESC LIMIT 1',
                (pid,),
            ).fetchone()
            if not it:
                conn.close()
                return jsonify({'erro': 'Palete sem produto conferido.'}), 400
            rd = _row_dict(it) or {}
            sug = _sugerir_putaway(conn, rd.get('sku'), rd.get('lote'), rd.get('data_producao'), 'pulmao')
            if not sug.get('codigo_endereco'):
                sug_pick = _sugerir_putaway(conn, rd.get('sku'), rd.get('lote'), rd.get('data_producao'), 'picking')
                if sug_pick.get('codigo_endereco'):
                    sug = sug_pick
            mov_id = _criar_mov_pendente_putaway(conn, pid, sug, 'Aguardando bip da longarina')
            conn.close()
            out = dict(sug)
            out['movimentacao_id'] = mov_id
            out['movimentacao_status'] = 'pendente' if mov_id else None
            return jsonify(out)

        if acao == 'confirmar_armazenagem':
            pid = data.get('palete_id')
            usar_sugestao = data.get('usar_sugestao', True)
            if usar_sugestao in (False, 0, '0', 'false', 'nao', 'não'):
                usar_sugestao = False
            else:
                usar_sugestao = True
            cod_bip = (data.get('codigo_endereco') or data.get('barcode_longarina') or '').strip()
            sug_aplicada = None
            if not pid or not cod_bip:
                conn.close()
                return jsonify({
                    'erro': 'Bipe a etiqueta da longarina ou coluna para validar a entrada.',
                    'sugestao': sug_aplicada,
                }), 400
            cod_resolvido = _resolver_codigo_endereco_bip(cod_bip) or cod_bip.upper()
            if usar_sugestao and pid:
                it_sug = conn.execute(
                    f'SELECT sku, lote, data_producao FROM {t_item} WHERE palete_id = ? ORDER BY id DESC LIMIT 1',
                    (pid,),
                ).fetchone()
                if it_sug:
                    rd_sug = _row_dict(it_sug) or {}
                    sug_aplicada = _sugerir_putaway(
                        conn, rd_sug.get('sku'), rd_sug.get('lote'), rd_sug.get('data_producao'), 'pulmao',
                    )
                    if not sug_aplicada.get('codigo_endereco'):
                        sug_pick = _sugerir_putaway(
                            conn, rd_sug.get('sku'), rd_sug.get('lote'), rd_sug.get('data_producao'), 'picking',
                        )
                        if sug_pick.get('codigo_endereco'):
                            sug_aplicada = sug_pick
                    if sug_aplicada and sug_aplicada.get('codigo_endereco'):
                        sug_cod = (sug_aplicada.get('codigo_endereco') or '').strip().upper()
                        sug_bc = (sug_aplicada.get('barcode_longarina') or '').strip()
                        bip_norm = cod_bip.strip()
                        if (cod_resolvido.upper() != sug_cod
                                and bip_norm != sug_bc
                                and bip_norm.upper() != (sug_bc or '').upper()):
                            conn.close()
                            return jsonify({
                                'erro': f'Bipe a longarina indicada ({sug_bc or sug_cod}), não {cod_bip}.',
                                'sugestao': sug_aplicada,
                            }), 400
            cod = cod_resolvido
            loc, err = _confirmar_armazenagem_palete(conn, pid, cod)
            if err:
                try:
                    conn.rollback()
                    conn.close()
                except Exception:
                    pass
                return jsonify({'erro': err}), 400
            status_skus = {}
            for sku in _skus_do_palete(conn, pid):
                status_skus[sku] = _sync_produto_estoque_cache(conn, sku)
            conn.commit()
            conn.close()
            resp_arm = {
                'ok': True,
                'localizacao': loc,
                'movimentacao_status': 'concluida',
                'movimentacao_id': (loc or {}).get('movimentacao_id'),
                'recebimento_status': (loc or {}).get('recebimento_status'),
                'status_atualizado': {k: v.get('status_condicional') for k, v in status_skus.items()},
            }
            if sug_aplicada:
                resp_arm['sugestao_aplicada'] = sug_aplicada
            return jsonify(resp_arm)

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
                    VALUES (?, ?, ?, ?)''',
                (rid, pid, estado, _bind_bool(conn, True)),
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

        if acao == 'excluir':
            rid = data.get('recebimento_id')
            if not rid:
                conn.close()
                return jsonify({'erro': 'Informe recebimento_id.'}), 400
            result, err = _excluir_recebimento_wms(conn, int(rid))
            if err:
                try:
                    conn.rollback()
                    conn.close()
                except Exception:
                    pass
                return jsonify({'erro': err}), 400
            conn.commit()
            conn.close()
            return jsonify(result)

        if acao == 'finalizar':
            rid = data.get('recebimento_id')
            if not rid:
                conn.close()
                return jsonify({'erro': 'Informe recebimento_id.'}), 400
            resumo_fin = _resumo_finalizacao_recebimento(conn, rid)
            if not resumo_fin or not resumo_fin.get('pode_finalizar'):
                conn.close()
                msg = (resumo_fin or {}).get('motivo') or 'Recebimento ainda não está pronto para finalizar.'
                return jsonify({'erro': msg, 'finalizacao': resumo_fin}), 400
            for resp in data.get('respostas') or []:
                conn.execute(
                    f'''INSERT INTO {t_cqr} (recebimento_id, pergunta_id, resposta, valor_numerico, respondido_em, respondido_por)
                        VALUES (?, ?, ?, ?, ?, ?)''',
                    (rid, resp.get('pergunta_id'), resp.get('resposta'), resp.get('valor_numerico'), now, _usuario()),
                )
            if _is_pg(conn):
                conn.execute(
                    f"UPDATE {t_rec} SET status = 'finalizado', check_qualidade_ok = TRUE, atualizado_em = NOW() WHERE id = ?",
                    (rid,),
                )
            else:
                conn.execute(
                    f"UPDATE {t_rec} SET status = 'finalizado', check_qualidade_ok = 1, atualizado_em = ? WHERE id = ?",
                    (now, rid),
                )
            rec_vinc = conn.execute(
                f'SELECT terceiros_documento_id FROM {t_rec} WHERE id = ?', (rid,)
            ).fetchone()
            terceiros_sync = None
            doc_ter = (_row_dict(rec_vinc) or {}).get('terceiros_documento_id')
            if doc_ter:
                ok_t, err_t = _concluir_terceiros_recebimento_wms(conn, doc_ter)
                if ok_t:
                    terceiros_sync = {
                        'documento_id': int(doc_ter),
                        'recebimento_concluido': True,
                        'mensagem': 'Pendência de recebimento atualizada no módulo de descarga.',
                    }
                else:
                    terceiros_sync = {'documento_id': int(doc_ter), 'erro': err_t}
            conn.commit()
            conn.close()
            return jsonify({'ok': True, 'status': 'finalizado', 'finalizacao': resumo_fin, 'terceiros': terceiros_sync})

        ter_doc_id = data.get('terceiros_documento_id')
        ter_area = (data.get('terceiros_area') or '').strip().lower()
        numero_nf = (data.get('numero_nf') or '').strip()
        if not ter_doc_id and numero_nf:
            found, _err_nf = _buscar_documento_terceiros_por_nf(conn, numero_nf)
            if found and not found.get('recebimento_concluido'):
                ter_doc_id = found.get('documento_id')
                ter_area = found.get('area') or ter_area
        origem = (data.get('origem') or '').strip()
        if not origem:
            if ter_area == 'carreta':
                origem = 'carreta'
            elif ter_doc_id:
                origem = 'terceiros'
            else:
                origem = 'manual'
        fornecedor = data.get('fornecedor')
        placa = data.get('placa')
        if ter_doc_id and numero_nf:
            found, _ = _buscar_documento_terceiros_por_nf(conn, numero_nf)
            if found:
                if not fornecedor:
                    fornecedor = found.get('fornecedor')
                if not placa:
                    placa = found.get('placa')
                if not ter_area:
                    ter_area = found.get('area') or ''

        if _is_pg(conn):
            cur = conn.execute(
                f'''INSERT INTO {t_rec} (numero_nf, fornecedor, placa, doca, origem, status,
                    terceiros_documento_id, terceiros_area, criado_em, atualizado_em, criado_por)
                    VALUES (?, ?, ?, ?, ?, 'aguardando', ?, ?, NOW(), NOW(), ?) RETURNING id''',
                (
                    numero_nf or data.get('numero_nf'), fornecedor, placa, data.get('doca'),
                    origem, ter_doc_id, ter_area or None, _usuario(),
                ),
            )
            new_id = cur.fetchone()['id']
        else:
            conn.execute(
                f'''INSERT INTO {t_rec} (numero_nf, fornecedor, placa, doca, origem, status,
                    terceiros_documento_id, terceiros_area, criado_em, atualizado_em, criado_por)
                    VALUES (?, ?, ?, ?, ?, 'aguardando', ?, ?, ?, ?, ?)''',
                (
                    numero_nf or data.get('numero_nf'), fornecedor, placa, data.get('doca'),
                    origem, ter_doc_id, ter_area or None, now, now, _usuario(),
                ),
            )
            new_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]
        conn.commit()
        conn.close()
        return jsonify({
            'ok': True,
            'id': new_id,
            'terceiros_documento_id': ter_doc_id,
            'origem': origem,
        })
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
    try:
        zona = _listar_zoneamento(conn)
        conn.close()
        return jsonify({'zoneamento': zona})
    except Exception as e:
        try:
            conn.close()
        except Exception:
            pass
        return jsonify({'erro': str(e)}), 500


def _loc_etiqueta_data(loc):
    """Dados para etiqueta de longarina (modelo Rua · Prédio · Nível · Apto + barcode 21.13.1.1)."""
    d = _row_dict(loc) or {}
    cam = int(d.get('camara') or 0)
    rua = str(d.get('rua') or '').strip().upper()
    pos = int(d.get('posicao') or 0)
    niv = int(d.get('nivel') or 1)
    apto = _rua_para_apto(cam, rua)
    cod = (d.get('codigo_endereco') or _codigo_endereco(cam, rua, pos, niv)).upper()
    bc_long = _barcode_longarina(cam, pos, niv, apto=apto)
    picking = niv == 1 or (d.get('zona_armazenagem') or '').lower() == 'picking'
    return {
        'rua_num': str(cam),
        'predio': str(pos),
        'nivel': str(niv),
        'apto': str(apto),
        'codigo': cod,
        'barcode': bc_long,
        'dotted': bc_long,
        'picking': picking,
        'zona': 'PICKING' if picking else 'PULMÃO',
        'cat': (d.get('categoria_zona') or d.get('area') or '').strip().upper(),
    }


def _agrupar_etiquetas_faixas(loc_rows):
    """Agrupa localizações em faixas (coluna = mesma rua+prédio+apto, níveis ordenados)."""
    grupos = {}
    for loc in loc_rows:
        e = _loc_etiqueta_data(loc)
        chave = (e['rua_num'], e['predio'], e['apto'])
        grupos.setdefault(chave, []).append(e)
    faixas = []
    for (rua_num, predio, apto), etiquetas in sorted(
        grupos.items(), key=lambda x: (int(x[0][0]), int(x[0][1]), int(x[0][2])),
    ):
        etiquetas.sort(key=lambda x: int(x['nivel']))
        faixas.append({
            'titulo': f'Rua {rua_num} · Prédio {predio} · Apto {apto}',
            'camara': rua_num,
            'etiquetas': etiquetas,
        })
    total = sum(len(f['etiquetas']) for f in faixas)
    return faixas, total


def _agrupar_faixas_por_camara(faixas):
    blocos = {}
    for f in faixas:
        cam = str((f.get('camara') or (f.get('etiquetas') or [{}])[0].get('rua_num') or ''))
        if cam not in blocos:
            blocos[cam] = {'camara': cam, 'faixas': [], 'total_niveis': 0}
        blocos[cam]['faixas'].append(f)
        blocos[cam]['total_niveis'] += len(f.get('etiquetas') or [])
    return [blocos[k] for k in sorted(blocos.keys(), key=lambda x: int(x) if str(x).isdigit() else x)]


def _resumo_etiquetas_longarina(conn, sincronizar=False):
    """Contagem de endereços/longarinas para impressão em lote."""
    if sincronizar:
        _ensure_layout_enderecos_atualizado(conn)
    else:
        _ensure_layout_enderecos(conn)
    t_loc = _tbl(conn, 'wms_localizacao')
    niveis_cfg = _layout_niveis_esperados()
    n_esp = max(niveis_cfg.values()) if niveis_cfg else 5
    total = _int_col(conn.execute(f'SELECT COUNT(*) AS c FROM {t_loc}').fetchone(), 'c')
    mx = _int_col(conn.execute(f'SELECT MAX(nivel) AS mx FROM {t_loc}').fetchone(), 'mx')
    incompletas = _int_col(conn.execute(
        f'''SELECT COUNT(*) AS c FROM (
                SELECT camara, posicao, rua FROM {t_loc}
                GROUP BY camara, posicao, rua
                HAVING COUNT(DISTINCT nivel) < ?
            ) t''',
        (n_esp,),
    ).fetchone(), 'c')
    rows_cam = conn.execute(
        f'''SELECT camara, COUNT(*) AS etiquetas
            FROM {t_loc} GROUP BY camara ORDER BY camara''',
    ).fetchall()
    colunas = conn.execute(
        f'''SELECT camara, rua, posicao, COUNT(*) AS niveis
            FROM {t_loc}
            GROUP BY camara, rua, posicao
            ORDER BY camara, rua, posicao''',
    ).fetchall()
    por_camara = []
    cols_por_cam = {}
    for c in colunas or []:
        rd = _row_dict(c) or {}
        cam = int(rd.get('camara') or 0)
        cols_por_cam[cam] = cols_por_cam.get(cam, 0) + 1
    for r in rows_cam or []:
        rd = _row_dict(r) or {}
        cam = int(rd.get('camara') or 0)
        por_camara.append({
            'camara': cam,
            'etiquetas': int(rd.get('etiquetas') or 0),
            'colunas': cols_por_cam.get(cam, 0),
        })
    return {
        'total_etiquetas': total,
        'total_colunas': len(colunas or []),
        'niveis_config': n_esp,
        'max_nivel_banco': mx,
        'colunas_incompletas': incompletas,
        'por_camara': por_camara,
    }


def _render_etiquetas_endereco(conn, camara=None, rua=None, posicao=None, codigo=None, auto_print=False, todas=False):
    _ensure_zona_armazenagem_column(conn)
    if _precisa_regenerar_layout_niveis(conn):
        _ensure_layout_enderecos_atualizado(conn)
    else:
        _ensure_layout_enderecos(conn)
    t_loc = _tbl(conn, 'wms_localizacao')
    if codigo:
        cod_busca = _resolver_codigo_endereco_bip(codigo) or codigo
        row = conn.execute(
            f'SELECT * FROM {t_loc} WHERE codigo_endereco = ? OR codigo_endereco = ?',
            (cod_busca, cod_busca.upper()),
        ).fetchone()
        rows = [row] if row else []
    else:
        sql = f'SELECT * FROM {t_loc} WHERE 1=1'
        params = []
        if not todas:
            if camara:
                sql += ' AND camara = ?'
                params.append(int(camara))
            if rua:
                sql += ' AND UPPER(TRIM(rua)) = ?'
                params.append(str(rua).strip().upper())
            if posicao:
                sql += ' AND posicao = ?'
                params.append(int(posicao))
        sql += ' ORDER BY camara, rua, posicao, nivel'
        rows = conn.execute(sql, tuple(params)).fetchall()
    if not rows:
        return None, 'Nenhum endereço encontrado. Use o painel WMS para gerar o layout ou clique em Atualizar resumo.'
    faixas, total = _agrupar_etiquetas_faixas(rows)
    if codigo:
        titulo = codigo
    elif todas:
        titulo = 'Armazém completo'
    elif camara and rua and posicao:
        titulo = f'Coluna câm {camara} · rua {rua} · pos {posicao}'
    elif camara:
        titulo = f'Câmara {camara}'
    else:
        titulo = 'Lote'
    agrupado = _agrupar_faixas_por_camara(faixas) if (todas or (camara and not rua and not posicao)) else None
    html = render_template(
        'wms/etiquetas_endereco.html',
        faixas=faixas,
        agrupado_por_camara=agrupado,
        total=total,
        titulo=titulo,
        auto_print=auto_print,
    )
    return html, None


def _texto_destino_etiqueta(sug):
    """Texto do endereço para etiqueta de palete e UI."""
    if not sug or not sug.get('codigo_endereco'):
        return None, None, None
    bc = (sug.get('barcode_longarina') or sug.get('codigo_endereco') or '').strip()
    txt = (sug.get('texto') or '').strip()
    zona = (sug.get('zona_label') or '').strip()
    linha = bc
    if txt:
        linha = f'{bc} — {txt}'
    elif zona:
        linha = f'{bc} ({zona})'
    return linha, bc, txt or None


def _html_etiqueta_palete(etiqueta, sku=None, lote=None, qtd=None, descricao=None, data_producao=None, data_validade=None, destino=None, endereco_barcode=None, endereco_texto=None, up=None, auto_print=True):
    return render_template(
        'wms/etiqueta_palete.html',
        etiqueta=etiqueta,
        sku=sku,
        lote=lote,
        qtd=qtd,
        descricao=descricao,
        data_producao=data_producao,
        data_validade=data_validade,
        destino=destino,
        endereco_barcode=endereco_barcode,
        endereco_texto=endereco_texto,
        up=up,
        auto_print=auto_print,
    )


@bp.route('/etiqueta', methods=['GET'])
def api_wms_etiqueta():
    etiqueta = (request.args.get('etiqueta') or '').strip()
    if not etiqueta:
        return jsonify({'erro': 'Informe etiqueta.'}), 400
    conn = _db()
    ensure_wms_schema(conn)
    t_pal = _tbl(conn, 'wms_palete')
    t_item = _tbl(conn, 'wms_palete_item')
    try:
        pal = conn.execute(f'SELECT id FROM {t_pal} WHERE etiqueta = ?', (etiqueta,)).fetchone()
        sku = lote = descricao = data_producao = data_validade = up = None
        qtd = None
        destino = (request.args.get('destino') or '').strip() or None
        endereco_barcode = (request.args.get('barcode_longarina') or '').strip() or None
        endereco_texto = (request.args.get('endereco_texto') or '').strip() or None
        if pal:
            pid = pal['id'] if isinstance(pal, dict) else pal[0]
            it = conn.execute(
                f'''SELECT sku, descricao, lote, data_producao, data_validade, quantidade_caixas, rg_caixa
                    FROM {t_item} WHERE palete_id = ? ORDER BY id DESC LIMIT 1''',
                (pid,),
            ).fetchone()
            if it:
                rd = _row_dict(it) or {}
                sku = rd.get('sku')
                lote = rd.get('lote')
                qtd = rd.get('quantidade_caixas')
                descricao = rd.get('descricao')
                data_producao = rd.get('data_producao')
                data_validade = rd.get('data_validade')
                up = rd.get('rg_caixa')
                if not destino and sku:
                    sug = _sugerir_putaway(conn, sku, lote, data_producao, 'pulmao')
                    if not sug.get('codigo_endereco'):
                        sug_pick = _sugerir_putaway(conn, sku, lote, data_producao, 'picking')
                        if sug_pick.get('codigo_endereco'):
                            sug = sug_pick
                    destino, endereco_barcode, endereco_texto = _texto_destino_etiqueta(sug)
        auto_print = request.args.get('auto_print', '1') != '0'
        conn.close()
        html = _html_etiqueta_palete(
            etiqueta, sku, lote, qtd, descricao, data_producao, data_validade,
            destino=destino,
            endereco_barcode=endereco_barcode,
            endereco_texto=endereco_texto,
            up=up,
            auto_print=auto_print,
        )
        return make_response(html, 200, {'Content-Type': 'text/html; charset=utf-8'})
    except Exception as e:
        try:
            conn.close()
        except Exception:
            pass
        return jsonify({'erro': str(e)}), 500


@bp.route('/etiqueta/modelo', methods=['GET'])
def api_wms_etiqueta_modelo():
    """Preview dos modelos de etiqueta (sem depender do banco)."""
    tipo = (request.args.get('tipo') or 'endereco').strip().lower()
    if tipo == 'palete':
        html = _html_etiqueta_palete(
            'UP12345678901234567890',
            sku='1234567',
            lote='L202501',
            qtd=48,
            descricao='Pão de forma integral 500g',
            data_producao='2025-06-01',
            data_validade='2025-12-01',
            destino='21.13.1.1 — Rua 11 · Prédio 1 · Nív 1 · Apto 1 (PULMÃO)',
            endereco_barcode='21.13.1.1',
            endereco_texto='Rua 11 · Prédio 1 · Nív 1 · Apto 1 (PULMÃO)',
            up='5020',
            auto_print=False,
        )
        return make_response(html, 200, {'Content-Type': 'text/html; charset=utf-8'})
    faixas = [{
        'titulo': 'Rua 21 · Prédio 13 · Apto 1 — exemplo (5 níveis: 1 PICKING + 4 PULMÃO)',
        'etiquetas': [
            {'rua_num': '21', 'predio': '13', 'nivel': str(n), 'apto': '1',
             'barcode': f'21.13.{n}.1', 'dotted': f'21.13.{n}.1',
             'picking': n == 1, 'zona': 'PICKING' if n == 1 else 'PULMÃO'}
            for n in range(1, 6)
        ],
    }]
    html = render_template(
        'wms/etiquetas_endereco.html',
        faixas=faixas,
        total=5,
        titulo='Modelo',
        auto_print=False,
    )
    return make_response(html, 200, {'Content-Type': 'text/html; charset=utf-8'})


@bp.route('/etiqueta/endereco', methods=['GET'])
def api_wms_etiqueta_endereco():
    codigo = (request.args.get('codigo') or request.args.get('endereco') or '').strip()
    if not codigo:
        return jsonify({'erro': 'Informe codigo/endereco (ex.: 21.13.1.1 ou 21-R-01-1).'}), 400
    conn = _db()
    ensure_wms_schema(conn)
    try:
        auto_print = request.args.get('auto_print', '0') == '1'
        html, err = _render_etiquetas_endereco(conn, codigo=codigo, auto_print=auto_print)
        conn.close()
        if err:
            return jsonify({'erro': err}), 404
        return make_response(html, 200, {'Content-Type': 'text/html; charset=utf-8'})
    except Exception as e:
        try:
            conn.close()
        except Exception:
            pass
        return jsonify({'erro': str(e)}), 500


@bp.route('/etiqueta/enderecos/resumo', methods=['GET'])
def api_wms_etiqueta_enderecos_resumo():
    """Resumo para instalação: quantas longarinas imprimir por câmara."""
    sincronizar = (request.args.get('sync') or '').strip().lower() in ('1', 'true', 'sim')
    conn = _db()
    ensure_wms_schema(conn)
    try:
        data = _resumo_etiquetas_longarina(conn, sincronizar=sincronizar)
        conn.close()
        return jsonify(data)
    except Exception as e:
        try:
            conn.close()
        except Exception:
            pass
        return jsonify({'erro': str(e)}), 500


@bp.route('/etiqueta/enderecos', methods=['GET'])
def api_wms_etiqueta_enderecos():
    """Impressão em lote: armazém inteiro, câmara, ou coluna (câmara+rua+posição)."""
    conn = _db()
    ensure_wms_schema(conn)
    todas = (request.args.get('todas') or '').strip().lower() in ('1', 'true', 'sim', 'all')
    camara = request.args.get('camara', type=int)
    rua = (request.args.get('rua') or '').strip() or None
    posicao = request.args.get('posicao', type=int)
    if not todas and not camara and not rua and not posicao:
        return jsonify({'erro': 'Informe todas=1, camara, ou coluna (camara+rua+posicao).'}), 400
    try:
        auto_print = request.args.get('auto_print', '0') == '1'
        html, err = _render_etiquetas_endereco(
            conn,
            camara=camara,
            rua=rua,
            posicao=posicao,
            auto_print=auto_print,
            todas=todas,
        )
        conn.close()
        if err:
            return jsonify({'erro': err}), 404
        return make_response(html, 200, {'Content-Type': 'text/html; charset=utf-8'})
    except Exception as e:
        try:
            conn.close()
        except Exception:
            pass
        return jsonify({'erro': str(e)}), 500


@bp.route('/etiqueta/nf-itens', methods=['GET'])
def api_wms_etiqueta_nf_itens():
    """Etiquetas de produto (SKU/EAN) dos itens da NF — impressão Zebra antes da bipagem."""
    documento_id = request.args.get('documento_id', type=int)
    numero_nf = (request.args.get('numero_nf') or request.args.get('nf') or '').strip()
    sku = (request.args.get('sku') or '').strip() or None
    n_item = request.args.get('n_item')
    auto_print = request.args.get('auto_print', '1') != '0'
    if not documento_id and not numero_nf:
        return jsonify({'erro': 'Informe documento_id ou numero_nf.'}), 400
    conn = _db()
    try:
        _ensure_wms_recebimento_terceiros_columns(conn)
        if documento_id:
            t_doc = _tbl_terceiros_doc(conn)
            row = conn.execute(
                f'''SELECT id, area, numero_nf, serie_nf, remetente_nome, recebimento_concluido
                    FROM {t_doc} WHERE id = ?''',
                (int(documento_id),),
            ).fetchone()
            if not row:
                conn.close()
                return jsonify({'erro': 'Documento não encontrado.'}), 404
            doc, err = _buscar_documento_terceiros_por_nf(conn, (_row_dict(row) or {}).get('numero_nf') or numero_nf)
        else:
            doc, err = _buscar_documento_terceiros_por_nf(conn, numero_nf)
        if err or not doc:
            conn.close()
            return jsonify({'erro': err or 'NF não encontrada.'}), 404
        itens = _itens_para_etiquetas_nf(doc, sku_filtro=sku, n_item_filtro=n_item)
        if not itens:
            conn.close()
            return jsonify({'erro': 'Nenhum item para imprimir.'}), 404
        conn.close()
        html = _html_etiquetas_produto_nf(doc, auto_print=auto_print, sku_filtro=sku, n_item_filtro=n_item)
        return make_response(html, 200, {'Content-Type': 'text/html; charset=utf-8'})
    except Exception as e:
        try:
            conn.close()
        except Exception:
            pass
        return jsonify({'erro': str(e)}), 500


@bp.route('/paletes/controle', methods=['GET', 'POST'])
def api_wms_paletes_controle():
    conn = _db()
    ensure_wms_schema(conn)
    try:
        if request.method == 'GET':
            if (request.args.get('lista') or '').strip().lower() == 'fora':
                linhas = _listar_paletes_fora(conn)
                conn.close()
                return jsonify({'paletes_fora': linhas, 'total': len(linhas)})
            etiqueta = (request.args.get('etiqueta') or '').strip()
            palete_id = request.args.get('palete_id', type=int)
            if not etiqueta and not palete_id:
                return jsonify({'erro': 'Informe etiqueta, palete_id ou lista=fora.'}), 400
            if etiqueta:
                pal = _obter_palete_por_etiqueta(conn, etiqueta)
                if not pal:
                    conn.close()
                    return jsonify({'erro': 'Palete não encontrado para esta etiqueta.'}), 404
                palete_id = pal['id']
            info = _info_palete_controle(conn, palete_id)
            conn.close()
            if not info:
                return jsonify({'erro': 'Palete não encontrado.'}), 404
            return jsonify(info)

        data = request.get_json() or {}
        acao = (data.get('acao') or '').strip().lower()
        etiqueta = (data.get('etiqueta') or '').strip()
        palete_id = data.get('palete_id')
        if etiqueta:
            pal = _obter_palete_por_etiqueta(conn, etiqueta)
            if not pal:
                conn.close()
                return jsonify({'erro': 'Palete não encontrado para esta etiqueta.'}), 404
            palete_id = pal['id']
        if not palete_id:
            conn.close()
            return jsonify({'erro': 'Informe etiqueta ou palete_id.'}), 400
        palete_id = int(palete_id)

        if acao == 'saida':
            motivo = (data.get('motivo') or 'nao_informado').strip()
            destino = (data.get('destino_externo') or '').strip() or None
            obs = (data.get('observacao') or '').strip() or None
            result, err = _registrar_saida_palete(conn, palete_id, motivo, destino_externo=destino, observacao=obs)
            if err:
                conn.rollback()
                conn.close()
                return jsonify({'erro': err}), 400
            conn.commit()
            info = _info_palete_controle(conn, palete_id)
            conn.close()
            return jsonify({'ok': True, 'acao': 'saida', 'resultado': result, **(info or {})})

        if acao == 'retorno':
            motivo = (data.get('motivo') or 'retorno').strip()
            cod_end = (data.get('codigo_endereco') or '').strip() or None
            obs = (data.get('observacao') or '').strip() or None
            result, err = _registrar_retorno_palete(
                conn, palete_id, motivo=motivo, codigo_endereco=cod_end, observacao=obs,
            )
            if err:
                conn.rollback()
                conn.close()
                return jsonify({'erro': err}), 400
            conn.commit()
            info = _info_palete_controle(conn, palete_id)
            conn.close()
            return jsonify({'ok': True, 'acao': 'retorno', 'resultado': result, **(info or {})})

        conn.close()
        return jsonify({'erro': 'Ação inválida. Use saida ou retorno.'}), 400
    except Exception as e:
        try:
            conn.rollback()
            conn.close()
        except Exception:
            pass
        return jsonify({'erro': str(e)}), 500


@bp.route('/historico-nf', methods=['GET'])
def api_wms_historico_nf():
    recebimento_id = request.args.get('recebimento_id', type=int)
    numero_nf = (request.args.get('numero_nf') or '').strip()
    if not recebimento_id and not numero_nf:
        return jsonify({'erro': 'Informe numero_nf ou recebimento_id.'}), 400
    conn = _db()
    ensure_wms_schema(conn)
    _ensure_wms_recebimento_terceiros_columns(conn)
    try:
        data, err = _historico_recebimento_nf(conn, recebimento_id=recebimento_id, numero_nf=numero_nf)
        conn.close()
        if err:
            return jsonify({'erro': err}), 404
        return jsonify(data)
    except Exception as e:
        try:
            conn.close()
        except Exception:
            pass
        return jsonify({'erro': str(e)}), 500


@bp.route('/relatorios', methods=['GET'])
def api_wms_relatorios():
    tipo = (request.args.get('tipo') or 'recebimentos').strip().lower()
    data_inicio = (request.args.get('data_inicio') or '').strip() or None
    data_fim = (request.args.get('data_fim') or '').strip() or None
    conn = _db()
    ensure_wms_schema(conn)
    try:
        data = _relatorio_wms(conn, tipo, data_inicio=data_inicio, data_fim=data_fim)
        conn.close()
        if not data:
            return jsonify({'erro': f'Tipo de relatório inválido: {tipo}'}), 400
        return jsonify(data)
    except Exception as e:
        try:
            conn.close()
        except Exception:
            pass
        return jsonify({'erro': str(e)}), 500


@bp.route('/picking', methods=['GET'])
def api_wms_picking():
    id_roteiro = (request.args.get('id_roteiro') or '').strip()
    id_viagem = (request.args.get('id_viagem') or '').strip()
    if not id_roteiro or not id_viagem:
        return jsonify({'erro': 'Informe id_roteiro e id_viagem.'}), 400
    conn = _db()
    ensure_wms_schema(conn)
    try:
        lista, err = _lista_picking_roteiro(conn, id_roteiro, id_viagem)
        conn.close()
        if err:
            return jsonify({'erro': err, 'itens': lista}), 404 if not lista else 200
        return jsonify({
            'id_roteiro': id_roteiro,
            'id_viagem': id_viagem,
            'itens': lista,
            'total_linhas': len(lista),
            'fonte_estoque': 'wms',
        })
    except Exception as e:
        try:
            conn.close()
        except Exception:
            pass
        return jsonify({'erro': str(e)}), 500
