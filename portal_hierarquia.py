"""Árvore organizacional do portal (Hierarquia) — uma por sistema (Light / Plus / Pro).

Alinhado ao Docalivre:
  Operador → Filial → Embarcador → Unidade → Transportadora
  Parentesco flexível (VALID_PARENT_TYPES), grupos_hierarquia e visibilidade BFS top-down.
"""
from __future__ import annotations

import secrets
from collections import deque
from typing import Any

SISTEMAS_ORG = ('light', 'plus', 'pro')

SISTEMA_LABELS = {
    'light': 'WMS Light',
    'plus': 'WMS Plus',
    'pro': 'WMS Pro',
}

TIPOS_ORDEM = (
    'operador_logistico',
    'filial_operador',
    'embarcador',
    'unidade',
    'transportadora',
)

TIPO_LABELS = {
    'operador_logistico': 'Operador Logístico',
    'filial_operador': 'Filial Operador',
    'embarcador': 'Embarcador',
    'unidade': 'Unidade',
    'transportadora': 'Transportadora',
}

# Pais válidos por tipo (doc Docalivre).
VALID_PARENT_TYPES: dict[str, tuple[str, ...]] = {
    'operador_logistico': (),
    'filial_operador': ('operador_logistico',),
    'embarcador': ('filial_operador', 'operador_logistico'),
    'unidade': ('embarcador', 'filial_operador'),
    'transportadora': ('unidade', 'filial_operador'),
}

# Filhos permitidos sob um tipo de pai (derivado + raiz).
FILHOS_PERMITIDOS: dict[str | None, tuple[str, ...]] = {
    None: ('operador_logistico',),
    'operador_logistico': ('filial_operador', 'embarcador'),
    'filial_operador': ('embarcador', 'unidade', 'transportadora'),
    'embarcador': ('unidade',),
    'unidade': ('transportadora',),
    'transportadora': (),
}


def _new_id() -> str:
    return secrets.token_hex(8)


def _norm_sistema(sistema: str | None) -> str:
    s = (sistema or 'plus').strip().lower()
    return s if s in SISTEMAS_ORG else 'plus'


def _as_bool(v: Any, default: bool = False) -> bool:
    if v is None:
        return default
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return bool(v)
    s = str(v).strip().lower()
    if s in ('1', 'true', 't', 'yes', 'sim', 'on'):
        return True
    if s in ('0', 'false', 'f', 'no', 'nao', 'não', 'off', ''):
        return False
    return default


