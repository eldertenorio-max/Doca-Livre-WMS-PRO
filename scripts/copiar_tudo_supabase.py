#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Copia schema + dados: base antiga (ndfjetskugqsrrmulcyz) -> PRO (wbqyufalamdsgurejvyz).

Le senha de (primeira encontrada):
  - SUPABASE_DB_PASSWORD no .env
  - DATABASE_URL_DESTINO no .env
  - DATABASE_URL_ORIGEM + DATABASE_URL_DESTINO no .env

Uso:
  python scripts/copiar_tudo_supabase.py
"""
from __future__ import annotations

import os
import subprocess
import sys
from urllib.parse import quote, unquote, urlparse

_SCRIPTS = os.path.dirname(os.path.abspath(__file__))
_RAIZ = os.path.dirname(_SCRIPTS)


def _load_env() -> None:
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    load_dotenv(os.path.join(_RAIZ, ".env"))


def _senha_de_url(url: str) -> str | None:
    if not url:
        return None
    try:
        parsed = urlparse(url)
        if parsed.password:
            return unquote(parsed.password)
    except Exception:
        pass
    return None


def _resolver_urls() -> tuple[str, str]:
    _load_env()
    origem = (os.environ.get("DATABASE_URL_ORIGEM") or "").strip()
    destino = (os.environ.get("DATABASE_URL_DESTINO") or "").strip()
    senha = (os.environ.get("SUPABASE_DB_PASSWORD") or "").strip()

    if not senha:
        senha = _senha_de_url(destino) or _senha_de_url(origem) or ""

    if not origem and senha:
        enc = quote(senha, safe="")
        origem = f"postgresql://postgres:{enc}@db.ndfjetskugqsrrmulcyz.supabase.co:5432/postgres"
    if not destino and senha:
        enc = quote(senha, safe="")
        destino = f"postgresql://postgres:{enc}@db.wbqyufalamdsgurejvyz.supabase.co:5432/postgres"

    if not origem or not destino:
        raise SystemExit(
            "Crie .env na raiz com:\n"
            "  SUPABASE_DB_PASSWORD=sua_senha\n"
            "ou DATABASE_URL_ORIGEM e DATABASE_URL_DESTINO completas."
        )
    return origem, destino


def _run(script: str, extra: dict[str, str]) -> None:
    env = {**os.environ, **extra, "PGSSLMODE": "require"}
    proc = subprocess.run(
        [sys.executable, os.path.join(_SCRIPTS, script)],
        cwd=_RAIZ,
        env=env,
    )
    if proc.returncode != 0:
        raise SystemExit(proc.returncode)


def main() -> None:
    origem, destino = _resolver_urls()
    print("Origem :", origem.split("@")[-1])
    print("Destino:", destino.split("@")[-1])

    print("\n=== 1/3 Schema no PRO ===")
    _run("aplicar_schema_supabase.py", {"DATABASE_URL": destino})

    print("\n=== 2/3 Dados origem -> destino ===")
    proc = subprocess.run(
        [sys.executable, os.path.join(_SCRIPTS, "migrar_supabase_para_supabase.py")],
        cwd=_RAIZ,
        env={
            **os.environ,
            "PGSSLMODE": "require",
            "DATABASE_URL_ORIGEM": origem,
            "DATABASE_URL_DESTINO": destino,
        },
    )
    if proc.returncode != 0:
        raise SystemExit(proc.returncode)

    print("\n=== 3/3 Conferencia ===")
    _run("contar_linhas_supabase.py", {"DATABASE_URL": origem})
    print()
    _run("contar_linhas_supabase.py", {"DATABASE_URL": destino})
    print("\nMigracao concluida.")


if __name__ == "__main__":
    main()
