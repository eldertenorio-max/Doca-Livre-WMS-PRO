"""Cadastro / troca de senha do portal com confirmação por código no e-mail."""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import re
import secrets
import time
from typing import Any, Callable

from werkzeug.security import generate_password_hash

OTP_TTL_SEC = 15 * 60
OTP_RESEND_COOLDOWN_SEC = 60
VERIFY_TOKEN_TTL_SEC = 30 * 60
OTP_LEN = 6

_EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')


def normalize_email(raw: str) -> str:
    return (raw or '').strip().lower()


def email_valido(email: str) -> bool:
    return bool(email) and bool(_EMAIL_RE.match(email)) and len(email) <= 254


def _otp_secret() -> str:
    return (os.environ.get('SSO_SECRET') or os.environ.get('SECRET_KEY') or 'ultrapao-secret-key-2024').strip()


def _b64url_encode(raw: bytes) -> str:
    import base64

    return base64.urlsafe_b64encode(raw).decode('ascii').rstrip('=')


def _b64url_decode(text: str) -> bytes:
    import base64

    pad = '=' * (-len(text) % 4)
    return base64.urlsafe_b64decode((text + pad).encode('ascii'))


def hash_codigo(codigo: str) -> str:
    return hashlib.sha256(f'{_otp_secret()}:{codigo.strip()}'.encode('utf-8')).hexdigest()


def gerar_codigo() -> str:
    return f'{secrets.randbelow(10 ** OTP_LEN):0{OTP_LEN}d}'


def issue_verify_token(*, finalidade: str, email: str) -> str:
    payload = {
        'p': finalidade,
        'e': normalize_email(email),
        'exp': int(time.time()) + VERIFY_TOKEN_TTL_SEC,
        'jti': secrets.token_hex(8),
    }
    body = _b64url_encode(json.dumps(payload, separators=(',', ':')).encode('utf-8'))
    sig = _b64url_encode(hmac.new(_otp_secret().encode('utf-8'), body.encode('ascii'), hashlib.sha256).digest())
    return f'{body}.{sig}'


def verify_token_payload(token: str, *, finalidade: str) -> dict[str, Any]:
    token = (token or '').strip()
    if '.' not in token:
        raise ValueError('Token inválido.')
    body, sig = token.rsplit('.', 1)
    expected = _b64url_encode(hmac.new(_otp_secret().encode('utf-8'), body.encode('ascii'), hashlib.sha256).digest())
    if not hmac.compare_digest(expected, sig):
        raise ValueError('Token inválido.')
    try:
        payload = json.loads(_b64url_decode(body).decode('utf-8'))
    except Exception as exc:
        raise ValueError('Token inválido.') from exc
    if payload.get('p') != finalidade:
        raise ValueError('Token inválido para esta operação.')
    if int(payload.get('exp') or 0) < int(time.time()):
        raise ValueError('Token expirado. Peça um novo código.')
    email = normalize_email(str(payload.get('e') or ''))
    if not email_valido(email):
        raise ValueError('Token inválido.')
    return {'email': email, 'finalidade': finalidade}


def ensure_portal_auth_schema(conn) -> None:
    kind = getattr(conn, 'kind', 'sqlite')
    if kind == 'pg':
        try:
            conn.execute('ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS email TEXT')
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass
        conn.execute(
            '''CREATE TABLE IF NOT EXISTS public.portal_email_codigos (
                id BIGSERIAL PRIMARY KEY,
                finalidade TEXT NOT NULL,
                email TEXT NOT NULL,
                codigo_hash TEXT NOT NULL,
                expira_em TIMESTAMPTZ NOT NULL,
                usado BOOLEAN NOT NULL DEFAULT FALSE,
                criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )'''
        )
        conn.execute(
            'CREATE INDEX IF NOT EXISTS idx_portal_email_codigos_email ON public.portal_email_codigos (email, finalidade, criado_em DESC)'
        )
        try:
            conn.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_email_unique ON public.usuarios (lower(email)) WHERE email IS NOT NULL AND email <> ''"
            )
        except Exception:
            try:
                conn.rollback()
            except Exception:
                pass
        return

    try:
        conn.execute('ALTER TABLE usuarios ADD COLUMN email TEXT')
        conn.commit()
    except Exception:
        pass
    conn.execute(
        '''CREATE TABLE IF NOT EXISTS portal_email_codigos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            finalidade TEXT NOT NULL,
            email TEXT NOT NULL,
            codigo_hash TEXT NOT NULL,
            expira_em TEXT NOT NULL,
            usado INTEGER NOT NULL DEFAULT 0,
            criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )'''
    )
    try:
        conn.commit()
    except Exception:
        pass


def _agora_iso() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).isoformat()


def _expira_iso(ttl: int = OTP_TTL_SEC) -> str:
    from datetime import datetime, timedelta, timezone

    return (datetime.now(timezone.utc) + timedelta(seconds=ttl)).isoformat()


