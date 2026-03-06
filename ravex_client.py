# -*- coding: utf-8 -*-
"""
Cliente da API Ravex para Controle de Carregamento.
Usa apenas GET (exceto POST de autenticação).
Credenciais: RAVEX_BASE_URL, RAVEX_USER, RAVEX_PASSWORD (variáveis de ambiente).
"""
import os

try:
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
except Exception:
    pass

RAVEX_BASE_URL = (os.environ.get("RAVEX_BASE_URL") or "https://api.rest.app.ravex.com.br").rstrip("/")
RAVEX_USER = (os.environ.get("RAVEX_USER") or "").strip()
RAVEX_PASSWORD = (os.environ.get("RAVEX_PASSWORD") or "").strip().strip('"').strip("'")


def get_token():
    """Obtém token de acesso (POST /usuario/autenticar)."""
    try:
        import requests
    except ImportError:
        raise RuntimeError("Instale: pip install requests")
    if not RAVEX_USER or not RAVEX_PASSWORD:
        raise ValueError("Defina RAVEX_USER e RAVEX_PASSWORD nas variáveis de ambiente.")
    url = f"{RAVEX_BASE_URL}/usuario/autenticar"
    r = requests.post(
        url,
        data={"grant_type": "password", "username": RAVEX_USER, "password": RAVEX_PASSWORD},
        timeout=30,
        verify=False,
    )
    if r.status_code != 200:
        raise RuntimeError("API Ravex autenticação falhou (HTTP %s): %s" % (r.status_code, (r.text or "")[:200]))
    data = r.json()
    token = data.get("access_token")
    if not token:
        raise RuntimeError("Resposta Ravex sem access_token")
    return token


def _headers(token):
    return {
        "Authorization": "Bearer %s" % token,
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


def _get(url, token, timeout=30):
    try:
        import requests
        r = requests.get(url, headers=_headers(token), timeout=timeout, verify=False)
        if r.status_code != 200:
            return None
        data = r.json()
        if not data.get("success"):
            return None
        return data.get("data")
    except Exception:
        return None


def obter_roteiro_por_id(token, roteiro_id):
    """GET /api/roteiro/{id}. Retorna roteiro com viagemFaturada (id da viagem)."""
    if roteiro_id is None or (isinstance(roteiro_id, (int, float)) and int(roteiro_id) <= 0):
        return None
    try:
        rid = int(roteiro_id)
    except (TypeError, ValueError):
        return None
    return _get(f"{RAVEX_BASE_URL}/api/roteiro/{rid}", token, 20)


def obter_viagem_por_id(token, viagem_id):
    """GET /api/viagem-faturada/{id}. Retorna viagem completa."""
    if viagem_id is None or (isinstance(viagem_id, (int, float)) and int(viagem_id) <= 0):
        return None
    try:
        vid = int(viagem_id)
    except (TypeError, ValueError):
        return None
    return _get(f"{RAVEX_BASE_URL}/api/viagem-faturada/{vid}", token, 30)


def obter_notas_fiscais_viagem(token, viagem_id):
    """GET /api/viagem-faturada/{viagemId}/notas-fiscais."""
    url = f"{RAVEX_BASE_URL}/api/viagem-faturada/{viagem_id}/notas-fiscais"
    raw = _get(url, token, 30)
    if isinstance(raw, list):
        return raw
    if isinstance(raw, dict):
        return raw.get("notasFiscais") or raw.get("items") or raw.get("notas") or []
    return []


def obter_itens_nota_fiscal(token, viagem_id, nota_fiscal_id):
    """GET /api/viagem-faturada/{viagemId}/notas-fiscais/{notaFiscalId}/itens."""
    url = f"{RAVEX_BASE_URL}/api/viagem-faturada/{viagem_id}/notas-fiscais/{nota_fiscal_id}/itens"
    raw = _get(url, token, 30)
    return raw if isinstance(raw, list) else []


def obter_canhotos_viagem(token, viagem_id):
    """GET /api/viagem-faturada/{viagemId}/canhotos-v2. Retorna (entregas, metadata)."""
    url = f"{RAVEX_BASE_URL}/api/viagem-faturada/{viagem_id}/canhotos-v2"
    raw = _get(url, token, 30)
    if not isinstance(raw, dict):
        return [], {}
    entregas = raw.get("entregas", raw.get("canhotos", [])) or []
    meta = {
        "motoristaNome": raw.get("motoristaNome", raw.get("motorista_nome", "")) or "",
        "veiculo": raw.get("veiculo", raw.get("veículo", "")) or "",
    }
    return entregas, meta


def obter_ponto_referencia(token, referencia_id):
    """GET /api/ponto-referencia/{id}. Para preencher cliente/endereço."""
    if referencia_id is None or (isinstance(referencia_id, (int, float)) and int(referencia_id) <= 0):
        return None
    try:
        ref_id = int(referencia_id)
    except (TypeError, ValueError):
        return None
    return _get(f"{RAVEX_BASE_URL}/api/ponto-referencia/{ref_id}", token, 15)
