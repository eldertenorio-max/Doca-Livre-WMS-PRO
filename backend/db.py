import os

import psycopg
from psycopg.rows import dict_row


def get_database_url() -> str:
    url = (os.environ.get("DATABASE_URL") or "").strip()
    if not url:
        raise RuntimeError("DATABASE_URL não configurada")
    return url


def get_conn():
    # Supabase Postgres exige SSL na maioria dos projetos
    # (se a URL já tem sslmode=require, isso também funciona)
    return psycopg.connect(
        get_database_url(),
        sslmode=os.environ.get("PGSSLMODE", "require"),
        row_factory=dict_row,
    )