def ensure_portal_org_schema(conn) -> None:
    kind = getattr(conn, 'kind', 'sqlite')
    if kind == 'pg':
        conn.execute(
            '''CREATE TABLE IF NOT EXISTS public.portal_org_nos (
                id TEXT PRIMARY KEY,
                parent_id TEXT,
                tipo TEXT NOT NULL,
                nome TEXT NOT NULL,
                cnpj TEXT,
                codigo TEXT,
                ordem INTEGER NOT NULL DEFAULT 100,
                ativo BOOLEAN NOT NULL DEFAULT TRUE,
                sistema TEXT NOT NULL DEFAULT 'plus',
                is_fornecedor BOOLEAN NOT NULL DEFAULT FALSE,
                criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )'''
        )
        for stmt in (
            "ALTER TABLE public.portal_org_nos ADD COLUMN IF NOT EXISTS sistema TEXT NOT NULL DEFAULT 'plus'",
            "ALTER TABLE public.portal_org_nos ADD COLUMN IF NOT EXISTS is_fornecedor BOOLEAN NOT NULL DEFAULT FALSE",
            'CREATE INDEX IF NOT EXISTS idx_portal_org_parent ON public.portal_org_nos (parent_id)',
            'CREATE INDEX IF NOT EXISTS idx_portal_org_sistema ON public.portal_org_nos (sistema)',
        ):
            try:
                conn.execute(stmt)
            except Exception:
                try:
                    conn.rollback()
                except Exception:
                    pass

        conn.execute(
            '''CREATE TABLE IF NOT EXISTS public.portal_grupos_hierarquia (
                id TEXT PRIMARY KEY,
                nome TEXT NOT NULL,
                descricao TEXT,
                sistema TEXT NOT NULL DEFAULT 'plus',
                empresa_id TEXT,
                criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )'''
        )
        conn.execute(
            '''CREATE TABLE IF NOT EXISTS public.portal_grupos_hierarquia_empresas (
                id TEXT PRIMARY KEY,
                grupo_id TEXT NOT NULL,
                empresa_id TEXT NOT NULL,
                parent_empresa_id TEXT,
                posicao INTEGER NOT NULL DEFAULT 100,
                sistema TEXT NOT NULL DEFAULT 'plus',
                criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )'''
        )
        for stmt in (
            'CREATE INDEX IF NOT EXISTS idx_portal_grp_sis ON public.portal_grupos_hierarquia (sistema)',
            'CREATE INDEX IF NOT EXISTS idx_portal_grp_emp_grupo ON public.portal_grupos_hierarquia_empresas (grupo_id)',
            'CREATE INDEX IF NOT EXISTS idx_portal_grp_emp_empresa ON public.portal_grupos_hierarquia_empresas (empresa_id)',
        ):
            try:
                conn.execute(stmt)
            except Exception:
                try:
                    conn.rollback()
                except Exception:
                    pass
    else:
        conn.execute(
            '''CREATE TABLE IF NOT EXISTS portal_org_nos (
                id TEXT PRIMARY KEY,
                parent_id TEXT,
                tipo TEXT NOT NULL,
                nome TEXT NOT NULL,
                cnpj TEXT,
                codigo TEXT,
                ordem INTEGER NOT NULL DEFAULT 100,
                ativo INTEGER NOT NULL DEFAULT 1,
                sistema TEXT NOT NULL DEFAULT 'plus',
                is_fornecedor INTEGER NOT NULL DEFAULT 0,
                criado_em TEXT,
                atualizado_em TEXT
            )'''
        )
        try:
            cols = {
                str(r['name'] if hasattr(r, 'keys') else r[1]).lower()
                for r in conn.execute('PRAGMA table_info(portal_org_nos)').fetchall()
            }
            if 'sistema' not in cols:
                conn.execute("ALTER TABLE portal_org_nos ADD COLUMN sistema TEXT NOT NULL DEFAULT 'plus'")
            if 'is_fornecedor' not in cols:
                conn.execute('ALTER TABLE portal_org_nos ADD COLUMN is_fornecedor INTEGER NOT NULL DEFAULT 0')
        except Exception:
            pass

        conn.execute(
            '''CREATE TABLE IF NOT EXISTS portal_grupos_hierarquia (
                id TEXT PRIMARY KEY,
                nome TEXT NOT NULL,
                descricao TEXT,
                sistema TEXT NOT NULL DEFAULT 'plus',
                empresa_id TEXT,
                criado_em TEXT
            )'''
        )
        conn.execute(
            '''CREATE TABLE IF NOT EXISTS portal_grupos_hierarquia_empresas (
                id TEXT PRIMARY KEY,
                grupo_id TEXT NOT NULL,
                empresa_id TEXT NOT NULL,
                parent_empresa_id TEXT,
                posicao INTEGER NOT NULL DEFAULT 100,
                sistema TEXT NOT NULL DEFAULT 'plus',
                criado_em TEXT
            )'''
        )
        try:
            conn.commit()
        except Exception:
            pass

    try:
        conn.execute(
            "UPDATE portal_org_nos SET sistema = 'plus' WHERE sistema IS NULL OR TRIM(sistema) = ''"
        )
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass

    for sis in SISTEMAS_ORG:
        try:
            row = conn.execute(
                'SELECT COUNT(*) AS c FROM portal_org_nos WHERE sistema = ?',
                (sis,),
            ).fetchone()
            count = int(row['c'] if hasattr(row, 'keys') else row[0] or 0)
        except Exception:
            count = 0
        if count > 0:
            continue
        try:
            plus_count_row = conn.execute(
                "SELECT COUNT(*) AS c FROM portal_org_nos WHERE sistema = 'plus'"
            ).fetchone()
            plus_count = int(
                plus_count_row['c'] if hasattr(plus_count_row, 'keys') else plus_count_row[0] or 0
            )
        except Exception:
            plus_count = 0
        if sis != 'plus' and plus_count > 0:
            _clonar_sistema(conn, origem='plus', destino=sis)
        else:
            _seed_exemplo(conn, sistema=sis)

    try:
        conn.commit()
    except Exception:
        pass


def _seed_exemplo(conn, *, sistema: str = 'plus') -> None:
    sistema = _norm_sistema(sistema)
    op = _new_id()
    fil = _new_id()
    emb = _new_id()
    uni = _new_id()
    nos = [
        (op, None, 'operador_logistico', 'Ultrafrio Log', '29.288.134/0001-31', None, 1, 0),
        (fil, op, 'filial_operador', 'Ultrafrio Log - CD Guarulhos', '29.288.134/0001-32', None, 1, 0),
        (emb, fil, 'embarcador', 'Ultrapao Alimentos', '25.448.863/0001-57', None, 1, 0),
        (uni, emb, 'unidade', 'CD Guarulhos - Ultrapão (0201)', '47.380.171/0001-57', '0201', 1, 0),
    ]
    transportadoras = [
        ('MCM', '45.994.885/0001-03'),
        ('Alexandre do Nascimento', '22.891.809/0001-40'),
        ('Ultrapão Transportes', '08.783.957/0001-02'),
        ('Alto Padrão', '07.214.920/0001-50'),
        ('Carlos de Mattos transportes', '26.990.250/0001-00'),
        ('Dener Augusto', '18.213.288/0001-81'),
        ('JMX LOG', '61.160.607/0001-05'),
    ]
    for i, (nome, cnpj) in enumerate(transportadoras, start=1):
        nos.append((_new_id(), uni, 'transportadora', nome, cnpj, None, i, 0))

    kind = getattr(conn, 'kind', 'sqlite')
    for nid, parent, tipo, nome, cnpj, codigo, ordem, forn in nos:
        try:
            if kind == 'pg':
                conn.execute(
                    '''INSERT INTO public.portal_org_nos
                         (id, parent_id, tipo, nome, cnpj, codigo, ordem, ativo, sistema, is_fornecedor)
                       VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, ?, ?)
                       ON CONFLICT (id) DO NOTHING''',
                    (nid, parent, tipo, nome, cnpj, codigo, ordem, sistema, bool(forn)),
                )
            else:
                conn.execute(
                    '''INSERT OR IGNORE INTO portal_org_nos
                         (id, parent_id, tipo, nome, cnpj, codigo, ordem, ativo, sistema, is_fornecedor,
                          criado_em, atualizado_em)
                       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, datetime('now'), datetime('now'))''',
                    (nid, parent, tipo, nome, cnpj, codigo, ordem, sistema, int(forn)),
                )
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass


