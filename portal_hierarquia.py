"""Árvore organizacional do portal (Hierarquia) — uma por sistema (Light / Plus / Pro).

Tipos (como no Ultrafrio Log):
  operador_logistico → filial_operador → embarcador → unidade → transportadora
"""
from __future__ import annotations

import secrets
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

FILHOS_PERMITIDOS: dict[str | None, tuple[str, ...]] = {
    None: ('operador_logistico',),
    'operador_logistico': ('filial_operador',),
    'filial_operador': ('embarcador',),
    'embarcador': ('unidade',),
    'unidade': ('transportadora',),
    'transportadora': (),
}


def _new_id() -> str:
    return secrets.token_hex(8)


def _norm_sistema(sistema: str | None) -> str:
    s = (sistema or 'plus').strip().lower()
    return s if s in SISTEMAS_ORG else 'plus'


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
                criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )'''
        )
        try:
            conn.execute(
                "ALTER TABLE public.portal_org_nos ADD COLUMN IF NOT EXISTS sistema TEXT NOT NULL DEFAULT 'plus'"
            )
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass
        try:
            conn.execute(
                'CREATE INDEX IF NOT EXISTS idx_portal_org_parent ON public.portal_org_nos (parent_id)'
            )
            conn.execute(
                'CREATE INDEX IF NOT EXISTS idx_portal_org_sistema ON public.portal_org_nos (sistema)'
            )
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
        except Exception:
            pass
        try:
            conn.commit()
        except Exception:
            pass

    # Linhas antigas sem sistema → plus
    try:
        conn.execute(
            "UPDATE portal_org_nos SET sistema = 'plus' WHERE sistema IS NULL OR TRIM(sistema) = ''"
        )
    except Exception:
        try:
            conn.rollback()
        except Exception:
            pass

    # Seed / clone por sistema
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
        # Preferir clonar a árvore do Plus (se existir); senão seed exemplo.
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
    """Exemplo Ultrafrio Log (editável depois), por sistema."""
    sistema = _norm_sistema(sistema)
    op = _new_id()
    fil = _new_id()
    emb = _new_id()
    uni = _new_id()
    nos = [
        (op, None, 'operador_logistico', 'Ultrafrio Log', '29.288.134/0001-31', None, 1),
        (fil, op, 'filial_operador', 'Ultrafrio Log - CD Guarulhos', '29.288.134/0001-32', None, 1),
        (emb, fil, 'embarcador', 'Ultrapao Alimentos', '25.448.863/0001-57', None, 1),
        (uni, emb, 'unidade', 'CD Guarulhos - Ultrapão (0201)', '47.380.171/0001-57', '0201', 1),
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
        nos.append((_new_id(), uni, 'transportadora', nome, cnpj, None, i))

    kind = getattr(conn, 'kind', 'sqlite')
    for nid, parent, tipo, nome, cnpj, codigo, ordem in nos:
        try:
            if kind == 'pg':
                conn.execute(
                    '''INSERT INTO public.portal_org_nos
                         (id, parent_id, tipo, nome, cnpj, codigo, ordem, ativo, sistema)
                       VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, ?)
                       ON CONFLICT (id) DO NOTHING''',
                    (nid, parent, tipo, nome, cnpj, codigo, ordem, sistema),
                )
            else:
                conn.execute(
                    '''INSERT OR IGNORE INTO portal_org_nos
                         (id, parent_id, tipo, nome, cnpj, codigo, ordem, ativo, sistema, criado_em, atualizado_em)
                       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))''',
                    (nid, parent, tipo, nome, cnpj, codigo, ordem, sistema),
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
        try:
            if kind == 'pg':
                conn.execute(
                    '''INSERT INTO public.portal_org_nos
                         (id, parent_id, tipo, nome, cnpj, codigo, ordem, ativo, sistema)
                       VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, ?)''',
                    (
                        new_id,
                        new_parent,
                        n['tipo'],
                        n['nome'],
                        n.get('cnpj'),
                        n.get('codigo'),
                        n.get('ordem') or 100,
                        destino,
                    ),
                )
            else:
                conn.execute(
                    '''INSERT INTO portal_org_nos
                         (id, parent_id, tipo, nome, cnpj, codigo, ordem, ativo, sistema, criado_em, atualizado_em)
                       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))''',
                    (
                        new_id,
                        new_parent,
                        n['tipo'],
                        n['nome'],
                        n.get('cnpj'),
                        n.get('codigo'),
                        n.get('ordem') or 100,
                        destino,
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
        'label_tipo': TIPO_LABELS.get(tipo, tipo),
        'usuarios_count': 0,
        'children': [],
    }


def listar_nos_flat(conn, *, sistema: str | None = None) -> list[dict[str, Any]]:
    kind = getattr(conn, 'kind', 'sqlite')
    sis = _norm_sistema(sistema) if sistema else None
    if kind == 'pg':
        if sis:
            sql = '''SELECT id, parent_id, tipo, nome, cnpj, codigo, ordem, ativo, sistema
                     FROM portal_org_nos
                     WHERE COALESCE(ativo, TRUE) IS TRUE AND sistema = ?
                     ORDER BY ordem ASC, nome ASC'''
            rows = conn.execute(sql, (sis,)).fetchall()
        else:
            sql = '''SELECT id, parent_id, tipo, nome, cnpj, codigo, ordem, ativo, sistema
                     FROM portal_org_nos
                     WHERE COALESCE(ativo, TRUE) IS TRUE
                     ORDER BY sistema ASC, ordem ASC, nome ASC'''
            rows = conn.execute(sql).fetchall()
    else:
        if sis:
            sql = '''SELECT id, parent_id, tipo, nome, cnpj, codigo, ordem, ativo, sistema
                     FROM portal_org_nos
                     WHERE COALESCE(ativo, 1) = 1 AND sistema = ?
                     ORDER BY ordem ASC, nome ASC'''
            rows = conn.execute(sql, (sis,)).fetchall()
        else:
            sql = '''SELECT id, parent_id, tipo, nome, cnpj, codigo, ordem, ativo, sistema
                     FROM portal_org_nos
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