def cooldown_ok(conn, email: str, finalidade: str) -> bool:
    kind = getattr(conn, 'kind', 'sqlite')
    if kind == 'pg':
        row = conn.execute(
            '''SELECT criado_em FROM public.portal_email_codigos
               WHERE email = ? AND finalidade = ?
               ORDER BY criado_em DESC LIMIT 1''',
            (email, finalidade),
        ).fetchone()
    else:
        row = conn.execute(
            '''SELECT criado_em FROM portal_email_codigos
               WHERE email = ? AND finalidade = ?
               ORDER BY criado_em DESC LIMIT 1''',
            (email, finalidade),
        ).fetchone()
    if not row:
        return True
    criado = row['criado_em'] if hasattr(row, 'keys') else row[0]
    try:
        from datetime import datetime

        if isinstance(criado, str):
            criado_dt = datetime.fromisoformat(criado.replace('Z', '+00:00'))
        else:
            criado_dt = criado
        age = time.time() - criado_dt.timestamp()
        return age >= OTP_RESEND_COOLDOWN_SEC
    except Exception:
        return True


def salvar_codigo(conn, *, finalidade: str, email: str, codigo: str) -> None:
    email = normalize_email(email)
    kind = getattr(conn, 'kind', 'sqlite')
    tbl = 'public.portal_email_codigos' if kind == 'pg' else 'portal_email_codigos'
    if kind == 'pg':
        conn.execute(
            f'UPDATE {tbl} SET usado = TRUE WHERE email = ? AND finalidade = ? AND usado = FALSE',
            (email, finalidade),
        )
    else:
        conn.execute(
            f'UPDATE {tbl} SET usado = 1 WHERE email = ? AND finalidade = ? AND usado = 0',
            (email, finalidade),
        )
    conn.execute(
        f'''INSERT INTO {tbl} (finalidade, email, codigo_hash, expira_em, usado)
            VALUES (?, ?, ?, ?, ?)''',
        (finalidade, email, hash_codigo(codigo), _expira_iso(), False if kind == 'pg' else 0),
    )
    conn.commit()


def consumir_codigo(conn, *, finalidade: str, email: str, codigo: str) -> bool:
    email = normalize_email(email)
    codigo = (codigo or '').strip()
    if not codigo.isdigit() or len(codigo) != OTP_LEN:
        return False
    kind = getattr(conn, 'kind', 'sqlite')
    tbl = 'public.portal_email_codigos' if kind == 'pg' else 'portal_email_codigos'
    usado_false = 'FALSE' if kind == 'pg' else '0'
    row = conn.execute(
        f'''SELECT id, codigo_hash, expira_em FROM {tbl}
            WHERE email = ? AND finalidade = ? AND usado = {usado_false}
            ORDER BY criado_em DESC LIMIT 1''',
        (email, finalidade),
    ).fetchone()
    if not row:
        return False
    expira = row['expira_em']
    try:
        from datetime import datetime, timezone

        if isinstance(expira, str):
            expira_dt = datetime.fromisoformat(expira.replace('Z', '+00:00'))
        else:
            expira_dt = expira
        if expira_dt.tzinfo is None:
            from datetime import timezone as tz

            expira_dt = expira_dt.replace(tzinfo=tz.utc)
        if expira_dt.timestamp() < time.time():
            return False
    except Exception:
        return False
    if not hmac.compare_digest(str(row['codigo_hash']), hash_codigo(codigo)):
        return False
    if kind == 'pg':
        conn.execute(f'UPDATE {tbl} SET usado = TRUE WHERE id = ?', (row['id'],))
    else:
        conn.execute(f'UPDATE {tbl} SET usado = 1 WHERE id = ?', (row['id'],))
    conn.commit()
    return True


def otp_debug_enabled() -> bool:
    """Só com PORTAL_OTP_DEBUG=1 (NUNCA mostrar OTP na tela em produção)."""
    return str(os.environ.get('PORTAL_OTP_DEBUG') or '').strip().lower() in ('1', 'true', 'yes')


def enviar_codigo_email(
    send_email: Callable[..., tuple[bool, str]],
    *,
    email: str,
    codigo: str,
    finalidade: str,
) -> tuple[bool, str]:
    if finalidade == 'cadastro':
        assunto = 'Doca Livre — código de confirmação de e-mail'
        acao = 'confirmar seu e-mail e concluir o cadastro'
    else:
        # Assunto próximo ao de cadastro (mesma entregabilidade); corpo deixa a finalidade clara.
        assunto = 'Doca Livre — código para trocar a senha'
        acao = 'redefinir sua senha no portal'
    corpo = (
        f'Seu código Doca Livre é: {codigo}\n\n'
        f'Use este código para {acao}.\n'
        f'Ele vale por {OTP_TTL_SEC // 60} minutos.\n\n'
        'Se você não solicitou, ignore este e-mail.'
    )
    html = (
        f'<p>Seu código Doca Livre é:</p>'
        f'<p style="font-size:28px;font-weight:700;letter-spacing:4px">{codigo}</p>'
        f'<p>Use este código para {acao}. Vale por {OTP_TTL_SEC // 60} minutos.</p>'
        f'<p style="color:#64748b;font-size:13px">Se você não solicitou, ignore este e-mail.</p>'
    )
    return send_email([email], assunto, corpo, html)


def hash_senha(senha: str) -> str:
    return generate_password_hash(senha, method='pbkdf2:sha256')