def _clonar_sistema(conn, *, origem: str, destino: str) -> None:
    origem = _norm_sistema(origem)
    destino = _norm_sistema(destino)
    if origem == destino:
        return
    flat = listar_nos_flat(conn, sistema=origem)
    if not flat:
        _seed_exemplo(conn, sistema=destino)
        return
    id_map = {n['id']: _new_id() for n in flat}
    kind = getattr(conn, 'kind', 'sqlite')
    for n in flat:
        old_id = n['id']
        new_id = id_map[old_id]
        old_parent = n.get('parent_id')
        new_parent = id_map.get(old_parent) if old_parent else None
        forn = bool(n.get('is_fornecedor'))
        try:
            if kind == 'pg':
                conn.execute(
                    '''INSERT INTO public.portal_org_nos
                         (id, parent_id, tipo, nome, cnpj, codigo, ordem, ativo, sistema, is_fornecedor)
                       VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, ?, ?)''',
                    (
                        new_id,
                        new_parent,
                        n['tipo'],
                        n['nome'],
                        n.get('cnpj'),
                        n.get('codigo'),
                        n.get('ordem') or 100,
                        destino,
                        forn,
                    ),
                )
            else:
                conn.execute(
                    '''INSERT INTO portal_org_nos
                         (id, parent_id, tipo, nome, cnpj, codigo, ordem, ativo, sistema, is_fornecedor,
                          criado_em, atualizado_em)
                       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, datetime('now'), datetime('now'))''',
                    (
                        new_id,
                        new_parent,
                        n['tipo'],
                        n['nome'],
                        n.get('cnpj'),
                        n.get('codigo'),
                        n.get('ordem') or 100,
                        destino,
                        int(forn),
                    ),
                )
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass


def _row_to_no(r: Any) -> dict[str, Any]:
    keys = set(r.keys()) if hasattr(r, 'keys') else set()

    def g(name: str, idx: int, default=None):
        if name in keys:
            return r[name]
        try:
            return r[idx]
        except Exception:
            return default

    tipo = str(g('tipo', 2) or '')
    return {
        'id': str(g('id', 0) or ''),
        'parent_id': (str(g('parent_id', 1)) if g('parent_id', 1) else None),
        'tipo': tipo,
        'nome': str(g('nome', 3) or ''),
        'cnpj': str(g('cnpj', 4) or '') or None,
        'codigo': str(g('codigo', 5) or '') or None,
        'ordem': int(g('ordem', 6) or 100),
        'ativo': bool(g('ativo', 7, True)),
        'sistema': _norm_sistema(str(g('sistema', 8) or 'plus')),
        'is_fornecedor': _as_bool(g('is_fornecedor', 9, False)),
        'label_tipo': TIPO_LABELS.get(tipo, tipo),
        'usuarios_count': 0,
        'children': [],
    }


def listar_nos_flat(conn, *, sistema: str | None = None) -> list[dict[str, Any]]:
    kind = getattr(conn, 'kind', 'sqlite')
    sis = _norm_sistema(sistema) if sistema else None
    cols = 'id, parent_id, tipo, nome, cnpj, codigo, ordem, ativo, sistema, is_fornecedor'
    if kind == 'pg':
        if sis:
            sql = f'''SELECT {cols} FROM portal_org_nos
                      WHERE COALESCE(ativo, TRUE) IS TRUE AND sistema = ?
                      ORDER BY ordem ASC, nome ASC'''
            rows = conn.execute(sql, (sis,)).fetchall()
        else:
            sql = f'''SELECT {cols} FROM portal_org_nos
                      WHERE COALESCE(ativo, TRUE) IS TRUE
                      ORDER BY sistema ASC, ordem ASC, nome ASC'''
            rows = conn.execute(sql).fetchall()
    else:
        if sis:
            sql = f'''SELECT {cols} FROM portal_org_nos
                      WHERE COALESCE(ativo, 1) = 1 AND sistema = ?
                      ORDER BY ordem ASC, nome ASC'''
            rows = conn.execute(sql, (sis,)).fetchall()
        else:
            sql = f'''SELECT {cols} FROM portal_org_nos
                      WHERE COALESCE(ativo, 1) = 1
                      ORDER BY sistema ASC, ordem ASC, nome ASC'''
            rows = conn.execute(sql).fetchall()
    return [_row_to_no(r) for r in rows]