def catalogo_tipos() -> list[dict[str, str]]:
    return [{'id': t, 'label': TIPO_LABELS[t]} for t in TIPOS_ORDEM]


def catalogo_sistemas() -> list[dict[str, str]]:
    return [{'id': s, 'label': SISTEMA_LABELS[s]} for s in SISTEMAS_ORG]


def criar_no(
    conn,
    *,
    parent_id: str | None,
    tipo: str,
    nome: str,
    cnpj: str | None = None,
    codigo: str | None = None,
    sistema: str | None = 'plus',
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
    permitidos = FILHOS_PERMITIDOS.get(parent_tipo, ())
    if tipo not in permitidos:
        raise ValueError(
            f'Não é permitido criar "{TIPO_LABELS.get(tipo, tipo)}" '
            f'sob "{TIPO_LABELS.get(parent_tipo or "", "raiz")}".'
        )

    nid = _new_id()
    kind = getattr(conn, 'kind', 'sqlite')
    if kind == 'pg':
        conn.execute(
            '''INSERT INTO public.portal_org_nos
                 (id, parent_id, tipo, nome, cnpj, codigo, ordem, ativo, sistema)
               VALUES (?, ?, ?, ?, ?, ?, 100, TRUE, ?)''',
            (nid, parent_id, tipo, nome, (cnpj or '').strip() or None, (codigo or '').strip() or None, sistema),
        )
    else:
        conn.execute(
            '''INSERT INTO portal_org_nos
                 (id, parent_id, tipo, nome, cnpj, codigo, ordem, ativo, sistema, criado_em, atualizado_em)
               VALUES (?, ?, ?, ?, ?, ?, 100, 1, ?, datetime('now'), datetime('now'))''',
            (nid, parent_id, tipo, nome, (cnpj or '').strip() or None, (codigo or '').strip() or None, sistema),
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
        'label_tipo': TIPO_LABELS[tipo],
    }


def atualizar_no(
    conn,
    *,
    no_id: str,
    nome: str | None = None,
    cnpj: str | None = None,
    codigo: str | None = None,
) -> None:
    no_id = (no_id or '').strip()
    if not no_id:
        raise ValueError('Informe o id.')
    row = conn.execute('SELECT id FROM portal_org_nos WHERE id = ?', (no_id,)).fetchone()
    if not row:
        raise ValueError('Empresa não encontrada.')
    cur = conn.execute(
        'SELECT nome, cnpj, codigo FROM portal_org_nos WHERE id = ?',
        (no_id,),
    ).fetchone()
    nome_v = (nome if nome is not None else cur['nome']).strip() if hasattr(cur, 'keys') else (nome or cur[0])
    cnpj_v = cnpj if cnpj is not None else (cur['cnpj'] if hasattr(cur, 'keys') else cur[1])
    codigo_v = codigo if codigo is not None else (cur['codigo'] if hasattr(cur, 'keys') else cur[2])
    if not str(nome_v or '').strip():
        raise ValueError('Informe o nome.')
    kind = getattr(conn, 'kind', 'sqlite')
    if kind == 'pg':
        conn.execute(
            '''UPDATE public.portal_org_nos
               SET nome = ?, cnpj = ?, codigo = ?, atualizado_em = NOW()
               WHERE id = ?''',
            (str(nome_v).strip(), (str(cnpj_v or '').strip() or None), (str(codigo_v or '').strip() or None), no_id),
        )
    else:
        conn.execute(
            '''UPDATE portal_org_nos
               SET nome = ?, cnpj = ?, codigo = ?, atualizado_em = datetime('now')
               WHERE id = ?''',
            (str(nome_v).strip(), (str(cnpj_v or '').strip() or None), (str(codigo_v or '').strip() or None), no_id),
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
    conn.execute('DELETE FROM portal_org_nos WHERE id = ?', (no_id,))
    try:
        conn.commit()
    except Exception:
        pass


def filho_sugerido(tipo_pai: str | None) -> str | None:
    permitidos = FILHOS_PERMITIDOS.get(tipo_pai, ())
    return permitidos[0] if permitidos else None
