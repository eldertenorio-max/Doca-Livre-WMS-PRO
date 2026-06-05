#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Compara tabelas do schema public entre Supabase antigo e novo.

Uso (PowerShell, na raiz do projeto):

  pip install psycopg[binary] python-dotenv

  $env:DATABASE_URL_ORIGEM = "postgresql://..."   # CONTROLE DE CARREGAMENTO
  $env:DATABASE_URL_DESTINO = "postgresql://..."  # Sistema WMS
  $env:PGSSLMODE = "require"
  python scripts/comparar_tabelas_supabase.py
"""
from __future__ import annotations

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

_ALIASES = {"conjuntos_de_dados_excel": "excel_datasets"}
_IGNORAR = frozenset({"excel_placas", "excel_colaboradores", "roteiros"})


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
            "Supabase → Settings → Database → Connection string → URI (Session, porta 5432)."
        )
    return url


def _listar(conn, schema: str) -> list[str]:
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


def _normalizar(nome: str) -> str:
    return _ALIASES.get(nome, nome)


def main() -> None:
    _carregar_env()
    schema = "public"
    sslmode = os.environ.get("PGSSLMODE", "require")

    with psycopg.connect(
        _url("DATABASE_URL_ORIGEM"), sslmode=sslmode, row_factory=dict_row
    ) as origem, psycopg.connect(
        _url("DATABASE_URL_DESTINO"), sslmode=sslmode, row_factory=dict_row
    ) as destino:
        tab_origem = _listar(origem, schema)
        tab_destino = _listar(destino, schema)

    norm_origem = {_normalizar(t): t for t in tab_origem if t not in _IGNORAR}
    norm_destino = {_normalizar(t): t for t in tab_destino if t not in _IGNORAR}

    so_origem = sorted(set(norm_origem) - set(norm_destino))
    so_destino = sorted(set(norm_destino) - set(norm_origem))
    em_ambos = sorted(set(norm_origem) & set(norm_destino))

    print(f"Antigo (origem): {len(tab_origem)} tabelas")
    print(f"Novo (destino):  {len(tab_destino)} tabelas")
    print(f"Equivalentes (ignorando legado e aliases): {len(em_ambos)} em comum\n")

    if em_ambos:
        print(f"{'Tabela':<40} {'Antigo':<28} {'Novo'}")
        print("-" * 90)
        for t in em_ambos:
            o = norm_origem.get(t, "—")
            d = norm_destino.get(t, "—")
            alias = " (rename)" if o != d else ""
            print(f"{t:<40} {o:<28} {d}{alias}")

    if so_origem:
        print(f"\nSó no ANTIGO ({len(so_origem)}):")
        for t in so_origem:
            real = norm_origem[t]
            extra = f"  (nome real: {real})" if real != t else ""
            print(f"  - {t}{extra}")

    if so_destino:
        print(f"\nSó no NOVO ({len(so_destino)}):")
        for t in so_destino:
            real = norm_destino[t]
            extra = f"  (nome real: {real})" if real != t else ""
            print(f"  - {t}{extra}")

    if not so_origem and not so_destino:
        print("\nEstrutura equivalente — mesmas tabelas nos dois projetos.")
    else:
        print("\nEstrutura DIFERENTE — ajuste o novo antes de migrar os dados.")


if __name__ == "__main__":
    main()