def montar_arvore(conn, sistema: str | None = None) -> list[dict[str, Any]]:
    flat = listar_nos_flat(conn, sistema=sistema)
    by_id = {n['id']: {**n, 'children': []} for n in flat}
    roots: list[dict[str, Any]] = []
    for n in by_id.values():
        pid = n.get('parent_id')
        if pid and pid in by_id:
            by_id[pid]['children'].append(n)
        else:
            roots.append(n)
    return roots


def montar_arvores_por_sistema(conn) -> dict[str, list[dict[str, Any]]]:
    return {s: montar_arvore(conn, sistema=s) for s in SISTEMAS_ORG}


def catalogo_tipos() -> list[dict[str, Any]]:
    out = []
    for t in TIPOS_ORDEM:
        out.append(
            {
                'id': t,
                'label': TIPO_LABELS[t],
                'valid_parents': list(VALID_PARENT_TYPES.get(t, ())),
                'allowed_children': list(FILHOS_PERMITIDOS.get(t, ())),
            }
        )
    return out


def catalogo_sistemas() -> list[dict[str, str]]:
    return [{'id': s, 'label': SISTEMA_LABELS[s]} for s in SISTEMAS_ORG]


def filhos_permitidos(tipo_pai: str | None) -> list[str]:
    return list(FILHOS_PERMITIDOS.get(tipo_pai, ()))


def criar_no(
    conn,
    *,
    parent_id: str | None,
    tipo: str,
    nome: str,
    cnpj: str | None = None,
    codigo: str | None = None,
    sistema: str | None = 'plus',
    is_fornecedor: bool | None = None,
) -> dict[str, Any]:
    tipo = (tipo or '').strip().lower()
    nome = (nome or '').strip()
    sistema = _norm_sistema(sistema)
    if not nome:
        raise ValueError('Informe o nome.')
    if tipo not in TIPO_LABELS:
        raise ValueError('Tipo inválido.')

    parent_tipo: str | None = None
    if parent_id:
        row = conn.execute(
            'SELECT tipo, sistema FROM portal_org_nos WHERE id = ?',
            (parent_id,),
        ).fetchone()
        if not row:
            raise ValueError('Empresa pai não encontrada.')
        parent_tipo = str(row['tipo'] if hasattr(row, 'keys') else row[0])
        parent_sis = _norm_sistema(str(row['sistema'] if hasattr(row, 'keys') else row[1]))
        if parent_sis != sistema:
            raise ValueError('Empresa pai pertence a outro sistema.')
        valid_parents = VALID_PARENT_TYPES.get(tipo, ())
        if parent_tipo not in valid_parents:
            raise ValueError(
                f'Não é permitido criar "{TIPO_LABELS.get(tipo, tipo)}" '
                f'sob "{TIPO_LABELS.get(parent_tipo or "", "raiz")}".'
            )
    else:
        if tipo != 'operador_logistico':
            raise ValueError('Somente Operador Logístico pode ser raiz.')

    forn = bool(is_fornecedor) if tipo == 'embarcador' else False
    nid = _new_id()
    kind = getattr(conn, 'kind', 'sqlite')
    if kind == 'pg':
        conn.execute(
            '''INSERT INTO public.portal_org_nos
                 (id, parent_id, tipo, nome, cnpj, codigo, ordem, ativo, sistema, is_fornecedor)
               VALUES (?, ?, ?, ?, ?, ?, 100, TRUE, ?, ?)''',
            (
                nid,
                parent_id,
                tipo,
                nome,
                (cnpj or '').strip() or None,
                (codigo or '').strip() or None,
                sistema,
                forn,
            ),
        )
    else:
        conn.execute(
            '''INSERT INTO portal_org_nos
                 (id, parent_id, tipo, nome, cnpj, codigo, ordem, ativo, sistema, is_fornecedor,
                  criado_em, atualizado_em)
               VALUES (?, ?, ?, ?, ?, ?, 100, 1, ?, ?, datetime('now'), datetime('now'))''',
            (
                nid,
                parent_id,
                tipo,
                nome,
                (cnpj or '').strip() or None,
                (codigo or '').strip() or None,
                sistema,
                int(forn),
            ),
        )
    try:
        conn.commit()
    except Exception:
        pass
    return {
        'id': nid,
        'parent_id': parent_id,
        'tipo': tipo,
        'nome': nome,
        'cnpj': cnpj,
        'codigo': codigo,
        'sistema': sistema,
        'is_fornecedor': forn,
        'label_tipo': TIPO_LABELS[tipo],
    }


