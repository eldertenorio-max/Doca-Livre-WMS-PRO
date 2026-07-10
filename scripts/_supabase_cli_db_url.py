#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Obtém URL Postgres temporária do projeto linkado via Supabase CLI."""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
from urllib.parse import quote


def _raiz() -> str:
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _supabase_bin() -> str:
    for name in ("supabase.cmd", "supabase"):
        path = shutil.which(name)
        if path:
            return path
    raise RuntimeError("Supabase CLI não encontrado. Instale: npm install -g supabase")


def cli_db_url(*, data_only: bool = False) -> str:
    cmd = [_supabase_bin(), "db", "dump", "--linked", "--dry-run"]
    if data_only:
        cmd.append("--data-only")
    proc = subprocess.run(
        cmd,
        cwd=_raiz(),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    out = (proc.stdout or "") + (proc.stderr or "")
    if proc.returncode not in (0, -1) and "PGHOST" not in out:
        raise RuntimeError(f"supabase db dump falhou:\n{out[:2000]}")

    env: dict[str, str] = {}
    for key in ("PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE"):
        m = re.search(rf'export {key}="([^"]*)"', out)
        if m:
            env[key] = m.group(1)
    missing = [k for k in ("PGHOST", "PGUSER", "PGPASSWORD") if k not in env]
    if missing:
        raise RuntimeError(
            "Não foi possível ler credenciais do CLI. "
            f"Faltando: {', '.join(missing)}. Rode: supabase link --project-ref SEU_REF"
        )
    port = env.get("PGPORT", "5432")
    user = quote(env["PGUSER"], safe="")
    password = quote(env["PGPASSWORD"], safe="")
    host = env["PGHOST"]
    db = env.get("PGDATABASE", "postgres")
    return f"postgresql://{user}:{password}@{host}:{port}/{db}"


if __name__ == "__main__":
    try:
        print(cli_db_url())
    except Exception as exc:
        print(f"Erro: {exc}", file=sys.stderr)
        sys.exit(1)
