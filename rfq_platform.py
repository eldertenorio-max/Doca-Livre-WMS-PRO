"""
Fundação do roadmap RFQ — multi-CD, parâmetros, integrações, cobertura e stubs
das ondas WMS / 3PL / YMS / verticais (fora: portuário).
"""
from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any

from flask import Blueprint, jsonify, request, session

bp = Blueprint('rfq_platform', __name__)

_get_db = None
_SCHEMA_READY = False

# Feature flags (env override: RFQ_FLAG_<KEY>=1|0)
DEFAULT_FLAGS = {
    'multi_cd': True,
    'integration_events': True,
    'params_por_deposito': True,
    'recebimento_cego': True,
    'qa_lote': True,
    'asn_import': True,
    'picking_onda': True,
    'picking_rota': True,
    'inventario_cego': True,
    'kpi_analytics': True,
    'rfid_adapter': True,
    'ordem_carregamento': True,
    'tpl_billing': True,
    'tpl_portal': True,
    'tpl_sla': True,
    'yms_agendamento': True,
    'yms_portaria': True,
    'yms_patio': True,
    'cross_dock': True,
    'bobinas': True,
    'wcs_middleware': True,
    'portuario_core': False,  # fora do núcleo
}


def register_rfq_db(get_db_func):
    global _get_db
    _get_db = get_db_func


def init_rfq_platform(get_db_func):
    register_rfq_db(get_db_func)
    try:
        conn = get_db_func()
        ensure_rfq_schema(conn)
        conn.close()
    except Exception:
        pass


def _db():
    if _get_db is None:
        raise RuntimeError('RFQ platform não inicializado')
    return _get_db()


def _is_pg(conn):
    return getattr(conn, 'kind', None) == 'pg'


def _tbl(conn, name):
    return f'public.{name}' if _is_pg(conn) else name


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def flag_enabled(key: str) -> bool:
    env_key = f'RFQ_FLAG_{key.upper()}'
    if env_key in os.environ:
        return os.environ.get(env_key, '').strip() in ('1', 'true', 'True', 'yes')
    return bool(DEFAULT_FLAGS.get(key, False))


def ensure_rfq_schema(conn):
    """Schema mínimo multi-CD, params, eventos, ASN, QA, ondas, YMS, 3PL, bobinas."""
    global _SCHEMA_READY
    if _SCHEMA_READY:
        return
    pg = _is_pg(conn)
    bool_t = 'BOOLEAN' if pg else 'INTEGER'
    ts = 'TIMESTAMPTZ' if pg else 'TEXT'
    json_t = 'JSONB' if pg else 'TEXT'
    serial = 'BIGSERIAL' if pg else 'INTEGER'
    pk = f'{serial} PRIMARY KEY' if pg else 'INTEGER PRIMARY KEY AUTOINCREMENT'

    stmts = [
        f'''CREATE TABLE IF NOT EXISTS {_tbl(conn, 'wms_empresa')} (
            id {pk},
            codigo TEXT NOT NULL UNIQUE,
            nome TEXT NOT NULL,
            ativo {bool_t} DEFAULT {'TRUE' if pg else '1'},
            criado_em {ts}
        )''',
        f'''CREATE TABLE IF NOT EXISTS {_tbl(conn, 'wms_deposito')} (
            id {pk},
            empresa_id INTEGER,
            codigo TEXT NOT NULL,
            nome TEXT NOT NULL,
            ativo {bool_t} DEFAULT {'TRUE' if pg else '1'},
            criado_em {ts},
            UNIQUE(empresa_id, codigo)
        )''',
        f'''CREATE TABLE IF NOT EXISTS {_tbl(conn, 'wms_usuario_deposito')} (
            id {pk},
            usuario TEXT NOT NULL,
            deposito_id INTEGER NOT NULL,
            papel TEXT DEFAULT 'operador',
            UNIQUE(usuario, deposito_id)
        )''',
        f'''CREATE TABLE IF NOT EXISTS {_tbl(conn, 'wms_depositante')} (
            id {pk},
            deposito_id INTEGER,
            codigo TEXT NOT NULL,
            nome TEXT NOT NULL,
            ativo {bool_t} DEFAULT {'TRUE' if pg else '1'},
            UNIQUE(deposito_id, codigo)
        )''',
        f'''CREATE TABLE IF NOT EXISTS {_tbl(conn, 'rfq_param_perfil')} (
            id {pk},
            deposito_id INTEGER,
            depositante_id INTEGER,
            chave TEXT NOT NULL,
            valor {json_t},
            atualizado_em {ts},
            UNIQUE(deposito_id, depositante_id, chave)
        )''',
        f'''CREATE TABLE IF NOT EXISTS {_tbl(conn, 'rfq_integration_event')} (
            id {pk},
            event_id TEXT NOT NULL UNIQUE,
            tipo TEXT NOT NULL,
            source TEXT,
            payload {json_t},
            status TEXT DEFAULT 'pending',
            attempts INTEGER DEFAULT 0,
            last_error TEXT,
            criado_em {ts},
            processado_em {ts}
        )''',
        f'''CREATE TABLE IF NOT EXISTS {_tbl(conn, 'wms_asn')} (
            id {pk},
            deposito_id INTEGER,
            numero TEXT NOT NULL,
            fornecedor TEXT,
            status TEXT DEFAULT 'recebido',
            payload {json_t},
            recebimento_id INTEGER,
            criado_em {ts},
            UNIQUE(deposito_id, numero)
        )''',
        f'''CREATE TABLE IF NOT EXISTS {_tbl(conn, 'wms_lote_qa')} (
            id {pk},
            deposito_id INTEGER,
            sku TEXT,
            lote TEXT,
            status TEXT DEFAULT 'quarentena',
            motivo TEXT,
            atualizado_por TEXT,
            atualizado_em {ts}
        )''',
        f'''CREATE TABLE IF NOT EXISTS {_tbl(conn, 'wms_picking_onda')} (
            id {pk},
            deposito_id INTEGER,
            codigo TEXT NOT NULL,
            status TEXT DEFAULT 'aberta',
            zona TEXT,
            payload {json_t},
            criado_em {ts}
        )''',
        f'''CREATE TABLE IF NOT EXISTS {_tbl(conn, 'yms_agendamento')} (
            id {pk},
            deposito_id INTEGER,
            doca TEXT,
            transportadora TEXT,
            placa TEXT,
            slot_inicio {ts},
            slot_fim {ts},
            prioridade TEXT DEFAULT 'normal',
            status TEXT DEFAULT 'agendado',
            criado_em {ts}
        )''',
        f'''CREATE TABLE IF NOT EXISTS {_tbl(conn, 'yms_portaria_checkin')} (
            id {pk},
            agendamento_id INTEGER,
            placa TEXT,
            motorista TEXT,
            docs_ok {bool_t} DEFAULT {'FALSE' if pg else '0'},
            peso_entrada REAL,
            status TEXT DEFAULT 'checkin',
            criado_em {ts}
        )''',
        f'''CREATE TABLE IF NOT EXISTS {_tbl(conn, 'yms_patio_vaga')} (
            id {pk},
            deposito_id INTEGER,
            codigo TEXT NOT NULL,
            tipo TEXT,
            ocupado {bool_t} DEFAULT {'FALSE' if pg else '0'},
            placa TEXT,
            UNIQUE(deposito_id, codigo)
        )''',
        f'''CREATE TABLE IF NOT EXISTS {_tbl(conn, 'tpl_tarifa')} (
            id {pk},
            depositante_id INTEGER,
            tipo TEXT NOT NULL,
            unidade TEXT NOT NULL,
            valor REAL NOT NULL,
            vigencia_inicio TEXT,
            vigencia_fim TEXT
        )''',
        f'''CREATE TABLE IF NOT EXISTS {_tbl(conn, 'tpl_fatura')} (
            id {pk},
            depositante_id INTEGER,
            periodo TEXT,
            total REAL DEFAULT 0,
            status TEXT DEFAULT 'rascunho',
            detalhe {json_t},
            criado_em {ts}
        )''',
        f'''CREATE TABLE IF NOT EXISTS {_tbl(conn, 'tpl_sla_evento')} (
            id {pk},
            depositante_id INTEGER,
            regra TEXT,
            metrica REAL,
            penalidade REAL DEFAULT 0,
            ocorrido_em {ts}
        )''',
        f'''CREATE TABLE IF NOT EXISTS {_tbl(conn, 'wms_bobina')} (
            id {pk},
            deposito_id INTEGER,
            codigo TEXT NOT NULL,
            peso_kg REAL,
            diametro_mm REAL,
            espessura_mm REAL,
            empilhamento_max INTEGER,
            piso_requerido TEXT,
            status TEXT DEFAULT 'ativo',
            genealogy {json_t},
            UNIQUE(deposito_id, codigo)
        )''',
        f'''CREATE TABLE IF NOT EXISTS {_tbl(conn, 'rfq_epic_status')} (
            id {pk},
            epic_id TEXT NOT NULL UNIQUE,
            onda TEXT NOT NULL,
            status TEXT DEFAULT 'foundation',
            notas TEXT,
            atualizado_em {ts}
        )''',
    ]
    for sql in stmts:
        try:
            conn.execute(sql)
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass
    try:
        conn.commit()
    except Exception:
        pass
    _seed_defaults(conn)
    _SCHEMA_READY = True