def atualizar_no(
    conn,
    *,
    no_id: str,
    nome: str | None = None,
    cnpj: str | None = None,
    codigo: str | None = None,
    is_fornecedor: bool | None = None,
) -> None:
    no_id = (no_id or '').strip()
    if not no_id:
        raise ValueError('Informe o id.')
    cur = conn.execute(
        'SELECT nome, cnpj, codigo, tipo, is_fornecedor FROM portal_org_nos WHERE id = ?',
        (no_id,),
    ).fetchone()
    if not cur:
        raise ValueError('Empresa não encontrada.')
    keys = set(cur.keys()) if hasattr(cur, 'keys') else set()

    def g(name: str, idx: int):
        if name in keys:
            return cur[name]
        return cur[idx]

    nome_v = (nome if nome is not None else g('nome', 0))
    cnpj_v = cnpj if cnpj is not None else g('cnpj', 1)
    codigo_v = codigo if codigo is not None else g('codigo', 2)
    tipo = str(g('tipo', 3) or '')
    forn_atual = _as_bool(g('is_fornecedor', 4), False)
    forn_v = bool(is_fornecedor) if is_fornecedor is not None and tipo == 'embarcador' else (
        forn_atual if tipo == 'embarcador' else False
    )
    if not str(nome_v or '').strip():
        raise ValueError('Informe o nome.')
    kind = getattr(conn, 'kind', 'sqlite')
    if kind == 'pg':
        conn.execute(
            '''UPDATE public.portal_org_nos
               SET nome = ?, cnpj = ?, codigo = ?, is_fornecedor = ?, atualizado_em = NOW()
               WHERE id = ?''',
            (
                str(nome_v).strip(),
                (str(cnpj_v or '').strip() or None),
                (str(codigo_v or '').strip() or None),
                forn_v,
                no_id,
            ),
        )
    else:
        conn.execute(
            '''UPDATE portal_org_nos
               SET nome = ?, cnpj = ?, codigo = ?, is_fornecedor = ?, atualizado_em = datetime('now')
               WHERE id = ?''',
            (
                str(nome_v).strip(),
                (str(cnpj_v or '').strip() or None),
                (str(codigo_v or '').strip() or None),
                int(forn_v),
                no_id,
            ),
        )
    try:
        conn.commit()
    except Exception:
        pass


def excluir_no(conn, *, no_id: str) -> None:
    no_id = (no_id or '').strip()
    if not no_id:
        raise ValueError('Informe o id.')
    filhos = conn.execute(
        'SELECT COUNT(*) AS c FROM portal_org_nos WHERE parent_id = ?',
        (no_id,),
    ).fetchone()
    count = int(filhos['c'] if hasattr(filhos, 'keys') else filhos[0] or 0)
    if count > 0:
        raise ValueError('Remova os itens filhos antes de excluir esta empresa.')
    try:
        conn.execute('DELETE FROM portal_grupos_hierarquia_empresas WHERE empresa_id = ?', (no_id,))
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass
    conn.execute('DELETE FROM portal_org_nos WHERE id = ?', (no_id,))
    try:
        conn.commit()
    except Exception:
        pass


def filho_sugerido(tipo_pai: str | None) -> str | None:
    permitidos = FILHOS_PERMITIDOS.get(tipo_pai, ())
    return permitidos[0] if permitidos else None


# ---------------------------------------------------------------------------
# Grupos de hierarquia
# ---------------------------------------------------------------------------

def _row_grupo(r: Any) -> dict[str, Any]:
    keys = set(r.keys()) if hasattr(r, 'keys') else set()

    def g(name: str, idx: int, default=None):
        if name in keys:
            return r[name]
        try:
            return r[idx]
        except Exception:
            return default

    return {
        'id': str(g('id', 0) or ''),
        'nome': str(g('nome', 1) or ''),
        'descricao': str(g('descricao', 2) or '') or None,
        'sistema': _norm_sistema(str(g('sistema', 3) or 'plus')),
        'empresa_id': (str(g('empresa_id', 4)) if g('empresa_id', 4) else None),
        'membros': [],
    }


def _row_membro(r: Any) -> dict[str, Any]:
    keys = set(r.keys()) if hasattr(r, 'keys') else set()

    def g(name: str, idx: int, default=None):
        if name in keys:
            return r[name]
        try:
            return r[idx]
        except Exception:
            return default

    return {
        'id': str(g('id', 0) or ''),
        'grupo_id': str(g('grupo_id', 1) or ''),
        'empresa_id': str(g('empresa_id', 2) or ''),
        'parent_empresa_id': (str(g('parent_empresa_id', 3)) if g('parent_empresa_id', 3) else None),
        'posicao': int(g('posicao', 4) or 100),
        'sistema': _norm_sistema(str(g('sistema', 5) or 'plus')),
        'empresa_nome': str(g('empresa_nome', 6) or '') or None,
        'empresa_tipo': str(g('empresa_tipo', 7) or '') or None,
    }


