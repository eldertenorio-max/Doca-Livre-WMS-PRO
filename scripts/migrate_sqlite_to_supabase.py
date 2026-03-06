import argparse
import os
import sqlite3

import psycopg
from psycopg.rows import dict_row


def default_sqlite_path() -> str:
    appdata = os.environ.get("APPDATA") or ""
    if appdata:
        return os.path.join(appdata, "ControleCarregamentoUltrapao", "controle_carregamento.db")
    # fallback: diretório atual
    return os.path.abspath("controle_carregamento.db")


def pg_url() -> str:
    url = (os.environ.get("DATABASE_URL") or "").strip()
    if not url:
        raise RuntimeError("Defina DATABASE_URL (Supabase) antes de migrar.")
    return url


def fetch_all(conn: sqlite3.Connection, sql: str):
    conn.row_factory = sqlite3.Row
    cur = conn.execute(sql)
    rows = cur.fetchall()
    return [dict(r) for r in rows]


def main():
    p = argparse.ArgumentParser(description="Migrar dados do SQLite local para Supabase (Postgres).")
    p.add_argument("--sqlite", default=default_sqlite_path(), help="Caminho do arquivo .db (SQLite).")
    args = p.parse_args()

    sqlite_path = os.path.abspath(args.sqlite)
    if not os.path.isfile(sqlite_path):
        raise SystemExit(f"SQLite não encontrado em: {sqlite_path}")

    sslmode = os.environ.get("PGSSLMODE", "require")

    print(f"SQLite: {sqlite_path}")
    print("Conectando no Supabase...")

    with sqlite3.connect(sqlite_path) as sconn, psycopg.connect(
        pg_url(), sslmode=sslmode, row_factory=dict_row
    ) as pconn:
        pconn.execute("set timezone to 'UTC'")

        # Ordem respeitando dependências leves (FK não existem, mas mantemos padrão)
        tables_direct = [
            "usuarios",
            "colaboradores",
            "viagem_placa",
            "viagem_motorista",
            "viagem_responsaveis",
            "divergencia_motivo",
            "romaneio",
            "produtos_bipados",
        ]
        
        # Migrar todas as tabelas
        for t in tables_direct:
            print(f"Migrando {t}...")
            try:
                rows = fetch_all(sconn, f"select * from {t}")
            except Exception as e:
                print(f"- {t}: tabela não existe no SQLite (pulando) - {e}")
                continue
                
            if not rows:
                print(f"- {t}: vazio")
                continue

            cols = list(rows[0].keys())
            col_sql = ", ".join(cols)
            ph = ", ".join(["%s"] * len(cols))
            insert_sql = f"insert into public.{t} ({col_sql}) values ({ph}) on conflict do nothing"

            for r in rows:
                pconn.execute(insert_sql, [r.get(c) for c in cols])

        # Ajustar sequences para tabelas com id bigserial
        for t in ("usuarios", "romaneio", "produtos_bipados"):
            pconn.execute(
                f"""
                select setval(
                    pg_get_serial_sequence('public.{t}','id'),
                    coalesce((select max(id) from public.{t}), 1)
                )
                """
            )

        pconn.commit()
        print("Migração concluída.")


if __name__ == "__main__":
    main()

