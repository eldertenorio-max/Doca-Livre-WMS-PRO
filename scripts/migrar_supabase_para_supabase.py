#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Copia todas as tabelas do schema public de um Supabase (origem) para outro (destino).

Uso (PowerShell, na raiz do projeto):

  pip install psycopg[binary] python-dotenv

  $env:DATABASE_URL_ORIGEM = "postgresql://..."   # Supabase ANTIGO
  $env:DATABASE_URL_DESTINO = "postgresql://..."  # Supabase NOVO (Sistema WMS)
  $env:PGSSLMODE = "require"
  python scripts/migrar_supabase_para_supabase.py

Opções úteis:
  --dry-run              só conta linhas, não grava
  --sem-limpar           não faz TRUNCATE no destino (append / upsert manual)
  --tabela produtos_bipados   copia só uma tabela (pode repetir)

Renomeações automáticas (origem → destino):
  conjuntos_de_dados_excel → excel_datasets

Pré-requisito: estrutura (tabelas vazias) já criada no destino.
Depois compare:
  $env:DATABASE_URL = $env:DATABASE_URL_ORIGEM; python scripts/contar_linhas_supabase.py
  $env:DATABASE_URL = $env:DATABASE_URL_DESTINO; python scripts/contar_linhas_supabase.py
"""
from __future__ import annotations

import argparse
import os
import sys
from collections import defaultdict, deque

try:
    import psycopg
    from psycopg.rows import dict_row
    from psycopg.types.json import Json
except ImportError:
    print("Instale: pip install psycopg[binary]")
    sys.exit(1)

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None  # type: ignore

# Origem (nome antigo) → destino (nome no Sistema WMS / app)
_ALIASES_TABELA: dict[str, str] = {
    "conjuntos_de_dados_excel": "excel_datasets",
}

# Tabelas legadas só no antigo — ignorar na migração (não abortar)
_IGNORAR_ORIGEM: frozenset[str] = frozenset(
    {"excel_placas", "excel_colaboradores", "roteiros"}
)


def _destino_de(tabela_origem: str) -> str:
    return _ALIASES_TABELA.get(tabela_origem, tabela_origem)


def _raiz() -> str:
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _carregar_env() -> None:
    if load_dotenv:
        load_dotenv(os.path.join(_raiz(), ".env"))


def _url(nome: str) -> str:
    url = (os.environ.get(nome) or "").strip()
    if not url:
        raise SystemExit(
            f"Defina {nome}.\n"
            "Supabase → Settings → Database → Connection string → URI (Session mode).\n"
            "Use a senha do banco, não a anon key."
        )
    low = url.lower()
    if not (low.startswith("postgresql://") or low.startswith("postgres://")):
        raise SystemExit(f"{nome} inválida (deve começar com postgresql://)")
    if "[password]" in low or "[senha]" in low or "sua_senha" in low:
        raise SystemExit(f"{nome} ainda contém placeholder de senha.")
    return url


def _listar_tabelas(conn, schema: str) -> list[str]:
    rows = conn.execute(
        """
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = %s AND table_type = 'BASE TABLE'
        ORDER BY table_name
        """,
        (schema,),
    ).fetchall()
    return [r["table_name"] for r in rows]


def _dependencias_fk(conn, schema: str) -> list[tuple[str, str]]:
    rows = conn.execute(
        """
        SELECT tc.table_name AS filho, ccu.table_name AS pai
        FROM information_schema.table_constraints tc
        JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
         AND tc.table_schema = ccu.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = %s
        """,
        (schema,),
    ).fetchall()
    return [(r["filho"], r["pai"]) for r in rows]


def _ordenar_tabelas(tabelas: list[str], edges: list[tuple[str, str]]) -> list[str]:
    """Pais antes dos filhos (ordem segura para INSERT)."""
    conjunto = set(tabelas)
    deps: dict[str, set[str]] = defaultdict(set)
    filhos_de: dict[str, set[str]] = defaultdict(set)
    for filho, pai in edges:
        if filho in conjunto and pai in conjunto and filho != pai:
            deps[filho].add(pai)
            filhos_de[pai].add(filho)
    grau = {t: len(deps.get(t, set())) for t in tabelas}
    fila = deque(sorted(t for t in tabelas if grau[t] == 0))
    ordem: list[str] = []
    while fila:
        t = fila.popleft()
        ordem.append(t)
        for f in sorted(filhos_de.get(t, ())):
            grau[f] -= 1
            if grau[f] == 0:
                fila.append(f)
    for t in tabelas:
        if t not in ordem:
            ordem.append(t)
    return ordem


def _colunas_comuns_entre_tabelas(
    src, dst, schema: str, tabela_origem: str, tabela_destino: str
) -> list[str]:
    def _cols(conn, tabela: str):
        rows = conn.execute(
            """
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = %s AND table_name = %s
            ORDER BY ordinal_position
            """,
            (schema, tabela),
        ).fetchall()
        return [r["column_name"] for r in rows]

    dest_set = set(_cols(dst, tabela_destino))
    return [c for c in _cols(src, tabela_origem) if c in dest_set]


def _colunas_comuns(src, dst, schema: str, tabela: str) -> list[str]:
    return _colunas_comuns_entre_tabelas(src, dst, schema, tabela, tabela)


def _contar(conn, schema: str, tabela: str) -> int:
    row = conn.execute(
        f'SELECT COUNT(*)::bigint AS n FROM "{schema}"."{tabela}"'
    ).fetchone()
    return int(row["n"]) if row else 0


def _desligar_triggers(conn) -> None:
    conn.execute("SET session_replication_role = replica")


def _limpar_destino(conn, schema: str, ordem: list[str]) -> None:
    _desligar_triggers(conn)
    for tabela in reversed(ordem):
        conn.execute(f'TRUNCATE TABLE "{schema}"."{tabela}" CASCADE')


def _tem_coluna_id_serial(conn, schema: str, tabela: str) -> bool:
    row = conn.execute(
        """
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = %s AND table_name = %s AND column_name = 'id'
          AND column_default LIKE 'nextval%%'
        LIMIT 1
        """,
        (schema, tabela),
    ).fetchone()
    return row is not None


def _ajustar_sequence(conn, schema: str, tabela: str) -> None:
    if not _tem_coluna_id_serial(conn, schema, tabela):
        return
    conn.execute(
        f"""
        SELECT setval(
            pg_get_serial_sequence('"{schema}"."{tabela}"', 'id'),
            COALESCE((SELECT MAX(id) FROM "{schema}"."{tabela}"), 1),
            (SELECT MAX(id) IS NOT NULL FROM "{schema}"."{tabela}")
        )
        """
    )


def _tem_coluna(conn, schema: str, tabela: str, coluna: str) -> bool:
    row = conn.execute(
        """
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = %s AND table_name = %s AND column_name = %s
        LIMIT 1
        """,
        (schema, tabela, coluna),
    ).fetchone()
    return row is not None


def _contar_unicos(conn, schema: str, tabela: str, dedupe_on: list[str]) -> int:
    dedupe_sql = ", ".join(f'"{c}"' for c in dedupe_on)
    row = conn.execute(
        f"""
        SELECT COUNT(*)::bigint AS n FROM (
            SELECT DISTINCT {dedupe_sql} FROM "{schema}"."{tabela}"
        ) q
        """
    ).fetchone()
    return int(row["n"]) if row else 0


def _valor_celula(valor):
    if isinstance(valor, (dict, list)):
        return Json(valor)
    return valor


def _copiar_tabela(
    src,
    dst,
    schema: str,
    tabela_origem: str,
    tabela_destino: str,
    cols: list[str],
    *,
    batch: int,
    dry_run: bool,
    dedupe_on: list[str] | None = None,
    dedupe_order_col: str | None = None,
) -> int:
    if not cols:
        return 0
    col_sql = ", ".join(f'"{c}"' for c in cols)
    order_sql = ", ".join(f'"{c}"' for c in cols)
    ph = ", ".join(["%s"] * len(cols))
    insert_sql = (
        f'INSERT INTO "{schema}"."{tabela_destino}" ({col_sql}) VALUES ({ph})'
    )
    if dedupe_on:
        dedupe_sql = ", ".join(f'"{c}"' for c in dedupe_on)
        order_dedupe = dedupe_sql
        if dedupe_order_col:
            order_dedupe += f', "{dedupe_order_col}" DESC'
        base_sql = (
            f'SELECT {col_sql} FROM ('
            f'SELECT DISTINCT ON ({dedupe_sql}) {col_sql} '
            f'FROM "{schema}"."{tabela_origem}" '
            f'ORDER BY {order_dedupe}'
            f') _u ORDER BY {order_sql}'
        )
    else:
        base_sql = (
            f'SELECT {col_sql} FROM "{schema}"."{tabela_origem}" ORDER BY {order_sql}'
        )
    total = 0
    offset = 0
    while True:
        rows = src.execute(
            f'{base_sql} LIMIT %s OFFSET %s',
            (batch, offset),
        ).fetchall()
        if not rows:
            break
        if dry_run:
            total += len(rows)
        else:
            for row in rows:
                dst.execute(insert_sql, [_valor_celula(row[c]) for c in cols])
        offset += batch
    return total


def main() -> None:
    _carregar_env()
    p = argparse.ArgumentParser(
        description="Migrar dados public de um Supabase para outro."
    )
    p.add_argument("--schema", default="public")
    p.add_argument("--batch", type=int, default=500)
    p.add_argument("--dry-run", action="store_true")
    p.add_argument(
        "--sem-limpar",
        action="store_true",
        help="Não truncar tabelas no destino antes de copiar",
    )
    p.add_argument(
        "--tabela",
        action="append",
        dest="tabelas",
        metavar="NOME",
        help="Copiar só estas tabelas (pode repetir)",
    )
    args = p.parse_args()

    schema = (args.schema or "public").strip()
    sslmode = os.environ.get("PGSSLMODE", "require")
    url_origem = _url("DATABASE_URL_ORIGEM")
    url_destino = _url("DATABASE_URL_DESTINO")

    print("Origem :", url_origem.split("@")[-1][:80])
    print("Destino:", url_destino.split("@")[-1][:80])
    if args.dry_run:
        print("Modo dry-run (nenhum dado será gravado no destino).")

    with psycopg.connect(
        url_origem, sslmode=sslmode, row_factory=dict_row
    ) as src, psycopg.connect(
        url_destino, sslmode=sslmode, row_factory=dict_row
    ) as dst:
        src.execute("SET timezone TO 'UTC'")
        dst.execute("SET timezone TO 'UTC'")

        tabelas_src = _listar_tabelas(src, schema)
        tabelas_dst = set(_listar_tabelas(dst, schema))
        if args.tabelas:
            pedidas = [t.strip() for t in args.tabelas if t.strip()]
            tabelas = [t for t in pedidas if t in tabelas_src]
            faltando = [t for t in pedidas if t not in tabelas_src]
            if faltando:
                print("Aviso: tabelas não encontradas na origem:", ", ".join(faltando))
        else:
            tabelas = [
                t
                for t in tabelas_src
                if t not in _IGNORAR_ORIGEM and _destino_de(t) in tabelas_dst
            ]
            ignoradas = [t for t in tabelas_src if t in _IGNORAR_ORIGEM]
            if ignoradas:
                print("Ignorando tabelas legadas na origem:", ", ".join(sorted(ignoradas)))
            sem_par = [
                t
                for t in tabelas_src
                if t not in _IGNORAR_ORIGEM and _destino_de(t) not in tabelas_dst
            ]
            if sem_par:
                print(
                    "\nERRO: estas tabelas existem na origem mas NÃO no destino.\n"
                    "Crie a estrutura no Sistema WMS antes (schema + migrations):\n  - "
                    + "\n  - ".join(
                        f"{t} → {_destino_de(t)}" if t in _ALIASES_TABELA else t
                        for t in sem_par[:20]
                    )
                )
                if len(sem_par) > 20:
                    print(f"  ... e mais {len(sem_par) - 20}")
                sys.exit(1)

        # FKs: usar nome da tabela no destino para ordenação
        edges_raw = _dependencias_fk(src, schema)
        edges = [
            (_destino_de(filho), _destino_de(pai))
            for filho, pai in edges_raw
            if filho in tabelas or _destino_de(filho) in {_destino_de(t) for t in tabelas}
        ]
        nomes_destino = sorted({_destino_de(t) for t in tabelas})
        ordem_destino = _ordenar_tabelas(nomes_destino, edges)
        # um par origem→destino por tabela destino (primeira origem que mapeia)
        origem_por_destino: dict[str, str] = {}
        for t in tabelas:
            d = _destino_de(t)
            origem_por_destino.setdefault(d, t)
        ordem = [(origem_por_destino[d], d) for d in ordem_destino]

        sem_destino = [t for t in tabelas if _destino_de(t) not in tabelas_dst]
        if sem_destino:
            print(
                "\nERRO: destino ausente para:\n  - "
                + "\n  - ".join(f"{t} → {_destino_de(t)}" for t in sem_destino[:20])
            )
            sys.exit(1)

        if not args.sem_limpar and not args.dry_run:
            print(f"\nLimpando {len(ordem_destino)} tabela(s) no destino…")
            _limpar_destino(dst, schema, ordem_destino)
            dst.commit()

        print(f"\nCopiando {len(ordem)} tabela(s)…\n")
        resumo: list[tuple[str, int, int]] = []

        for tabela_origem, tabela_destino in ordem:
            label = (
                f"{tabela_origem} → {tabela_destino}"
                if tabela_origem != tabela_destino
                else tabela_origem
            )
            cols = _colunas_comuns_entre_tabelas(
                src, dst, schema, tabela_origem, tabela_destino
            )
            if not cols:
                print(f"  {label}: sem colunas em comum (pulando)")
                continue
            n_origem = _contar(src, schema, tabela_origem)
            if n_origem == 0:
                print(f"  {label}: vazia na origem")
                resumo.append((label, 0, 0))
                continue
            cols_src = [
                r["column_name"]
                for r in src.execute(
                    """
                    SELECT column_name FROM information_schema.columns
                    WHERE table_schema = %s AND table_name = %s
                    ORDER BY ordinal_position
                    """,
                    (schema, tabela_origem),
                ).fetchall()
            ]
            faltantes = set(cols_src) - set(cols)
            if faltantes:
                print(
                    f"  {label}: colunas só na origem (ignoradas): "
                    f"{', '.join(sorted(faltantes))}"
                )
            dedupe_on = None
            dedupe_order_col = None
            if tabela_destino == "romaneio_por_item" and _tem_coluna(
                src, schema, tabela_origem, "id"
            ):
                dedupe_on = ["dataset_id", "row_index"]
                dedupe_order_col = "id"
            n_origem_bruto = n_origem
            if dedupe_on:
                n_origem = _contar_unicos(src, schema, tabela_origem, dedupe_on)
                if n_origem != n_origem_bruto:
                    print(
                        f"  {label}: origem tinha {n_origem_bruto} linhas, "
                        f"{n_origem} únicas por (dataset_id, row_index)"
                    )
            n_copiadas = _copiar_tabela(
                src,
                dst,
                schema,
                tabela_origem,
                tabela_destino,
                cols,
                batch=args.batch,
                dry_run=args.dry_run,
                dedupe_on=dedupe_on,
                dedupe_order_col=dedupe_order_col,
            )
            if not args.dry_run:
                _ajustar_sequence(dst, schema, tabela_destino)
                dst.commit()
            n_destino = (
                _contar(dst, schema, tabela_destino) if not args.dry_run else n_copiadas
            )
            ok = "OK" if n_origem == n_destino or args.dry_run else "DIVERGENTE"
            print(f"  {label}: origem={n_origem} destino={n_destino} [{ok}]")
            resumo.append((label, n_origem, n_destino))

        print("\n--- Resumo ---")
        total_o = sum(r[1] for r in resumo)
        total_d = sum(r[2] for r in resumo)
        print(f"Tabelas: {len(resumo)} | Linhas origem: {total_o} | Linhas destino: {total_d}")
        divergentes = [r[0] for r in resumo if r[1] != r[2]]
        if divergentes and not args.dry_run:
            print("Atenção — contagem diferente:", ", ".join(divergentes))
            sys.exit(2)
        if args.dry_run:
            print("Dry-run concluído. Rode sem --dry-run para gravar.")
        else:
            print("Migração concluída.")
            print("\nPróximo passo: atualize DATABASE_URL no Render para o destino e reinicie o serviço.")


if __name__ == "__main__":
    main()