def listar_grupos(conn, *, sistema: str | None = None) -> list[dict[str, Any]]:
    sistema = _norm_sistema(sistema) if sistema else None
    if sistema:
        rows = conn.execute(
            '''SELECT id, nome, descricao, sistema, empresa_id
               FROM portal_grupos_hierarquia
               WHERE sistema = ?
               ORDER BY nome ASC''',
            (sistema,),
        ).fetchall()
    else:
        rows = conn.execute(
            '''SELECT id, nome, descricao, sistema, empresa_id
               FROM portal_grupos_hierarquia
               ORDER BY sistema ASC, nome ASC'''
        ).fetchall()
    grupos = [_row_grupo(r) for r in rows]
    for g in grupos:
        g['membros'] = listar_membros_grupo(conn, grupo_id=g['id'])
    return grupos


def listar_grupos_por_sistema(conn) -> dict[str, list[dict[str, Any]]]:
    return {s: listar_grupos(conn, sistema=s) for s in SISTEMAS_ORG}


def listar_membros_grupo(conn, *, grupo_id: str) -> list[dict[str, Any]]:
    rows = conn.execute(
        '''SELECT m.id, m.grupo_id, m.empresa_id, m.parent_empresa_id, m.posicao, m.sistema,
                  n.nome AS empresa_nome, n.tipo AS empresa_tipo
           FROM portal_grupos_hierarquia_empresas m
           LEFT JOIN portal_org_nos n ON n.id = m.empresa_id
           WHERE m.grupo_id = ?
           ORDER BY m.posicao ASC, n.nome ASC''',
        (grupo_id,),
    ).fetchall()
    return [_row_membro(r) for r in rows]


def criar_grupo(
    conn,
    *,
    nome: str,
    descricao: str | None = None,
    sistema: str | None = 'plus',
    empresa_id: str | None = None,
) -> dict[str, Any]:
    nome = (nome or '').strip()
    sistema = _norm_sistema(sistema)
    if not nome:
        raise ValueError('Informe o nome do grupo.')
    gid = _new_id()
    kind = getattr(conn, 'kind', 'sqlite')
    if kind == 'pg':
        conn.execute(
            '''INSERT INTO public.portal_grupos_hierarquia
                 (id, nome, descricao, sistema, empresa_id)
               VALUES (?, ?, ?, ?, ?)''',
            (gid, nome, (descricao or '').strip() or None, sistema, empresa_id or None),
        )
    else:
        conn.execute(
            '''INSERT INTO portal_grupos_hierarquia
                 (id, nome, descricao, sistema, empresa_id, criado_em)
               VALUES (?, ?, ?, ?, ?, datetime('now'))''',
            (gid, nome, (descricao or '').strip() or None, sistema, empresa_id or None),
        )
    try:
        conn.commit()
    except Exception:
        pass
    return {
        'id': gid,
        'nome': nome,
        'descricao': (descricao or '').strip() or None,
        'sistema': sistema,
        'empresa_id': empresa_id or None,
        'membros': [],
    }


def atualizar_grupo(
    conn,
    *,
    grupo_id: str,
    nome: str | None = None,
    descricao: str | None = None,
) -> None:
    grupo_id = (grupo_id or '').strip()
    if not grupo_id:
        raise ValueError('Informe o id do grupo.')
    cur = conn.execute(
        'SELECT nome, descricao FROM portal_grupos_hierarquia WHERE id = ?',
        (grupo_id,),
    ).fetchone()
    if not cur:
        raise ValueError('Grupo não encontrado.')
    nome_v = (nome if nome is not None else cur['nome'] if hasattr(cur, 'keys') else cur[0])
    desc_v = descricao if descricao is not None else (cur['descricao'] if hasattr(cur, 'keys') else cur[1])
    if not str(nome_v or '').strip():
        raise ValueError('Informe o nome do grupo.')
    conn.execute(
        '''UPDATE portal_grupos_hierarquia
           SET nome = ?, descricao = ?
           WHERE id = ?''',
        (str(nome_v).strip(), (str(desc_v or '').strip() or None), grupo_id),
    )
    try:
        conn.commit()
    except Exception:
        pass


def excluir_grupo(conn, *, grupo_id: str) -> None:
    grupo_id = (grupo_id or '').strip()
    if not grupo_id:
        raise ValueError('Informe o id do grupo.')
    conn.execute('DELETE FROM portal_grupos_hierarquia_empresas WHERE grupo_id = ?', (grupo_id,))
    conn.execute('DELETE FROM portal_grupos_hierarquia WHERE id = ?', (grupo_id,))
    try:
        conn.commit()
    except Exception:
        pass


