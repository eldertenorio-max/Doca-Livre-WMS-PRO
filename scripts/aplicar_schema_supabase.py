#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Aplica schema.sql + migrations na ordem do guia SUPABASE_HOMOLOG.md.

schema.sql e dividido: tabelas primeiro, views depois de romaneio_por_item.

Uso:
  $env:DATABASE_URL = "postgresql://..."
  $env:PGSSLMODE = "require"
  python scripts/aplicar_schema_supabase.py
"""
from __future__ import annotations

import os
import sys

try:
    import psycopg
except ImportError:
    print("Instale: pip install psycopg[binary]")
    sys.exit(1)

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None  # type: ignore

SCHEMA_VIEWS_MARKER = "-- 7. VIEWS"

SQL_FILES_MIDDLE = [
    "migrate_excel_base_to_base_codigo_barras.sql",
    "create_table_romaneio_por_item.sql",
    "create_table_motoristas.sql",
    "create_table_placas.sql",
    "migrate_roteiros.sql",
    "migrate_identificador_rota.sql",
    "migrate_viagem_periodo_bipagem.sql",
    "migrate_devolucao_nf.sql",
    "migrate_devolucao_nf_status_cancelada.sql",
    "migrate_ravex_importacoes.sql",
    "migrate_ravex_importacoes_sem_fk.sql",
    "migrate_ravex_importacoes_conjuntos.sql",
    "migrate_tabela_geral_dados.sql",
    "create_table_terceiros.sql",
    "migrate_terceiros_motivos_fluxo.sql",
    "migrate_terceiros_consumivel_sp.sql",
    "migrate_terceiros_recebedor_mg.sql",
    "migrate_terceiros_motorista_saida_mg.sql",
    "fix_fn_sync_tabela_geral.sql",
    "create_wms_enderecamento.sql",
    "migrate_wms_produto_planejamento.sql",
    "fix_wms_camara_totais.sql",
]

SQL_FILES_RLS = [
    "enable_rls_policies.sql",
    "migrate_terceiros_rls.sql",
    "migrate_devolucao_nf_rls.sql",
    "migrate_viagem_periodo_bipagem_rls.sql",
    "migrate_tabela_geral_rls.sql",
    "migrate_wms_enderecamento_rls.sql",
    "migrate_wms_palete_controle_rls.sql",
    "migrate_romaneio_por_item_rls.sql",
    "migrate_portal_email_codigos_rls.sql",
    "enable_rls_views.sql",
    "fix_supabase_linter_security.sql",
]


def _raiz() -> str:
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _url() -> str:
    if load_dotenv:
        load_dotenv(os.path.join(_raiz(), ".env"))
    url = (os.environ.get("DATABASE_URL") or "").strip()
    if not url:
        raise SystemExit("Defina DATABASE_URL (destino).")
    return url


def _split_schema(supabase_dir: str) -> tuple[str, str]:
    path = os.path.join(supabase_dir, "schema.sql")
    text = open(path, encoding="utf-8").read()
    idx = text.find(SCHEMA_VIEWS_MARKER)
    if idx == -1:
        return text.strip(), ""
    return text[:idx].strip(), text[idx:].strip()


def _read_sql(supabase_dir: str, nome: str) -> str:
    path = os.path.join(supabase_dir, nome)
    if not os.path.isfile(path):
        return ""
    return open(path, encoding="utf-8").read().strip()


def _executar(conn, rotulo: str, sql: str) -> None:
    if not sql:
        return
    print(f"  -> {rotulo}")
    try:
        conn.execute(sql)
    except Exception as exc:
        msg = str(exc).lower()
        if "already exists" in msg or "já existe" in msg:
            print("     (ja existe - ok)")
            return
        raise


def main() -> None:
    url = _url()
    sslmode = os.environ.get("PGSSLMODE", "require")
    supabase_dir = os.path.join(_raiz(), "supabase")
    schema_base, schema_views = _split_schema(supabase_dir)

    print("Aplicando schema em:", url.split("@")[-1][:80])
    with psycopg.connect(url, sslmode=sslmode, autocommit=True) as conn:
        _executar(conn, "schema.sql (tabelas)", schema_base)
        for nome in SQL_FILES_MIDDLE:
            sql = _read_sql(supabase_dir, nome)
            if not sql:
                print(f"  AVISO: arquivo ausente, pulando: {nome}")
                continue
            _executar(conn, nome, sql)
        _executar(conn, "schema.sql (views)", schema_views)
        for nome in SQL_FILES_RLS:
            sql = _read_sql(supabase_dir, nome)
            if not sql:
                print(f"  AVISO: arquivo ausente, pulando: {nome}")
                continue
            _executar(conn, nome, sql)
    print("Schema aplicado.")


if __name__ == "__main__":
    main()
