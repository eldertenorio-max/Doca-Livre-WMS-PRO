"""SSO entre portal WMS Pro e sistemas Light / Plus (token HMAC curto)."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import threading
import time
import uuid
from typing import Any
from urllib.parse import urlencode, urlparse, urlunparse, parse_qsl

SSO_SYSTEMS = ('light', 'plus')
SSO_TOKEN_TTL_SEC = 60
_DEFAULT_URLS = {
    'light': 'https://doca-livre-wms-light.onrender.com/',
    'plus': 'https://wms.docalivre.com.br/',
}

_used_jti_lock = threading.Lock()
_used_jti: dict[str, float] = {}


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode('ascii').rstrip('=')


def _b64url_decode(text: str) -> bytes:
    pad = '=' * (-len(text) % 4)
    return base64.urlsafe_b64decode((text + pad).encode('ascii'))


def sso_secret() -> str:
    secret = (os.environ.get('SSO_SECRET') or '').strip()
    if secret:
        return secret
    # Fallback local / bootstrap — em produção defina SSO_SECRET nos 3 ambientes.
    return (os.environ.get('SECRET_KEY') or 'ultrapao-secret-key-2024').strip()


def system_base_url(system_id: str) -> str | None:
    sid = (system_id or '').strip().lower()
    if sid == 'light':
        return (os.environ.get('SYSTEM_URL_LIGHT') or _DEFAULT_URLS['light']).strip() or None
    if sid == 'plus':
        return (os.environ.get('SYSTEM_URL_PLUS') or _DEFAULT_URLS['plus']).strip() or None
    return None


def _purge_used_jti(now: float | None = None) -> None:
    agora = time.time() if now is None else now
    mortos = [k for k, exp in _used_jti.items() if exp <= agora]
    for k in mortos:
        _used_jti.pop(k, None)


def _mark_jti_used(jti: str, exp: float) -> bool:
    """Retorna False se já usado (replay)."""
    with _used_jti_lock:
        _purge_used_jti()
        if jti in _used_jti:
            return False
        _used_jti[jti] = float(exp) + 5.0
        return True


def issue_token(usuario: str, system_id: str, ttl_sec: int = SSO_TOKEN_TTL_SEC) -> str:
    usuario = (usuario or '').strip()
    system_id = (system_id or '').strip().lower()
    if not usuario:
        raise ValueError('Usuário inválido.')
    if system_id not in SSO_SYSTEMS:
        raise ValueError('Sistema inválido.')
    now = int(time.time())
    payload = {
        'u': usuario,
        's': system_id,
        'exp': now + max(15, int(ttl_sec)),
        'jti': uuid.uuid4().hex,
        'iat': now,
    }
    body = _b64url_encode(json.dumps(payload, separators=(',', ':'), ensure_ascii=False).encode('utf-8'))
    sig = _b64url_encode(
        hmac.new(sso_secret().encode('utf-8'), body.encode('ascii'), hashlib.sha256).digest()
    )
    return f'{body}.{sig}'


def verify_token(token: str, *, expected_system: str | None = None, consume: bool = True) -> dict[str, Any]:
    raw = (token or '').strip()
    if not raw or '.' not in raw:
        raise ValueError('Token inválido.')
    body, _, sig = raw.partition('.')
    if not body or not sig:
        raise ValueError('Token inválido.')
    expected = _b64url_encode(
        hmac.new(sso_secret().encode('utf-8'), body.encode('ascii'), hashlib.sha256).digest()
    )
    if not hmac.compare_digest(expected, sig):
        raise ValueError('Assinatura inválida.')
    try:
        payload = json.loads(_b64url_decode(body).decode('utf-8'))
    except Exception as exc:
        raise ValueError('Payload inválido.') from exc
    if not isinstance(payload, dict):
        raise ValueError('Payload inválido.')
    usuario = str(payload.get('u') or '').strip()
    system_id = str(payload.get('s') or '').strip().lower()
    jti = str(payload.get('jti') or '').strip()
    try:
        exp = float(payload.get('exp') or 0)
    except (TypeError, ValueError) as exc:
        raise ValueError('Expiração inválida.') from exc
    if not usuario or system_id not in SSO_SYSTEMS or not jti:
        raise ValueError('Token incompleto.')
    if expected_system and system_id != expected_system.strip().lower():
        raise ValueError('Token destinado a outro sistema.')
    if time.time() > exp:
        raise ValueError('Token expirado.')
    if consume and not _mark_jti_used(jti, exp):
        raise ValueError('Token já utilizado.')
    return {'usuario': usuario, 'system': system_id, 'exp': exp, 'jti': jti}


def build_sso_redirect_url(system_id: str, token: str) -> str:
    base = system_base_url(system_id)
    if not base:
        raise ValueError('URL do sistema não configurada.')
    parsed = urlparse(base if '://' in base else f'https://{base}')
    # Light/Plus: public/sso/entrar/index.html redireciona para /?sso=
    path = '/sso/entrar/'
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query['token'] = token
    query['sso'] = token
    return urlunparse((
        parsed.scheme or 'https',
        parsed.netloc,
        path,
        '',
        urlencode(query),
        '',
    ))


def portal_system_urls() -> dict[str, str]:
    out = {}
    for sid in SSO_SYSTEMS:
        url = system_base_url(sid)
        if url:
            out[sid] = url.rstrip('/') + '/'
    return out
