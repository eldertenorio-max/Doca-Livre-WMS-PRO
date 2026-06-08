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
    return {
        **d,
        'zona_armazenagem': zona,
        'zona_label': zl,
        'texto': f'Câm.{cam} · Rua {rua} · Pos {pos} · Nív {niv} ({zl})',
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
    t_prod = _tbl(conn, 'wms_produto_enderecamento')
    rows = conn.execute(f'SELECT sku FROM {t_prod} WHERE {_ativo_sql(conn)}').fetchall()
    out = {}
    for r in rows:
        sku = (_row_dict(r) or {}).get('sku') or (r[0] if not isinstance(r, dict) else None)
        if not sku:
            continue
        st = _info_produto_wms(conn, sku)['status_condicional']
        out[st] = out.get(st, 0) + 1
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
        _ensure_zona_armazenagem_column(conn)
        _ensure_produto_planejamento_columns(conn)
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


def _sugerir_putaway(conn, sku, lote=None, data_producao=None, zona='pulmao'):
    """Putaway por categoria A/B/C/D + planejamento + zona + FIFO."""
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

    if lote:
        row = conn.execute(
            f'''SELECT l.id, l.codigo_endereco, l.camara, l.rua, l.posicao, l.nivel, l.zona_armazenagem
                FROM {t_loc} l
                JOIN {t_pal} p ON p.localizacao_id = l.id
                JOIN {t_item} i ON i.palete_id = p.id
                WHERE i.sku = ? AND i.lote = ? AND l.status = 'ocupada'
                  AND UPPER(TRIM(COALESCE(l.categoria_zona, ''))) = ?
                  AND (p.bloqueio_tipo IS NULL OR p.bloqueio_tipo = '')
                LIMIT 1''',
            (sku, lote, cat),
        ).fetchone()
        if row:
            motivo.append('Adensamento: mesmo SKU e lote')
            loc = _format_locacao(row)
            return {
                'localizacao_id': loc.get('id'),
                'codigo_endereco': loc.get('codigo_endereco'),
                'camara': loc.get('camara'),
                'zona_armazenagem': loc.get('zona_armazenagem'),
                'zona_label': loc.get('zona_label'),
                'texto': loc.get('texto'),
                'motivo': motivo,
                'status_condicional': status,
                'posicoes_wms': pos_wms,
                'posicoes_planejadas': pos_med,
                'alerta': alerta,
            }

    fifo_ref = None
    try:
        if data_producao:
            fifo_ref = date.fromisoformat(str(data_producao)[:10])
    except Exception:
        fifo_ref = None

    if fifo_ref:
        old_row = conn.execute(
            f'''SELECT l.rua, l.posicao, l.camara
                FROM {t_loc} l
                JOIN {t_pal} p ON p.localizacao_id = l.id
                JOIN {t_item} i ON i.palete_id = p.id
                WHERE i.sku = ? AND l.status = 'ocupada'
                  AND UPPER(TRIM(COALESCE(l.categoria_zona, ''))) = ?
                  AND i.data_producao IS NOT NULL
                  AND (p.bloqueio_tipo IS NULL OR p.bloqueio_tipo = '')
                ORDER BY i.data_producao ASC, l.rua, l.posicao, l.nivel
                LIMIT 1''',
            (sku, cat),
        ).fetchone()
        if old_row:
            od = _row_dict(old_row) or {}
            motivo.append(f'FIFO: estoque mais antigo em Rua {od.get("rua")} Pos {od.get("posicao")}')

    cluster = _rua_cluster_sku(conn, sku, cat)
    zona_sql = _filtro_zona_sql(zona, 'l')
    order_cluster = ''
    params_extra = []
    if cluster.get('camara') and cluster.get('rua'):
        order_cluster = 'CASE WHEN l.camara = ? AND UPPER(TRIM(l.rua)) = ? THEN 0 ELSE 1 END, '
        params_extra = [cluster['camara'], str(cluster['rua']).upper()]
        motivo.append(f'Cluster: preferir Rua {cluster["rua"]} (Câm {cluster["camara"]})')

    for cam in cam_list:
        row = conn.execute(
            f'''SELECT l.id, l.codigo_endereco, l.camara, l.rua, l.posicao, l.nivel, l.zona_armazenagem
                FROM {t_loc} l
                WHERE l.camara = ? AND l.status = 'vazia'
                  AND UPPER(TRIM(COALESCE(l.categoria_zona, ''))) = ?
                  AND {zona_sql}
                  AND (l.bloqueio_entrada IS FALSE OR l.bloqueio_entrada = 0)
                ORDER BY {order_cluster}l.rua, l.posicao, l.nivel
                LIMIT 1''',
            tuple([cam, cat, *params_extra]),
        ).fetchone()
        if row:
            motivo.append(f'Câmara {cam} — posição vazia compatível')
            loc = _format_locacao(row)
            return {
                'localizacao_id': loc.get('id'),
                'codigo_endereco': loc.get('codigo_endereco'),
                'camara': loc.get('camara'),
                'zona_armazenagem': loc.get('zona_armazenagem'),
                'zona_label': loc.get('zona_label'),
                'texto': loc.get('texto'),
                'motivo': motivo,
                'status_condicional': status,
                'posicoes_wms': pos_wms,
                'posicoes_planejadas': pos_med,
                'alerta': alerta,
            }

    motivo.append('Nenhuma posição vazia nas câmaras do zoneamento')
    return {
        'localizacao_id': None,
        'codigo_endereco': None,
        'camara': None,
        'zona_label': _zona_label(zona),
        'texto': None,
        'motivo': motivo,
        'status_condicional': status,
        'posicoes_wms': pos_wms,
        'posicoes_planejadas': pos_med,
        'alerta': alerta,
    }


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
                AND (l.bloqueio_saida IS FALSE OR l.bloqueio_saida = 0)'''
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


def _confirmar_armazenagem_palete(conn, palete_id, codigo_endereco):
    t_pal = _tbl(conn, 'wms_palete')
    t_loc = _tbl(conn, 'wms_localizacao')
    t_mov = _tbl(conn, 'wms_movimentacao')
    now = _now_iso()
    pal = conn.execute(f'SELECT * FROM {t_pal} WHERE id = ?', (palete_id,)).fetchone()
    if not pal:
        return None, 'Palete não encontrado.'
    loc = conn.execute(
        f'''SELECT * FROM {t_loc} WHERE codigo_endereco = ? OR codigo_endereco = ?''',
        (codigo_endereco, codigo_endereco.upper()),
    ).fetchone()
    if not loc:
        return None, 'Endereço não encontrado.'
    ld = _row_dict(loc) or {}
    if ld.get('status') != 'vazia':
        return None, 'Endereço não está vazio.'
    pid = pal['id'] if isinstance(pal, dict) else pal[0]
    dest_id = ld.get('id')
    orig = pal.get('localizacao_id') if isinstance(pal, dict) else None
    obs = f'Armazenagem confirmada em {ld.get("codigo_endereco")}'
    if _is_pg(conn):
        conn.execute(
            f'''INSERT INTO {t_mov} (tipo, palete_id, origem_localizacao_id, destino_localizacao_id,
                status, prioridade, observacao, criado_em, criado_por, concluida_em, concluida_por)
                VALUES ('putaway', ?, ?, ?, 'concluida', 1, ?, NOW(), ?, NOW(), ?)''',
            (pid, orig, dest_id, obs, _usuario(), _usuario()),
        )
        conn.execute(f"UPDATE {t_loc} SET status = 'ocupada', atualizado_em = NOW() WHERE id = ?", (dest_id,))
        if orig:
            conn.execute(f"UPDATE {t_loc} SET status = 'vazia', atualizado_em = NOW() WHERE id = ?", (orig,))
        conn.execute(
            f"UPDATE {t_pal} SET localizacao_id = ?, status = 'armazenado', atualizado_em = NOW() WHERE id = ?",
            (dest_id, pid),
        )
    else:
        conn.execute(
            f'''INSERT INTO {t_mov} (tipo, palete_id, origem_localizacao_id, destino_localizacao_id,
                status, prioridade, observacao, criado_em, criado_por, concluida_em, concluida_por)
                VALUES ('putaway', ?, ?, ?, 'concluida', 1, ?, ?, ?, ?, ?)''',
            (pid, orig, dest_id, obs, now, _usuario(), now, _usuario()),
        )
        conn.execute(f"UPDATE {t_loc} SET status = 'ocupada', atualizado_em = ? WHERE id = ?", (now, dest_id))
        if orig:
            conn.execute(f"UPDATE {t_loc} SET status = 'vazia', atualizado_em = ? WHERE id = ?", (now, orig))
        conn.execute(
            f"UPDATE {t_pal} SET localizacao_id = ?, status = 'armazenado', atualizado_em = ? WHERE id = ?",
            (dest_id, now, pid),
        )
    return _format_locacao(loc), None


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
        _ensure_produto_planejamento_columns(conn)
        t_prod = _tbl(conn, 'wms_produto_enderecamento')
        _sync_all_produtos_estoque_cache(conn)
        try:
            conn.commit()
        except Exception:
            pass
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
            'pesos_categoria': pesos,
            'pesos_posicoes_categoria': {(_row_dict(r) or {}).get('cat'): int((_row_dict(r) or {}).get('posicoes') or 0) for r in pesos_pos},
            'resumo_status_planejamento': resumo_status,
            'fonte_estoque': 'wms',
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
        produtos = []
        for r in rows:
            d = dict(r)
            sku = (d.get('sku') or '').strip()
            if sku:
                _aplicar_estoque_real_dict(conn, d, sku)
            produtos.append(d)
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
        conn.close()
        if err:
            return jsonify({'erro': err}), 404
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
        if acao == 'bip_palete':
            rid = data.get('recebimento_id')
            etiqueta = (data.get('etiqueta') or '').strip()
            if etiqueta and len(etiqueta) != 22:
                conn.close()
                return jsonify({'erro': 'Etiqueta deve ter 22 caracteres.'}), 400
            if not etiqueta:
                etiqueta = _gerar_etiqueta_palete()
            existente = conn.execute(f'SELECT * FROM {t_pal} WHERE etiqueta = ?', (etiqueta,)).fetchone()
            if existente:
                pid = existente['id'] if isinstance(existente, dict) else existente[0]
                if _is_pg(conn):
                    conn.execute(f"UPDATE {t_pal} SET recebimento_id = ?, atualizado_em = NOW() WHERE id = ?", (rid, pid))
                else:
                    conn.execute(f'UPDATE {t_pal} SET recebimento_id = ?, atualizado_em = ? WHERE id = ?', (rid, now, pid))
            else:
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
                    f'INSERT INTO {t_rp} (recebimento_id, palete_id, estado_palete, conferencia_cega) VALUES (?, ?, ?, 1)',
                    (rid, pid, 'bom'),
                )
            if _is_pg(conn):
                conn.execute(f"UPDATE {t_rec} SET status = 'em_conferencia', atualizado_em = NOW() WHERE id = ?", (rid,))
            else:
                conn.execute(f"UPDATE {t_rec} SET status = 'em_conferencia', atualizado_em = ? WHERE id = ?", (now, rid))
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
            conn.execute(
                f'''INSERT INTO {t_item}
                    (palete_id, sku, descricao, lote, data_producao, data_validade, sif,
                     quantidade_caixas, peso_liquido, rg_caixa, criado_em)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                (
                    pid, sku, item.get('descricao'), lote, dp,
                    dv, item.get('sif'),
                    int(item.get('quantidade_caixas') or 0), item.get('peso_liquido'),
                    item.get('rg_caixa'), now,
                ),
            )
            bloqueios = _aplicar_bloqueios_palete(conn, pid, estado, dv, item.get('temperatura'))
            sug = _sugerir_putaway(conn, sku, lote, dp, 'pulmao')
            pal = conn.execute(f'SELECT etiqueta FROM {t_pal} WHERE id = ?', (pid,)).fetchone()
            etiqueta = (pal['etiqueta'] if isinstance(pal, dict) else pal[0]) if pal else None
            conn.commit()
            conn.close()
            return jsonify({
                'ok': True,
                'palete_id': pid,
                'etiqueta': etiqueta,
                'bloqueios': bloqueios,
                'sugestao': sug,
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
            conn.close()
            return jsonify(sug)

        if acao == 'confirmar_armazenagem':
            pid = data.get('palete_id')
            cod = (data.get('codigo_endereco') or '').strip()
            if not pid or not cod:
                conn.close()
                return jsonify({'erro': 'Informe palete_id e codigo_endereco.'}), 400
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
            return jsonify({
                'ok': True,
                'localizacao': loc,
                'status_atualizado': {k: v.get('status_condicional') for k, v in status_skus.items()},
            })

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
                it = conn.execute(
                    f'SELECT sku, lote, data_producao FROM {t_item} WHERE palete_id = ? LIMIT 1', (pid,)
                ).fetchone()
                if not it:
                    continue
                rd = _row_dict(it) or {}
                sku = rd.get('sku')
                lote = rd.get('lote')
                dp = rd.get('data_producao')
                sug = _sugerir_putaway(conn, sku, lote, dp, 'pulmao')
                if sug.get('localizacao_id'):
                    obs = '; '.join(sug.get('motivo') or [])
                    if _is_pg(conn):
                        conn.execute(
                            f'''INSERT INTO {t_mov} (tipo, palete_id, destino_localizacao_id, status, prioridade, observacao, criado_em, criado_por)
                                VALUES ('putaway', ?, ?, 'pendente', 3, ?, NOW(), ?)''',
                            (pid, sug['localizacao_id'], obs, _usuario()),
                        )
                    else:
                        conn.execute(
                            f'''INSERT INTO {t_mov} (tipo, palete_id, destino_localizacao_id, status, prioridade, observacao, criado_em, criado_por)
                                VALUES ('putaway', ?, ?, 'pendente', 3, ?, ?, ?)''',
                            (pid, sug['localizacao_id'], obs, now, _usuario()),
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
            return jsonify({'ok': True, 'movimentacoes_geradas': movs, 'terceiros': terceiros_sync})

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


def _loc_etiqueta_data(loc):
    """Dados para template de etiqueta de endereço (formato 21-R-01-1)."""
    d = _row_dict(loc) or {}
    cam = int(d.get('camara') or 0)
    rua = str(d.get('rua') or '').strip().upper()
    pos = int(d.get('posicao') or 0)
    niv = int(d.get('nivel') or 1)
    cod = (d.get('codigo_endereco') or _codigo_endereco(cam, rua, pos, niv)).upper()
    picking = niv == 1 or (d.get('zona_armazenagem') or '').lower() == 'picking'
    return {
        'camara': f'{cam:02d}',
        'rua': rua,
        'posicao': f'{pos:02d}',
        'nivel': str(niv),
        'codigo': cod,
        'barcode': cod,
        'dotted': f'{cam:02d}.{rua}.{pos:02d}.{niv}',
        'picking': picking,
        'zona': 'PICKING' if picking else 'PULMÃO',
        'cat': (d.get('categoria_zona') or d.get('area') or '').strip().upper(),
    }


def _agrupar_etiquetas_faixas(loc_rows):
    """Agrupa localizações em faixas (coluna = mesma câmara+rua+posição, níveis ordenados)."""
    grupos = {}
    for loc in loc_rows:
        e = _loc_etiqueta_data(loc)
        chave = (e['camara'], e['rua'], e['posicao'])
        grupos.setdefault(chave, []).append(e)
    faixas = []
    for (cam, rua, pos), etiquetas in sorted(grupos.items(), key=lambda x: (x[0][0], x[0][1], x[0][2])):
        etiquetas.sort(key=lambda x: int(x['nivel']))
        faixas.append({
            'titulo': f'Câm {cam} · Rua {rua} · Pos {pos}',
            'etiquetas': etiquetas,
        })
    total = sum(len(f['etiquetas']) for f in faixas)
    return faixas, total


def _render_etiquetas_endereco(conn, camara=None, rua=None, posicao=None, codigo=None, auto_print=False):
    _ensure_zona_armazenagem_column(conn)
    t_loc = _tbl(conn, 'wms_localizacao')
    if codigo:
        row = conn.execute(
            f'SELECT * FROM {t_loc} WHERE codigo_endereco = ? OR codigo_endereco = ?',
            (codigo, codigo.upper()),
        ).fetchone()
        rows = [row] if row else []
    else:
        sql = f'SELECT * FROM {t_loc} WHERE 1=1'
        params = []
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
        return None, 'Nenhum endereço encontrado para imprimir.'
    faixas, total = _agrupar_etiquetas_faixas(rows)
    titulo = codigo or f'Câm {camara or "todas"}'
    html = render_template(
        'wms/etiquetas_endereco.html',
        faixas=faixas,
        total=total,
        titulo=titulo,
        auto_print=auto_print,
    )
    return html, None


def _html_etiqueta_palete(etiqueta, sku=None, lote=None, qtd=None, descricao=None, data_producao=None, data_validade=None, destino=None, auto_print=True):
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
        sku = lote = descricao = data_producao = data_validade = None
        qtd = None
        if pal:
            pid = pal['id'] if isinstance(pal, dict) else pal[0]
            it = conn.execute(
                f'''SELECT sku, descricao, lote, data_producao, data_validade, quantidade_caixas
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
        auto_print = request.args.get('auto_print', '1') != '0'
        conn.close()
        html = _html_etiqueta_palete(
            etiqueta, sku, lote, qtd, descricao, data_producao, data_validade,
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
            destino='21-R-01-2 (PULMÃO · Cat. C)',
            auto_print=False,
        )
        return make_response(html, 200, {'Content-Type': 'text/html; charset=utf-8'})
    faixas = [{
        'titulo': 'Câm 21 · Rua R · Pos 01 — exemplo',
        'etiquetas': [
            {
                'camara': '21', 'rua': 'R', 'posicao': '01', 'nivel': '1',
                'barcode': '21-R-01-1', 'dotted': '21.R.01.1',
                'picking': True, 'zona': 'PICKING', 'cat': 'C',
            },
            {
                'camara': '21', 'rua': 'R', 'posicao': '01', 'nivel': '2',
                'barcode': '21-R-01-2', 'dotted': '21.R.01.2',
                'picking': False, 'zona': 'PULMÃO', 'cat': 'C',
            },
            {
                'camara': '21', 'rua': 'R', 'posicao': '01', 'nivel': '3',
                'barcode': '21-R-01-3', 'dotted': '21.R.01.3',
                'picking': False, 'zona': 'PULMÃO', 'cat': 'C',
            },
        ],
    }]
    html = render_template(
        'wms/etiquetas_endereco.html',
        faixas=faixas,
        total=3,
        titulo='Modelo',
        auto_print=False,
    )
    return make_response(html, 200, {'Content-Type': 'text/html; charset=utf-8'})


@bp.route('/etiqueta/endereco', methods=['GET'])
def api_wms_etiqueta_endereco():
    codigo = (request.args.get('codigo') or request.args.get('endereco') or '').strip()
    if not codigo:
        return jsonify({'erro': 'Informe codigo/endereco (ex.: 21-R-01-1).'}), 400
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


@bp.route('/etiqueta/enderecos', methods=['GET'])
def api_wms_etiqueta_enderecos():
    """Impressão em lote: câmara inteira, ou coluna (câmara+rua+posição)."""
    conn = _db()
    ensure_wms_schema(conn)
    camara = request.args.get('camara', type=int)
    rua = (request.args.get('rua') or '').strip() or None
    posicao = request.args.get('posicao', type=int)
    if not camara and not rua and not posicao:
        return jsonify({'erro': 'Informe ao menos camara (ex.: ?camara=21).'}), 400
    try:
        auto_print = request.args.get('auto_print', '0') == '1'
        html, err = _render_etiquetas_endereco(
            conn, camara=camara, rua=rua, posicao=posicao, auto_print=auto_print,
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