def _seed_defaults(conn):
    """Empresa/depósito default + épicos do roadmap."""
    try:
        cur = conn.execute(f'SELECT COUNT(*) AS c FROM {_tbl(conn, "wms_empresa")}')
        row = cur.fetchone()
        n = int(row['c'] if isinstance(row, dict) or hasattr(row, 'keys') else row[0])
        if n == 0:
            conn.execute(
                f'INSERT INTO {_tbl(conn, "wms_empresa")} (codigo, nome, criado_em) VALUES (?, ?, ?)',
                ('DEFAULT', 'Empresa padrão', _now_iso()),
            )
            emp = conn.execute(
                f'SELECT id FROM {_tbl(conn, "wms_empresa")} WHERE codigo = ?',
                ('DEFAULT',),
            ).fetchone()
            emp_id = emp['id'] if hasattr(emp, 'keys') else emp[0]
            conn.execute(
                f'INSERT INTO {_tbl(conn, "wms_deposito")} (empresa_id, codigo, nome, criado_em) VALUES (?, ?, ?, ?)',
                (emp_id, 'CD01', 'Depósito principal', _now_iso()),
            )
            # Perfis padrão
            dep = conn.execute(
                f'SELECT id FROM {_tbl(conn, "wms_deposito")} WHERE codigo = ?',
                ('CD01',),
            ).fetchone()
            dep_id = dep['id'] if hasattr(dep, 'keys') else dep[0]
            defaults = {
                'conferencia_modo': 'total',
                'politica_lote': 'FEFO',
                'putaway_perfil': 'padrao',
                'inventario_cego': False,
                'recontagem_auto': True,
            }
            for k, v in defaults.items():
                conn.execute(
                    f'''INSERT INTO {_tbl(conn, "rfq_param_perfil")}
                        (deposito_id, depositante_id, chave, valor, atualizado_em)
                        VALUES (?, NULL, ?, ?, ?)''',
                    (dep_id, k, json.dumps(v), _now_iso()),
                )
        for epic in RFQ_CATALOG:
            try:
                exists = conn.execute(
                    f'SELECT 1 FROM {_tbl(conn, "rfq_epic_status")} WHERE epic_id = ?',
                    (epic['id'],),
                ).fetchone()
                if not exists:
                    conn.execute(
                        f'''INSERT INTO {_tbl(conn, "rfq_epic_status")}
                            (epic_id, onda, status, notas, atualizado_em)
                            VALUES (?, ?, ?, ?, ?)''',
                        (epic['id'], epic['onda'], epic['status'], epic.get('notas', ''), _now_iso()),
                    )
            except Exception:
                pass
        conn.commit()
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass


# Catálogo RFQ alinhado ao plano (épicos)
RFQ_CATALOG: list[dict[str, Any]] = [
    # Plataforma
    {'id': 'P0', 'onda': 'plataforma', 'titulo': 'Multi-empresa / multi-CD', 'status': 'foundation',
     'rfq_alvo': 'Sim', 'notas': 'Tabelas wms_empresa / wms_deposito'},
    {'id': 'P1', 'onda': 'plataforma', 'titulo': 'Camada de integração (eventos)', 'status': 'foundation',
     'rfq_alvo': 'Sim', 'notas': 'rfq_integration_event'},
    {'id': 'P2', 'onda': 'plataforma', 'titulo': 'Parametrização por depósito', 'status': 'foundation',
     'rfq_alvo': 'Sim', 'notas': 'rfq_param_perfil'},
    {'id': 'P3', 'onda': 'plataforma', 'titulo': 'Jobs assíncronos / performance', 'status': 'wip',
     'rfq_alvo': 'Sim', 'notas': 'Path leve no recebimento; workers a expandir'},
    {'id': 'P4', 'onda': 'plataforma', 'titulo': 'PWA / coletor offline', 'status': 'backlog',
     'rfq_alvo': 'Sim', 'notas': 'Hardening mobile'},
    # Onda 1 WMS
    {'id': 'W1', 'onda': 'onda1', 'titulo': 'ASN / pré-aviso', 'status': 'foundation', 'rfq_alvo': 'Sim'},
    {'id': 'W2', 'onda': 'onda1', 'titulo': 'Recebimento cego', 'status': 'foundation', 'rfq_alvo': 'Sim'},
    {'id': 'W3', 'onda': 'onda1', 'titulo': 'QA aprovação/reprovação', 'status': 'foundation', 'rfq_alvo': 'Sim'},
    {'id': 'W4', 'onda': 'onda1', 'titulo': 'Picking onda/zona', 'status': 'foundation', 'rfq_alvo': 'Sim'},
    {'id': 'W5', 'onda': 'onda1', 'titulo': 'Rota de picking', 'status': 'foundation', 'rfq_alvo': 'Sim'},
    {'id': 'W6', 'onda': 'onda1', 'titulo': 'RFID na conferência', 'status': 'foundation', 'rfq_alvo': 'Sim'},
    {'id': 'W7', 'onda': 'onda1', 'titulo': 'Ordem de carregamento otimizada', 'status': 'foundation', 'rfq_alvo': 'Sim'},
    {'id': 'W8', 'onda': 'onda1', 'titulo': 'Inventário cego + recontagem', 'status': 'foundation', 'rfq_alvo': 'Sim'},
    {'id': 'W9', 'onda': 'onda1', 'titulo': 'KPIs giro/acuracidade/produtividade', 'status': 'foundation', 'rfq_alvo': 'Sim'},
    {'id': 'W10', 'onda': 'onda1', 'titulo': 'Putaway FIFO-FEFO-LIFO configurável', 'status': 'foundation', 'rfq_alvo': 'Sim'},
    {'id': 'W11', 'onda': 'onda1', 'titulo': 'Mobile RF hardening', 'status': 'backlog', 'rfq_alvo': 'Sim'},
    # Onda 2 3PL
    {'id': 'T1', 'onda': 'onda2', 'titulo': 'Multi-cliente + segregação', 'status': 'foundation', 'rfq_alvo': 'Sim'},
    {'id': 'T2', 'onda': 'onda2', 'titulo': 'Portal do depositante', 'status': 'foundation', 'rfq_alvo': 'Sim'},
    {'id': 'T3', 'onda': 'onda2', 'titulo': 'Billing m³/palete/posição', 'status': 'foundation', 'rfq_alvo': 'Sim'},
    {'id': 'T4', 'onda': 'onda2', 'titulo': 'SLA + penalidades', 'status': 'foundation', 'rfq_alvo': 'Sim'},
    {'id': 'T5', 'onda': 'onda2', 'titulo': 'Custo por cliente/produto', 'status': 'foundation', 'rfq_alvo': 'Sim'},
    # Onda 3 YMS
    {'id': 'Y1', 'onda': 'onda3', 'titulo': 'Agendamento de docas', 'status': 'foundation', 'rfq_alvo': 'Sim'},
    {'id': 'Y2', 'onda': 'onda3', 'titulo': 'Prioridade / reagendamento', 'status': 'foundation', 'rfq_alvo': 'Sim'},
    {'id': 'Y3', 'onda': 'onda3', 'titulo': 'Integração TMS', 'status': 'foundation', 'rfq_alvo': 'Sim'},
    {'id': 'Y4', 'onda': 'onda3', 'titulo': 'Portaria', 'status': 'foundation', 'rfq_alvo': 'Sim'},
    {'id': 'Y5', 'onda': 'onda3', 'titulo': 'Balança na portaria', 'status': 'foundation', 'rfq_alvo': 'Sim'},
    {'id': 'Y6', 'onda': 'onda3', 'titulo': 'Tempo no pátio', 'status': 'foundation', 'rfq_alvo': 'Sim'},
    {'id': 'Y7', 'onda': 'onda3', 'titulo': 'Mapa de pátio', 'status': 'foundation', 'rfq_alvo': 'Sim'},
    {'id': 'Y8', 'onda': 'onda3', 'titulo': 'Direcionamento doca', 'status': 'foundation', 'rfq_alvo': 'Sim'},
    {'id': 'Y9', 'onda': 'onda3', 'titulo': 'Ativos no pátio', 'status': 'foundation', 'rfq_alvo': 'Sim'},
    {'id': 'Y10', 'onda': 'onda3', 'titulo': 'KPIs YMS', 'status': 'foundation', 'rfq_alvo': 'Sim'},
    {'id': 'Y11', 'onda': 'onda3', 'titulo': 'Compliance visual / NCR', 'status': 'foundation', 'rfq_alvo': 'Sim'},
    # Onda 4
    {'id': 'V1', 'onda': 'onda4', 'titulo': 'Cross-docking', 'status': 'foundation', 'rfq_alvo': 'Sim'},
    {'id': 'V2', 'onda': 'onda4', 'titulo': 'Bobinas — modelo', 'status': 'foundation', 'rfq_alvo': 'Sim'},
    {'id': 'V3', 'onda': 'onda4', 'titulo': 'Bobinas — inspeção/rastreio', 'status': 'foundation', 'rfq_alvo': 'Sim'},
    {'id': 'V4', 'onda': 'onda4', 'titulo': 'WCS / esteiras', 'status': 'foundation', 'rfq_alvo': 'Sim'},
    {'id': 'V5', 'onda': 'onda4', 'titulo': 'Frota empilhadeira', 'status': 'foundation', 'rfq_alvo': 'Sim'},
    {'id': 'V6', 'onda': 'onda4', 'titulo': 'RFID / balança hardware', 'status': 'foundation', 'rfq_alvo': 'Sim'},
    {'id': 'V7', 'onda': 'onda4', 'titulo': 'Milk run / EDI montadora', 'status': 'foundation', 'rfq_alvo': 'Sim'},
    # Fora
    {'id': 'PORT', 'onda': 'portuario', 'titulo': 'Portuário / Siscomex', 'status': 'out_of_scope',
     'rfq_alvo': 'Não', 'notas': 'Fora do núcleo — parceria dedicada'},
]