def adicionar_membro_grupo(
    conn,
    *,
    grupo_id: str,
    empresa_id: str,
    parent_empresa_id: str | None = None,
    posicao: int | None = None,
) -> dict[str, Any]:
    grupo_id = (grupo_id or '').strip()
    empresa_id = (empresa_id or '').strip()
    if not grupo_id or not empresa_id:
        raise ValueError('Informe grupo e empresa.')
    g = conn.execute(
        'SELECT id, sistema FROM portal_grupos_hierarquia WHERE id = ?',
        (grupo_id,),
    ).fetchone()
    if not g:
        raise ValueError('Grupo não encontrado.')
    sistema = _norm_sistema(str(g['sistema'] if hasattr(g, 'keys') else g[1]))
    emp = conn.execute(
        'SELECT id, sistema FROM portal_org_nos WHERE id = ?',
        (empresa_id,),
    ).fetchone()
    if not emp:
        raise ValueError('Empresa não encontrada.')
    emp_sis = _norm_sistema(str(emp['sistema'] if hasattr(emp, 'keys') else emp[1]))
    if emp_sis != sistema:
        raise ValueError('Empresa pertence a outro sistema.')
    if parent_empresa_id:
        parent_empresa_id = parent_empresa_id.strip()
        exists = conn.execute(
            '''SELECT 1 FROM portal_grupos_hierarquia_empresas
               WHERE grupo_id = ? AND empresa_id = ?''',
            (grupo_id, parent_empresa_id),
        ).fetchone()
        if not exists:
            raise ValueError('Empresa pai precisa ser membro do mesmo grupo.')
    dup = conn.execute(
        '''SELECT 1 FROM portal_grupos_hierarquia_empresas
           WHERE grupo_id = ? AND empresa_id = ?''',
        (grupo_id, empresa_id),
    ).fetchone()
    if dup:
        raise ValueError('Empresa já está neste grupo.')
    mid = _new_id()
    pos = int(posicao if posicao is not None else 100)
    kind = getattr(conn, 'kind', 'sqlite')
    if kind == 'pg':
        conn.execute(
            '''INSERT INTO public.portal_grupos_hierarquia_empresas
                 (id, grupo_id, empresa_id, parent_empresa_id, posicao, sistema)
               VALUES (?, ?, ?, ?, ?, ?)''',
            (mid, grupo_id, empresa_id, parent_empresa_id or None, pos, sistema),
        )
    else:
        conn.execute(
            '''INSERT INTO portal_grupos_hierarquia_empresas
                 (id, grupo_id, empresa_id, parent_empresa_id, posicao, sistema, criado_em)
               VALUES (?, ?, ?, ?, ?, ?, datetime('now'))''',
            (mid, grupo_id, empresa_id, parent_empresa_id or None, pos, sistema),
        )
    try:
        conn.commit()
    except Exception:
        pass
    membros = listar_membros_grupo(conn, grupo_id=grupo_id)
    return next((m for m in membros if m['id'] == mid), {'id': mid, 'grupo_id': grupo_id, 'empresa_id': empresa_id})


def remover_membro_grupo(conn, *, membro_id: str | None = None, grupo_id: str | None = None, empresa_id: str | None = None) -> None:
    if membro_id:
        mid = membro_id.strip()
        filhos = conn.execute(
            '''SELECT COUNT(*) AS c FROM portal_grupos_hierarquia_empresas
               WHERE parent_empresa_id = (
                   SELECT empresa_id FROM portal_grupos_hierarquia_empresas WHERE id = ?
               ) AND grupo_id = (
                   SELECT grupo_id FROM portal_grupos_hierarquia_empresas WHERE id = ?
               )''',
            (mid, mid),
        ).fetchone()
        count = int(filhos['c'] if hasattr(filhos, 'keys') else filhos[0] or 0)
        if count > 0:
            raise ValueError('Remova os membros filhos neste grupo antes.')
        conn.execute('DELETE FROM portal_grupos_hierarquia_empresas WHERE id = ?', (mid,))
    elif grupo_id and empresa_id:
        conn.execute(
            'DELETE FROM portal_grupos_hierarquia_empresas WHERE grupo_id = ? AND empresa_id = ?',
            (grupo_id.strip(), empresa_id.strip()),
        )
    else:
        raise ValueError('Informe membro_id ou grupo_id+empresa_id.')
    try:
        conn.commit()
    except Exception:
        pass


def atualizar_membro_grupo(
    conn,
    *,
    membro_id: str,
    parent_empresa_id: str | None = None,
    posicao: int | None = None,
) -> None:
    membro_id = (membro_id or '').strip()
    if not membro_id:
        raise ValueError('Informe o id do membro.')
    cur = conn.execute(
        'SELECT grupo_id, parent_empresa_id, posicao FROM portal_grupos_hierarquia_empresas WHERE id = ?',
        (membro_id,),
    ).fetchone()
    if not cur:
        raise ValueError('Membro não encontrado.')
    grupo_id = str(cur['grupo_id'] if hasattr(cur, 'keys') else cur[0])
    parent_v = parent_empresa_id if parent_empresa_id is not None else (
        cur['parent_empresa_id'] if hasattr(cur, 'keys') else cur[1]
    )
    pos_v = int(posicao if posicao is not None else (cur['posicao'] if hasattr(cur, 'keys') else cur[2] or 100))
    if parent_v:
        parent_v = str(parent_v).strip() or None
        if parent_v:
            exists = conn.execute(
                '''SELECT 1 FROM portal_grupos_hierarquia_empresas
                   WHERE grupo_id = ? AND empresa_id = ?''',
                (grupo_id, parent_v),
            ).fetchone()
            if not exists:
                raise ValueError('Empresa pai precisa ser membro do mesmo grupo.')
    conn.execute(
        '''UPDATE portal_grupos_hierarquia_empresas
           SET parent_empresa_id = ?, posicao = ?
           WHERE id = ?''',
        (parent_v or None, pos_v, membro_id),
    )
    try:
        conn.commit()
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Visibilidade BFS top-down (doc Docalivre)
# ---------------------------------------------------------------------------

