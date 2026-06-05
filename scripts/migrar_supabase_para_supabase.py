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
except ImportError:
    print("Instale: pip install psycopg[binary]")
    sys.exit(1)

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None  # type: ignore


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


def _colunas_comuns(src, dst, schema: str, tabela: str) -> list[str]:
    def _cols(conn):
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

    dest_set = set(_cols(dst))
    return [c for c in _cols(src) if c in dest_set]


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


def _copiar_tabela(
    src,
    dst,
    schema: str,
    tabela: str,
    cols: list[str],
    *,
    batch: int,
    dry_run: bool,
) -> int:
    if not cols:
        return 0
    col_sql = ", ".join(f'"{c}"' for c in cols)
    ph = ", ".join(["%s"] * len(cols))
    insert_sql = f'INSERT INTO "{schema}"."{tabela}" ({col_sql}) VALUES ({ph})'
    total = 0
    offset = 0
    while True:
        rows = src.execute(
            f'SELECT {col_sql} FROM "{schema}"."{tabela}" ORDER BY 1 LIMIT %s OFFSET %s',
            (batch, offset),
        ).fetchall()
        if not rows:
            break
        if dry_run:
            total += len(rows)
        else:
            for row in rows:
                dst.execute(insert_sql, [row[c] for c in cols])
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
            tabelas = tabelas_src

        sem_destino = [t for t in tabelas if t not in tabelas_dst]
        if sem_destino:
            print(
                "\nERRO: estas tabelas existem na origem mas NÃO no destino.\n"
                "Rode supabase/schema.sql e as migrations no projeto NOVO antes:\n  - "
                + "\n  - ".join(sem_destino[:20])
            )
            if len(sem_destino) > 20:
                print(f"  ... e mais {len(sem_destino) - 20}")
            sys.exit(1)

        edges = _dependencias_fk(src, schema)
        ordem = _ordenar_tabelas(tabelas, edges)

        if not args.sem_limpar and not args.dry_run:
            print(f"\nLimpando {len(ordem)} tabela(s) no destino…")
            _limpar_destino(dst, schema, ordem)
            dst.commit()

        print(f"\nCopiando {len(ordem)} tabela(s)…\n")
        resumo: list[tuple[str, int, int]] = []

        for tabela in ordem:
            cols = _colunas_comuns(src, dst, schema, tabela)
            if not cols:
                print(f"  {tabela}: sem colunas em comum (pulando)")
                continue
            n_origem = _contar(src, schema, tabela)
            if n_origem == 0:
                print(f"  {tabela}: vazia na origem")
                resumo.append((tabela, 0, 0))
                continue
            cols_src = [
                r["column_name"]
                for r in src.execute(
                    """
                    SELECT column_name FROM information_schema.columns
                    WHERE table_schema = %s AND table_name = %s
                    ORDER BY ordinal_position
                    """,
                    (schema, tabela),
                ).fetchall()
            ]
            faltantes = set(cols_src) - set(cols)
            if faltantes:
                print(f"  {tabela}: colunas só na origem (ignoradas): {', '.join(sorted(faltantes))}")
            n_copiadas = _copiar_tabela(
                src, dst, schema, tabela, cols, batch=args.batch, dry_run=args.dry_run
            )
            if not args.dry_run:
                _ajustar_sequence(dst, schema, tabela)
                dst.commit()
            n_destino = _contar(dst, schema, tabela) if not args.dry_run else n_copiadas
            ok = "OK" if n_origem == n_destino or args.dry_run else "DIVERGENTE"
            print(f"  {tabela}: origem={n_origem} destino={n_destino} [{ok}]")
            resumo.append((tabela, n_origem, n_destino))

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