def _ensure_schema_safe():
    try:
        conn = _db()
        ensure_rfq_schema(conn)
        conn.close()
    except Exception:
        pass


def _row_val(row, key, idx=0):
    if row is None:
        return None
    if hasattr(row, 'keys'):
        try:
            return row[key]
        except Exception:
            return row[idx] if len(row) > idx else None
    return row[idx]


# ── APIs ──────────────────────────────────────────────────────────────────────

@bp.before_request
def _rfq_before():
    _ensure_schema_safe()


@bp.get('/coverage')
def api_coverage():
    """Catálogo RFQ + status de implementação + flags."""
    by_onda: dict[str, list] = {}
    for e in RFQ_CATALOG:
        by_onda.setdefault(e['onda'], []).append(e)
    counts = {}
    for e in RFQ_CATALOG:
        counts[e['status']] = counts.get(e['status'], 0) + 1
    return jsonify({
        'ok': True,
        'produto': 'Doca Livre WMS Pro',
        'roadmap': 'docs/roadmap-rfq/',
        'flags': {k: flag_enabled(k) for k in DEFAULT_FLAGS},
        'resumo': counts,
        'por_onda': by_onda,
        'itens': RFQ_CATALOG,
        'portuario': 'fora_do_nucleo',
    })


@bp.get('/flags')
def api_flags():
    return jsonify({'ok': True, 'flags': {k: flag_enabled(k) for k in DEFAULT_FLAGS}})


