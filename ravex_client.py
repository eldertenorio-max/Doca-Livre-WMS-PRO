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
# RAVEX_USER e RAVEX_PASSWORD lidos dentro de get_token() para pegar o valor atual (importante no Render após deploy)


def _get_ravex_credenciais():
    """Lê credenciais do ambiente na hora da chamada (evita valor vazio quando o app carrega antes das vars no Render)."""
    user = (os.environ.get("RAVEX_USER") or "").strip()
    pwd = (os.environ.get("RAVEX_PASSWORD") or "").strip().strip('"').strip("'")
    return user, pwd


def get_token():
    """Obtém token de acesso (POST /usuario/autenticar). Formato igual ao projeto BASE VIAGENS: form-data, sem headers extras."""
    try:
        import requests
    except ImportError:
        raise RuntimeError("Instale: pip install requests")
    username, password = _get_ravex_credenciais()
    if not username or not password:
        raise ValueError(
            "Defina RAVEX_USER e RAVEX_PASSWORD nas variáveis de ambiente. "
            "No Render: Dashboard do serviço → Environment → Add Environment Variable. Depois clique em Save e aguarde o redeploy."
        )
    url = f"{RAVEX_BASE_URL}/usuario/autenticar"
    password = (password or "").strip().strip('"').strip("'")
    username = (username or "").strip()
    dados = {"grant_type": "password", "username": username, "password": password}
    # Sem headers extras: só form-data (igual BASE VIAGENS / OXXO)
    r = requests.post(url, data=dados, timeout=30, verify=False)
    if r.status_code != 200:
        msg = (r.text or "")[:500]
        try:
            err = r.json()
            if err.get("error") == "invalid_grant" or "incorreto" in (err.get("error_description") or "").lower():
                msg = "E-mail ou senha incorretos. Confira RAVEX_USER e RAVEX_PASSWORD no Render e teste o login no portal da Ravex."
        except Exception:
            pass
        raise RuntimeError("API Ravex autenticação falhou (HTTP %s): %s" % (r.status_code, msg))
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


def _fetch_viagens_janela(token, data_inicio_str, data_fim_str):
    """Busca viagens em uma janela de até 1h (API Ravex limita intervalo). Retorna lista de dicts."""
    try:
        import requests
        url = f"{RAVEX_BASE_URL}/api/viagem-faturada/finalizadas-por-periodo"
        r = requests.get(
            url,
            params={"dataHoraInicio": data_inicio_str, "dataHoraFim": data_fim_str},
            headers=_headers(token),
            timeout=60,
            verify=False,
        )
        if r.status_code != 200:
            return []
        data = r.json()
        if not data.get("success"):
            return []
        raw = data.get("data")
        if isinstance(raw, list):
            return raw
        if isinstance(raw, dict):
            return raw.get("data") or raw.get("items") or raw.get("result") or []
        return []
    except Exception:
        return []


def viagens_finalizadas_por_periodo(token, data_inicio_str, data_fim_str):
    """
    Lista todas as viagens finalizadas no período. A API Ravex exige janelas de no máximo 1h,
    então faz várias requisições e agrega por id (sem duplicar).
    data_inicio_str e data_fim_str no formato ISO (ex: 2026-03-01T00:00:00.000Z).
    """
    try:
        from datetime import datetime, timedelta
    except ImportError:
        return []
    try:
        ini = datetime.strptime(data_inicio_str.replace("Z", "")[:19], "%Y-%m-%dT%H:%M:%S")
        fim = datetime.strptime(data_fim_str.replace("Z", "")[:19], "%Y-%m-%dT%H:%M:%S")
    except Exception:
        return []
    if ini >= fim:
        return []
    delta = timedelta(hours=1)
    todas = []
    ids_vistos = set()
    dt = ini
    while dt < fim:
        dt_prox = min(dt + delta, fim)
        ini_str = dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")
        fim_str = dt_prox.strftime("%Y-%m-%dT%H:%M:%S.000Z")
        chunk = _fetch_viagens_janela(token, ini_str, fim_str)
        for v in chunk or []:
            vid = v.get("id") or v.get("Id")
            if vid is not None:
                k = int(vid) if isinstance(vid, (int, float)) else vid
                if k not in ids_vistos:
                    ids_vistos.add(k)
                    todas.append(v)
        dt = dt_prox
    return todas