def empresas_visiveis(conn, *, empresa_id: str, sistema: str | None = 'plus') -> list[dict[str, Any]]:
    """Empresas que o usuário da empresa_id pode ver (top-down via grupos + árvore).

    1) Grupos diretos da empresa
    2) BFS de grupos conectados por empresas em comum (pontes)
    3) BFS descendente a partir da empresa nos grupos descobertos e na árvore parent_id
    4) Nunca sobe para ancestrais
    """
    empresa_id = (empresa_id or '').strip()
    sistema = _norm_sistema(sistema)
    if not empresa_id:
        return []

    # Confirma empresa no sistema
    row = conn.execute(
        'SELECT id FROM portal_org_nos WHERE id = ? AND sistema = ?',
        (empresa_id, sistema),
    ).fetchone()
    if not row:
        return []

    # Membros de todos os grupos do sistema
    membros = conn.execute(
        '''SELECT grupo_id, empresa_id, parent_empresa_id
           FROM portal_grupos_hierarquia_empresas
           WHERE sistema = ?''',
        (sistema,),
    ).fetchall()

    grupo_empresas: dict[str, set[str]] = {}
    children_in_grupo: dict[str, dict[str, list[str]]] = {}
    empresa_grupos: dict[str, set[str]] = {}
    for m in membros:
        keys = set(m.keys()) if hasattr(m, 'keys') else set()
        gid = str(m['grupo_id'] if 'grupo_id' in keys else m[0])
        eid = str(m['empresa_id'] if 'empresa_id' in keys else m[1])
        pid = m['parent_empresa_id'] if 'parent_empresa_id' in keys else m[2]
        pid_s = str(pid) if pid else None
        grupo_empresas.setdefault(gid, set()).add(eid)
        empresa_grupos.setdefault(eid, set()).add(gid)
        children_in_grupo.setdefault(gid, {}).setdefault(pid_s or '', []).append(eid)
        if pid_s:
            children_in_grupo[gid].setdefault(pid_s, [])
            if eid not in children_in_grupo[gid][pid_s]:
                children_in_grupo[gid][pid_s].append(eid)

    # 1+2: grupos conectados por pontes
    start_grupos = set(empresa_grupos.get(empresa_id, set()))
    visited_grupos: set[str] = set()
    qg: deque[str] = deque(start_grupos)
    while qg:
        gid = qg.popleft()
        if gid in visited_grupos:
            continue
        visited_grupos.add(gid)
        for eid in grupo_empresas.get(gid, set()):
            for other in empresa_grupos.get(eid, set()):
                if other not in visited_grupos:
                    qg.append(other)

    visible: set[str] = {empresa_id}

    # 3a: descendentes nos grupos
    for gid in visited_grupos:
        tree = children_in_grupo.get(gid, {})
        qd: deque[str] = deque([empresa_id])
        seen_local: set[str] = set()
        while qd:
            cur = qd.popleft()
            if cur in seen_local:
                continue
            seen_local.add(cur)
            visible.add(cur)
            for child in tree.get(cur, []):
                if child not in seen_local:
                    qd.append(child)

    # 3b: descendentes na árvore parent_id do sistema
    flat = listar_nos_flat(conn, sistema=sistema)
    children_tree: dict[str, list[str]] = {}
    by_id = {n['id']: n for n in flat}
    for n in flat:
        pid = n.get('parent_id')
        if pid:
            children_tree.setdefault(str(pid), []).append(n['id'])

    qd2: deque[str] = deque([empresa_id])
    seen2: set[str] = set()
    while qd2:
        cur = qd2.popleft()
        if cur in seen2:
            continue
        seen2.add(cur)
        visible.add(cur)
        for child in children_tree.get(cur, []):
            if child not in seen2:
                qd2.append(child)

    return [by_id[i] for i in sorted(visible) if i in by_id]


def montar_arvore_visivel(conn, *, empresa_id: str, sistema: str | None = 'plus') -> list[dict[str, Any]]:
    vis = empresas_visiveis(conn, empresa_id=empresa_id, sistema=sistema)
    by_id = {n['id']: {**n, 'children': []} for n in vis}
    roots: list[dict[str, Any]] = []
    for n in by_id.values():
        pid = n.get('parent_id')
        if pid and pid in by_id:
            by_id[pid]['children'].append(n)
        else:
            roots.append(n)
    return roots