@bp.get('/params')
def api_params_get():
    deposito_id = request.args.get('deposito_id', type=int)
    conn = _db()
    try:
        if deposito_id:
            rows = conn.execute(
                f'SELECT chave, valor FROM {_tbl(conn, "rfq_param_perfil")} WHERE deposito_id = ?',
                (deposito_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                f'SELECT deposito_id, chave, valor FROM {_tbl(conn, "rfq_param_perfil")}'
            ).fetchall()
        params = []
        for r in rows:
            if hasattr(r, 'keys'):
                val = r['valor']
                if isinstance(val, str):
                    try:
                        val = json.loads(val)
                    except Exception:
                        pass
                item = {'chave': r['chave'], 'valor': val}
                if 'deposito_id' in r.keys():
                    item['deposito_id'] = r['deposito_id']
                params.append(item)
            else:
                params.append({'raw': list(r)})
        return jsonify({'ok': True, 'params': params})
    finally:
        conn.close()


@bp.post('/params')
def api_params_set():
    data = request.get_json(silent=True) or {}
    deposito_id = data.get('deposito_id')
    chave = (data.get('chave') or '').strip()
    valor = data.get('valor')
    if not deposito_id or not chave:
        return jsonify({'ok': False, 'erro': 'deposito_id e chave obrigatórios'}), 400
    conn = _db()
    try:
        # upsert simples
        existing = conn.execute(
            f'''SELECT id FROM {_tbl(conn, "rfq_param_perfil")}
                WHERE deposito_id = ? AND chave = ? AND depositante_id IS NULL''',
            (deposito_id, chave),
        ).fetchone()
        payload = json.dumps(valor)
        if existing:
            eid = _row_val(existing, 'id')
            conn.execute(
                f'''UPDATE {_tbl(conn, "rfq_param_perfil")}
                    SET valor = ?, atualizado_em = ? WHERE id = ?''',
                (payload, _now_iso(), eid),
            )
        else:
            conn.execute(
                f'''INSERT INTO {_tbl(conn, "rfq_param_perfil")}
                    (deposito_id, depositante_id, chave, valor, atualizado_em)
                    VALUES (?, NULL, ?, ?, ?)''',
                (deposito_id, chave, payload, _now_iso()),
            )
        conn.commit()
        return jsonify({'ok': True, 'chave': chave, 'valor': valor})
    finally:
        conn.close()


@bp.get('/depositos')
def api_depositos():
    conn = _db()
    try:
        rows = conn.execute(
            f'''SELECT d.id, d.codigo, d.nome, d.empresa_id, e.nome AS empresa
                FROM {_tbl(conn, "wms_deposito")} d
                LEFT JOIN {_tbl(conn, "wms_empresa")} e ON e.id = d.empresa_id
                ORDER BY d.id'''
        ).fetchall()
        items = []
        for r in rows:
            if hasattr(r, 'keys'):
                items.append({k: r[k] for k in r.keys()})
            else:
                items.append({'id': r[0], 'codigo': r[1], 'nome': r[2]})
        return jsonify({'ok': True, 'depositos': items})
    finally:
        conn.close()


@bp.post('/events')
def api_events_ingest():
    """Ingest idempotente de eventos de integração (ASN/EDI/webhook)."""
    if not flag_enabled('integration_events'):
        return jsonify({'ok': False, 'erro': 'flag integration_events desligada'}), 403
    data = request.get_json(silent=True) or {}
    tipo = (data.get('tipo') or '').strip()
    if not tipo:
        return jsonify({'ok': False, 'erro': 'tipo obrigatório'}), 400
    event_id = (data.get('event_id') or '').strip() or str(uuid.uuid4())
    conn = _db()
    try:
        exists = conn.execute(
            f'SELECT id, status FROM {_tbl(conn, "rfq_integration_event")} WHERE event_id = ?',
            (event_id,),
        ).fetchone()
        if exists:
            return jsonify({
                'ok': True,
                'idempotent': True,
                'event_id': event_id,
                'status': _row_val(exists, 'status', 1),
            })
        conn.execute(
            f'''INSERT INTO {_tbl(conn, "rfq_integration_event")}
                (event_id, tipo, source, payload, status, criado_em)
                VALUES (?, ?, ?, ?, 'pending', ?)''',
            (event_id, tipo, data.get('source') or 'api', json.dumps(data.get('payload') or {}), _now_iso()),
        )
        conn.commit()
        return jsonify({'ok': True, 'event_id': event_id, 'status': 'pending'}), 201
    finally:
        conn.close()


@bp.get('/events')
def api_events_list():
    conn = _db()
    try:
        rows = conn.execute(
            f'''SELECT event_id, tipo, source, status, attempts, criado_em
                FROM {_tbl(conn, "rfq_integration_event")}
                ORDER BY id DESC LIMIT 100'''
        ).fetchall()
        items = []
        for r in rows:
            if hasattr(r, 'keys'):
                items.append({k: r[k] for k in r.keys()})
        return jsonify({'ok': True, 'events': items})
    finally:
        conn.close()


# ── Onda 1 stubs ─────────────────────────────────────────────────────────────

@bp.post('/asn')
def api_asn_import():
    if not flag_enabled('asn_import'):
        return jsonify({'ok': False, 'erro': 'flag asn_import desligada'}), 403
    data = request.get_json(silent=True) or {}
    numero = (data.get('numero') or '').strip()
    if not numero:
        return jsonify({'ok': False, 'erro': 'numero obrigatório'}), 400
    deposito_id = data.get('deposito_id')
    conn = _db()
    try:
        conn.execute(
            f'''INSERT INTO {_tbl(conn, "wms_asn")}
                (deposito_id, numero, fornecedor, status, payload, criado_em)
                VALUES (?, ?, ?, 'recebido', ?, ?)''',
            (deposito_id, numero, data.get('fornecedor'), json.dumps(data), _now_iso()),
        )
        # também registra evento
        eid = f'asn-{numero}-{uuid.uuid4().hex[:8]}'
        try:
            conn.execute(
                f'''INSERT INTO {_tbl(conn, "rfq_integration_event")}
                    (event_id, tipo, source, payload, status, criado_em)
                    VALUES (?, 'asn.import', 'api', ?, 'pending', ?)''',
                (eid, json.dumps({'numero': numero}), _now_iso()),
            )
        except Exception:
            pass
        conn.commit()
        return jsonify({'ok': True, 'numero': numero, 'status': 'recebido'}), 201
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        return jsonify({'ok': False, 'erro': str(e)}), 400
    finally:
        conn.close()


@bp.get('/asn')
def api_asn_list():
    conn = _db()
    try:
        rows = conn.execute(
            f'''SELECT id, deposito_id, numero, fornecedor, status, criado_em
                FROM {_tbl(conn, "wms_asn")} ORDER BY id DESC LIMIT 50'''
        ).fetchall()
        items = [{k: r[k] for k in r.keys()} for r in rows if hasattr(r, 'keys')]
        return jsonify({'ok': True, 'asns': items})
    finally:
        conn.close()


@bp.post('/qa/lote')
def api_qa_lote():
    if not flag_enabled('qa_lote'):
        return jsonify({'ok': False, 'erro': 'flag qa_lote desligada'}), 403
    data = request.get_json(silent=True) or {}
    status = (data.get('status') or 'quarentena').strip().lower()
    if status not in ('quarentena', 'aprovado', 'reprovado'):
        return jsonify({'ok': False, 'erro': 'status inválido'}), 400
    conn = _db()
    try:
        conn.execute(
            f'''INSERT INTO {_tbl(conn, "wms_lote_qa")}
                (deposito_id, sku, lote, status, motivo, atualizado_por, atualizado_em)
                VALUES (?, ?, ?, ?, ?, ?, ?)''',
            (
                data.get('deposito_id'),
                data.get('sku'),
                data.get('lote'),
                status,
                data.get('motivo'),
                (session.get('usuario') or 'sistema'),
                _now_iso(),
            ),
        )
        conn.commit()
        putaway_bloqueado = status != 'aprovado'
        return jsonify({
            'ok': True,
            'status': status,
            'putaway_bloqueado': putaway_bloqueado,
        }), 201
    finally:
        conn.close()


@bp.get('/conferencia/modo')
def api_conferencia_modo():
    """Modo de conferência (cego/parcial/total) a partir dos params do depósito."""
    deposito_id = request.args.get('deposito_id', type=int)
    modo = 'total'
    ocultar_qtd_esperada = False
    conn = _db()
    try:
        if deposito_id:
            row = conn.execute(
                f'''SELECT valor FROM {_tbl(conn, "rfq_param_perfil")}
                    WHERE deposito_id = ? AND chave = 'conferencia_modo' LIMIT 1''',
                (deposito_id,),
            ).fetchone()
            if row:
                val = _row_val(row, 'valor')
                if isinstance(val, str):
                    try:
                        val = json.loads(val)
                    except Exception:
                        pass
                modo = str(val or 'total')
        if flag_enabled('recebimento_cego') and modo == 'cego':
            ocultar_qtd_esperada = True
        return jsonify({
            'ok': True,
            'modo': modo,
            'ocultar_qtd_esperada': ocultar_qtd_esperada,
            'auditoria_pos_conferencia': True,
        })
    finally:
        conn.close()


@bp.post('/picking/onda')
def api_picking_onda():
    if not flag_enabled('picking_onda'):
        return jsonify({'ok': False, 'erro': 'flag picking_onda desligada'}), 403
    data = request.get_json(silent=True) or {}
    codigo = (data.get('codigo') or f'ONDA-{uuid.uuid4().hex[:8]}').strip()
    conn = _db()
    try:
        conn.execute(
            f'''INSERT INTO {_tbl(conn, "wms_picking_onda")}
                (deposito_id, codigo, status, zona, payload, criado_em)
                VALUES (?, ?, 'aberta', ?, ?, ?)''',
            (data.get('deposito_id'), codigo, data.get('zona'), json.dumps(data.get('itens') or []), _now_iso()),
        )
        conn.commit()
        return jsonify({'ok': True, 'codigo': codigo, 'status': 'aberta'}), 201
    finally:
        conn.close()


@bp.post('/picking/rota')
def api_picking_rota():
    """Ordena picks por corredor/endereço (grafo simplificado)."""
    if not flag_enabled('picking_rota'):
        return jsonify({'ok': False, 'erro': 'flag picking_rota desligada'}), 403
    data = request.get_json(silent=True) or {}
    picks = list(data.get('picks') or [])

    def sort_key(p):
        end = str(p.get('endereco') or p.get('localizacao') or '')
        parts = end.replace('-', '/').split('/')
        return tuple(parts)

    ordenados = sorted(picks, key=sort_key)
    for i, p in enumerate(ordenados, 1):
        p['seq_rota'] = i
    return jsonify({'ok': True, 'picks': ordenados, 'algoritmo': 'corredor_endereco'})


@bp.post('/rfid/read')
def api_rfid_read():
    """Adapter RFID com fallback barcode."""
    if not flag_enabled('rfid_adapter'):
        return jsonify({'ok': False, 'erro': 'flag rfid_adapter desligada'}), 403
    data = request.get_json(silent=True) or {}
    tag = (data.get('epc') or data.get('tag') or '').strip()
    barcode = (data.get('barcode') or data.get('codigo') or '').strip()
    if tag:
        return jsonify({'ok': True, 'fonte': 'rfid', 'codigo': tag, 'fallback': False})
    if barcode:
        return jsonify({'ok': True, 'fonte': 'barcode', 'codigo': barcode, 'fallback': True})
    return jsonify({'ok': False, 'erro': 'informe epc/tag ou barcode'}), 400


@bp.post('/carregamento/sequenciar')
def api_carregamento_seq():
    if not flag_enabled('ordem_carregamento'):
        return jsonify({'ok': False, 'erro': 'flag ordem_carregamento desligada'}), 403
    data = request.get_json(silent=True) or {}
    itens = list(data.get('itens') or [])
    # prioridade: doca → veículo → peso/volume
    itens.sort(key=lambda x: (
        str(x.get('doca') or ''),
        str(x.get('veiculo') or ''),
        -float(x.get('peso') or 0),
    ))
    for i, it in enumerate(itens, 1):
        it['seq_carga'] = i
    return jsonify({'ok': True, 'itens': itens})


@bp.get('/kpis/wms')
def api_kpis_wms():
    if not flag_enabled('kpi_analytics'):
        return jsonify({'ok': False, 'erro': 'flag kpi_analytics desligada'}), 403
    # Métricas placeholder — conectam às tabelas operacionais nas próximas iterações
    return jsonify({
        'ok': True,
        'kpis': {
            'giro_estoque': None,
            'acuracidade_inventario': None,
            'produtividade_picking_hora': None,
            'produtividade_recebimento_hora': None,
        },
        'nota': 'Camada analítica foundation — popular com dados reais do WMS',
    })


@bp.get('/inventario/politica')
def api_inventario_politica():
    deposito_id = request.args.get('deposito_id', type=int)
    cego = False
    recontagem = True
    conn = _db()
    try:
        if deposito_id:
            for chave, attr in (('inventario_cego', 'cego'), ('recontagem_auto', 'recontagem')):
                row = conn.execute(
                    f'''SELECT valor FROM {_tbl(conn, "rfq_param_perfil")}
                        WHERE deposito_id = ? AND chave = ? LIMIT 1''',
                    (deposito_id, chave),
                ).fetchone()
                if row:
                    val = _row_val(row, 'valor')
                    if isinstance(val, str):
                        try:
                            val = json.loads(val)
                        except Exception:
                            pass
                    if attr == 'cego':
                        cego = bool(val)
                    else:
                        recontagem = bool(val)
        return jsonify({
            'ok': True,
            'inventario_cego': cego and flag_enabled('inventario_cego'),
            'recontagem_automatica': recontagem,
            'segunda_contagem_se_divergencia': recontagem,
        })
    finally:
        conn.close()


# ── Onda 2 — 3PL ─────────────────────────────────────────────────────────────

@bp.post('/tpl/depositante')
def api_tpl_depositante():
    data = request.get_json(silent=True) or {}
    codigo = (data.get('codigo') or '').strip()
    nome = (data.get('nome') or codigo).strip()
    if not codigo:
        return jsonify({'ok': False, 'erro': 'codigo obrigatório'}), 400
    conn = _db()
    try:
        conn.execute(
            f'''INSERT INTO {_tbl(conn, "wms_depositante")}
                (deposito_id, codigo, nome) VALUES (?, ?, ?)''',
            (data.get('deposito_id'), codigo, nome),
        )
        conn.commit()
        return jsonify({'ok': True, 'codigo': codigo}), 201
    except Exception as e:
        return jsonify({'ok': False, 'erro': str(e)}), 400
    finally:
        conn.close()


@bp.get('/tpl/portal/<codigo>')
def api_tpl_portal(codigo):
    if not flag_enabled('tpl_portal'):
        return jsonify({'ok': False, 'erro': 'flag tpl_portal desligada'}), 403
    conn = _db()
    try:
        row = conn.execute(
            f'SELECT id, codigo, nome FROM {_tbl(conn, "wms_depositante")} WHERE codigo = ?',
            (codigo,),
        ).fetchone()
        if not row:
            return jsonify({'ok': False, 'erro': 'depositante não encontrado'}), 404
        dep_id = _row_val(row, 'id')
        return jsonify({
            'ok': True,
            'portal': 'read_only',
            'depositante': {'id': dep_id, 'codigo': codigo, 'nome': _row_val(row, 'nome', 2)},
            'estoque': [],
            'nfs': [],
            'sla': [],
            'nota': 'Portal depositante foundation — integrar SSO e consultas WMS',
        })
    finally:
        conn.close()


@bp.post('/tpl/tarifa')
def api_tpl_tarifa():
    if not flag_enabled('tpl_billing'):
        return jsonify({'ok': False, 'erro': 'flag tpl_billing desligada'}), 403
    data = request.get_json(silent=True) or {}
    conn = _db()
    try:
        conn.execute(
            f'''INSERT INTO {_tbl(conn, "tpl_tarifa")}
                (depositante_id, tipo, unidade, valor, vigencia_inicio, vigencia_fim)
                VALUES (?, ?, ?, ?, ?, ?)''',
            (
                data.get('depositante_id'),
                data.get('tipo') or 'posicao',
                data.get('unidade') or 'dia',
                float(data.get('valor') or 0),
                data.get('vigencia_inicio'),
                data.get('vigencia_fim'),
            ),
        )
        conn.commit()
        return jsonify({'ok': True}), 201
    finally:
        conn.close()


@bp.post('/tpl/fatura')
def api_tpl_fatura():
    if not flag_enabled('tpl_billing'):
        return jsonify({'ok': False, 'erro': 'flag tpl_billing desligada'}), 403
    data = request.get_json(silent=True) or {}
    conn = _db()
    try:
        conn.execute(
            f'''INSERT INTO {_tbl(conn, "tpl_fatura")}
                (depositante_id, periodo, total, status, detalhe, criado_em)
                VALUES (?, ?, ?, 'rascunho', ?, ?)''',
            (
                data.get('depositante_id'),
                data.get('periodo'),
                float(data.get('total') or 0),
                json.dumps(data.get('detalhe') or {}),
                _now_iso(),
            ),
        )
        conn.commit()
        return jsonify({'ok': True, 'status': 'rascunho'}), 201
    finally:
        conn.close()


@bp.post('/tpl/sla')
def api_tpl_sla():
    if not flag_enabled('tpl_sla'):
        return jsonify({'ok': False, 'erro': 'flag tpl_sla desligada'}), 403
    data = request.get_json(silent=True) or {}
    conn = _db()
    try:
        conn.execute(
            f'''INSERT INTO {_tbl(conn, "tpl_sla_evento")}
                (depositante_id, regra, metrica, penalidade, ocorrido_em)
                VALUES (?, ?, ?, ?, ?)''',
            (
                data.get('depositante_id'),
                data.get('regra'),
                float(data.get('metrica') or 0),
                float(data.get('penalidade') or 0),
                _now_iso(),
            ),
        )
        conn.commit()
        return jsonify({'ok': True}), 201
    finally:
        conn.close()


# ── Onda 3 — YMS ─────────────────────────────────────────────────────────────

@bp.post('/yms/agendamento')
def api_yms_agendar():
    if not flag_enabled('yms_agendamento'):
        return jsonify({'ok': False, 'erro': 'flag yms_agendamento desligada'}), 403
    data = request.get_json(silent=True) or {}
    conn = _db()
    try:
        conn.execute(
            f'''INSERT INTO {_tbl(conn, "yms_agendamento")}
                (deposito_id, doca, transportadora, placa, slot_inicio, slot_fim,
                 prioridade, status, criado_em)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'agendado', ?)''',
            (
                data.get('deposito_id'),
                data.get('doca'),
                data.get('transportadora'),
                data.get('placa'),
                data.get('slot_inicio'),
                data.get('slot_fim'),
                data.get('prioridade') or 'normal',
                _now_iso(),
            ),
        )
        conn.commit()
        return jsonify({'ok': True, 'status': 'agendado'}), 201
    finally:
        conn.close()


@bp.get('/yms/agendamentos')
def api_yms_list():
    conn = _db()
    try:
        rows = conn.execute(
            f'''SELECT id, deposito_id, doca, transportadora, placa, slot_inicio,
                       slot_fim, prioridade, status, criado_em
                FROM {_tbl(conn, "yms_agendamento")} ORDER BY id DESC LIMIT 50'''
        ).fetchall()
        items = [{k: r[k] for k in r.keys()} for r in rows if hasattr(r, 'keys')]
        return jsonify({'ok': True, 'agendamentos': items})
    finally:
        conn.close()


@bp.post('/yms/portaria/checkin')
def api_yms_checkin():
    if not flag_enabled('yms_portaria'):
        return jsonify({'ok': False, 'erro': 'flag yms_portaria desligada'}), 403
    data = request.get_json(silent=True) or {}
    conn = _db()
    try:
        docs_ok = bool(data.get('docs_ok')) if _is_pg(conn) else (1 if data.get('docs_ok') else 0)
        conn.execute(
            f'''INSERT INTO {_tbl(conn, "yms_portaria_checkin")}
                (agendamento_id, placa, motorista, docs_ok, peso_entrada, status, criado_em)
                VALUES (?, ?, ?, ?, ?, 'checkin', ?)''',
            (
                data.get('agendamento_id'),
                data.get('placa'),
                data.get('motorista'),
                docs_ok,
                data.get('peso_entrada'),
                _now_iso(),
            ),
        )
        conn.commit()
        return jsonify({'ok': True, 'status': 'checkin'}), 201
    finally:
        conn.close()


@bp.get('/yms/patio')
def api_yms_patio():
    if not flag_enabled('yms_patio'):
        return jsonify({'ok': False, 'erro': 'flag yms_patio desligada'}), 403
    deposito_id = request.args.get('deposito_id', type=int)
    conn = _db()
    try:
        if deposito_id:
            rows = conn.execute(
                f'''SELECT codigo, tipo, ocupado, placa FROM {_tbl(conn, "yms_patio_vaga")}
                    WHERE deposito_id = ?''',
                (deposito_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                f'SELECT codigo, tipo, ocupado, placa, deposito_id FROM {_tbl(conn, "yms_patio_vaga")}'
            ).fetchall()
        vagas = [{k: r[k] for k in r.keys()} for r in rows if hasattr(r, 'keys')]
        return jsonify({
            'ok': True,
            'mapa': vagas,
            'kpis': {
                'ocupacao_pct': None,
                'dwell_medio_min': None,
                'throughput_docas': None,
            },
        })
    finally:
        conn.close()


@bp.post('/yms/patio/vaga')
def api_yms_vaga():
    data = request.get_json(silent=True) or {}
    conn = _db()
    try:
        conn.execute(
            f'''INSERT INTO {_tbl(conn, "yms_patio_vaga")}
                (deposito_id, codigo, tipo, ocupado) VALUES (?, ?, ?, ?)''',
            (
                data.get('deposito_id'),
                data.get('codigo'),
                data.get('tipo') or 'geral',
                False if _is_pg(conn) else 0,
            ),
        )
        conn.commit()
        return jsonify({'ok': True}), 201
    except Exception as e:
        return jsonify({'ok': False, 'erro': str(e)}), 400
    finally:
        conn.close()


# ── Onda 4 — Verticais ───────────────────────────────────────────────────────

@bp.post('/cross-dock/liberar')
def api_cross_dock():
    if not flag_enabled('cross_dock'):
        return jsonify({'ok': False, 'erro': 'flag cross_dock desligada'}), 403
    data = request.get_json(silent=True) or {}
    return jsonify({
        'ok': True,
        'fluxo': 'recebimento_para_expedicao',
        'putaway': False,
        'recebimento_id': data.get('recebimento_id'),
        'onda_expedicao': data.get('onda_expedicao') or f'XD-{uuid.uuid4().hex[:6]}',
        'status': 'liberado_stage',
    })


@bp.post('/bobinas')
def api_bobina_create():
    if not flag_enabled('bobinas'):
        return jsonify({'ok': False, 'erro': 'flag bobinas desligada'}), 403
    data = request.get_json(silent=True) or {}
    codigo = (data.get('codigo') or '').strip()
    if not codigo:
        return jsonify({'ok': False, 'erro': 'codigo obrigatório'}), 400
    conn = _db()
    try:
        conn.execute(
            f'''INSERT INTO {_tbl(conn, "wms_bobina")}
                (deposito_id, codigo, peso_kg, diametro_mm, espessura_mm,
                 empilhamento_max, piso_requerido, status, genealogy)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'ativo', ?)''',
            (
                data.get('deposito_id'),
                codigo,
                data.get('peso_kg'),
                data.get('diametro_mm'),
                data.get('espessura_mm'),
                data.get('empilhamento_max'),
                data.get('piso_requerido'),
                json.dumps(data.get('genealogy') or {}),
            ),
        )
        conn.commit()
        return jsonify({'ok': True, 'codigo': codigo}), 201
    except Exception as e:
        return jsonify({'ok': False, 'erro': str(e)}), 400
    finally:
        conn.close()


@bp.get('/bobinas')
def api_bobina_list():
    conn = _db()
    try:
        rows = conn.execute(
            f'''SELECT id, deposito_id, codigo, peso_kg, diametro_mm, status
                FROM {_tbl(conn, "wms_bobina")} ORDER BY id DESC LIMIT 50'''
        ).fetchall()
        items = [{k: r[k] for k in r.keys()} for r in rows if hasattr(r, 'keys')]
        return jsonify({'ok': True, 'bobinas': items})
    finally:
        conn.close()


@bp.post('/wcs/evento')
def api_wcs_evento():
    if not flag_enabled('wcs_middleware'):
        return jsonify({'ok': False, 'erro': 'flag wcs_middleware desligada'}), 403
    data = request.get_json(silent=True) or {}
    event_id = str(uuid.uuid4())
    conn = _db()
    try:
        conn.execute(
            f'''INSERT INTO {_tbl(conn, "rfq_integration_event")}
                (event_id, tipo, source, payload, status, criado_em)
                VALUES (?, ?, ?, ?, 'pending', ?)''',
            (
                event_id,
                data.get('tipo') or 'wcs.event',
                data.get('fabricante') or 'wcs',
                json.dumps(data),
                _now_iso(),
            ),
        )
        conn.commit()
        return jsonify({'ok': True, 'event_id': event_id}), 201
    finally:
        conn.close()


@bp.get('/portuario')
def api_portuario():
    """Declara escopo fora do núcleo."""
    return jsonify({
        'ok': True,
        'no_core': True,
        'status': 'fora_do_produto_atual',
        'mensagem': 'Portuário/Siscomex não faz parte do núcleo WMS+YMS. Projeto/parceria dedicada.',
        'doc': 'docs/roadmap-rfq/99-portuario-parceria.md',
        'flag_portuario_core': flag_enabled('portuario_core'),
    }), 200
