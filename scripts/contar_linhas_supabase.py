#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Lista quantas linhas tem cada tabela do Supabase (schema public).

Uso (PowerShell, na raiz do projeto):
  pip install psycopg[binary] python-dotenv
  $env:DATABASE_URL = "postgresql://..."
  $env:PGSSLMODE = "require"
  python scripts/contar_linhas_supabase.py

Ou crie .env na raiz com DATABASE_URL e PGSSLMODE=require
"""
from __future__ import annotations

import argparse
import os
import sys

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


def _raiz_projeto() -> str:
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _carregar_env() -> None:
    if not load_dotenv:
        return
    load_dotenv(os.path.join(_raiz_projeto(), ".env"))


def _database_url() -> str:
    url = (os.environ.get("DATABASE_URL") or "").strip()
    if not url:
        env_path = os.path.join(_raiz_projeto(), ".env")
        raise SystemExit(
            "DATABASE_URL não definida.\n\n"
            "1) Supabase → Settings → Database → Connection string → URI\n"
            "2) PowerShell (cole a URL REAL, não o texto de exemplo):\n"
            '   $env:DATABASE_URL = "postgresql://postgres.xxxxx:SUA_SENHA@....supabase.com:5432/postgres"\n'
            "   $env:PGSSLMODE = \"require\"\n"
            "   python scripts/contar_linhas_supabase.py\n\n"
            f"Ou crie o arquivo: {env_path}\n"
            "   DATABASE_URL=postgresql://...\n"
            "   PGSSLMODE=require"
        )
    low = url.lower()
    if "sua-url" in low or "sua_senha" in low or "[senha]" in low or "[password]" in low:
        raise SystemExit(
            "DATABASE_URL ainda é o texto de exemplo.\n"
            "Substitua pela URL real do Supabase (com usuário, senha e host)."
        )
    if not (low.startswith("postgresql://") or low.startswith("postgres://")):
        raise SystemExit(
            "DATABASE_URL inválida: deve começar com postgresql://\n"
            f"Valor atual (início): {url[:40]}..."
        )
    return url


def _listar_tabelas(conn, schema: str) -> list[str]:
    rows = conn.execute(
        """
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = %s
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
        """,
        (schema,),
    ).fetchall()
    return [r["table_name"] for r in rows]


def _contar_linhas(conn, schema: str, tabela: str) -> int:
    # identificadores quotados evitam SQL injection e nomes reservados
    sql = f'SELECT COUNT(*)::bigint AS n FROM "{schema}"."{tabela}"'
    row = conn.execute(sql).fetchone()
    return int(row["n"]) if row else 0


def main() -> None:
    _carregar_env()

    p = argparse.ArgumentParser(
        description="Conta linhas de cada tabela no Supabase (Postgres)."
    )
    p.add_argument(
        "--schema",
        default="public",
        help="Schema a listar (padrão: public)",
    )
    p.add_argument(
        "--tabela",
        action="append",
        dest="tabelas",
        metavar="NOME",
        help="Contar só estas tabelas (pode repetir). Sem isso, lista todas do schema.",
    )
    args = p.parse_args()

    schema = (args.schema or "public").strip()
    sslmode = os.environ.get("PGSSLMODE", "require")
    db_url = _database_url()

    print(f"Conectando… (schema: {schema})")
    contagens: list[tuple[str, int]] = []

    with psycopg.connect(db_url, sslmode=sslmode, row_factory=dict_row) as conn:
        tabelas = args.tabelas or _listar_tabelas(conn, schema)
        if not tabelas:
            print(f"Nenhuma tabela encontrada em {schema}.")
            return

        for nome in tabelas:
            try:
                n = _contar_linhas(conn, schema, nome)
                contagens.append((nome, n))
            except Exception as e:
                contagens.append((nome, -1))
                print(f"  [erro] {nome}: {e}", file=sys.stderr)

    # tabela formatada
    col_nome = max(len("Tabela"), max(len(t) for t, _ in contagens))
    col_nome = min(col_nome, 48)
    print()
    print(f"{'Tabela':<{col_nome}}  {'Linhas':>12}")
    print("-" * (col_nome + 15))

    total = 0
    for nome, n in contagens:
        if n >= 0:
            total += n
            linhas = f"{n:,}".replace(",", ".")
        else:
            linhas = "(erro)"
        print(f"{nome:<{col_nome}}  {linhas:>12}")

    print("-" * (col_nome + 15))
    ok = [n for _, n in contagens if n >= 0]
    if len(ok) == len(contagens):
        print(f"{'TOTAL':<{col_nome}}  {sum(ok):,}".replace(",", "."))
    print(f"\n{len(contagens)} tabela(s) em {schema}.")


if __name__ == "__main__":
    main()
