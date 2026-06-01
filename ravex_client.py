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
    """Lê credenciais: primeiro variáveis de ambiente; se vazias, tenta arquivo em RAVEX_CREDENTIALS_FILE (Secret File no Render)."""
    user = (os.environ.get("RAVEX_USER") or os.environ.get("ravex_user") or "").strip()
    pwd = (os.environ.get("RAVEX_PASSWORD") or os.environ.get("ravex_password") or "").strip().strip('"').strip("'")
    if not user or not pwd:
        path = (os.environ.get("RAVEX_CREDENTIALS_FILE") or "").strip()
        if path and os.path.isfile(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    import json
                    data = json.load(f)
                user = (data.get("RAVEX_USER") or data.get("username") or "").strip()
                raw = data.get("RAVEX_PASSWORD") or data.get("password") or ""
                pwd = str(raw).strip().strip('"').strip("'")
            except Exception:
                pass
    return user, pwd


def get_token():
    """Obtém token de acesso (POST /usuario/autenticar). Formato igual ao projeto BASE VIAGENS: form-data, sem headers extras."""
    try:
        import requests
    except ImportError:
        raise RuntimeError("Instale: pip install requests")
    username, password = _get_ravex_credenciais()
    if not username or not password:
        falta = []
        if not username:
            falta.append("RAVEX_USER")
        if not password:
            falta.append("RAVEX_PASSWORD")
        raise ValueError(
            "Variáveis não encontradas: %s. No Render: 1) Confira Environment (chaves exatamente RAVEX_USER e RAVEX_PASSWORD). "
            "2) Clique em 'Save changes' e depois 'Manual Deploy' → 'Clear build cache & deploy'. "
            "3) Teste se o servidor vê as vars: abra no navegador /api/ravex-env-check (deve mostrar ok: true)."
            % ", ".join(falta)
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


def obter_roteiro_por_periodo(token, data_inicial_iso, data_final_iso):
    """
    GET /api/roteiro/obter-roteiro-por-periodo?pDataInicial=<date>&pDataFinal=<date>.
    Aceita datas em YYYY-MM-DD (ex: 2026-03-11, 2026-03-13) ou ISO com hora.
    Retorna lista de roteiros no período; cada um tem id, identificadorRota, viagemFaturada.
    Usado para achar o id do roteiro pela viagem (viagemFaturada.id == id_viagem).
    """
    if not data_inicial_iso or not data_final_iso:
        return []
    try:
        import requests
        url = f"{RAVEX_BASE_URL}/api/roteiro/obter-roteiro-por-periodo"
        r = requests.get(
            url,
            params={"pDataInicial": data_inicial_iso, "pDataFinal": data_final_iso},
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
            out = []
            for item in raw:
                if isinstance(item, dict) and item.get("data") is not None and item.get("viagemFaturada") is None:
                    out.append(item["data"])
                else:
                    out.append(item)
            return out
        if isinstance(raw, dict):
            lst = (
                raw.get("data") or raw.get("items") or raw.get("result") or raw.get("itens")
                or raw.get("content") or raw.get("lista") or raw.get("roteiros") or []
            )
            if isinstance(lst, list):
                return lst
        # Algumas APIs devolvem a lista em data.items ou no primeiro nível
        if isinstance(data.get("items"), list):
            return data.get("items")
        if isinstance(data.get("result"), list):
            return data.get("result")
        if isinstance(data.get("roteiros"), list):
            return data.get("roteiros")
        if isinstance(data.get("content"), list):
            return data.get("content")
        return []
    except Exception:
        return []


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


def obter_canhotos_viagem(token, viagem_id, enriquecer=True):
    """
    GET /api/viagem-faturada/{viagemId}/canhotos-v2.
    Enriquece com canhotos-v3 e canhotos (v1) quando faltar tipoVeiculo ou ajudantes (igual BASE VIAGENS).
    Com enriquecer=False, usa só canhotos-v2 (mais rápido para importação de romaneio).
    Retorna (entregas, metadata).
    """
    url = f"{RAVEX_BASE_URL}/api/viagem-faturada/{viagem_id}/canhotos-v2"
    raw = _get(url, token, 30)
    if not isinstance(raw, dict):
        return [], {}
    entregas = raw.get("entregas", raw.get("canhotos", [])) or []
    if isinstance(raw.get("data"), list):
        entregas = raw.get("data") or entregas
    meta = {
        "motoristaNome": raw.get("motoristaNome", raw.get("motorista_nome", "")) or "",
        "veiculo": raw.get("veiculo", raw.get("veículo", "")) or "",
        "transportadoraNome": raw.get("transportadoraNome", raw.get("transportadora_nome", "")) or "",
        "tipoVeiculo": raw.get("tipoVeiculo", raw.get("tipo_veiculo")),
        "primeiroAjudante": raw.get("primeiroAjudante", raw.get("primeiro_ajudante", "")) or "",
        "segundoAjudante": raw.get("segundoAjudante", raw.get("segundo_ajudante", "")) or "",
    }
    # Enriquecer com canhotos-v3 se v2 não trouxe tipo/ajudantes
    if enriquecer and (not meta.get("tipoVeiculo") or not meta.get("primeiroAjudante") or not meta.get("segundoAjudante")):
        try:
            import requests
            r3 = requests.get(
                f"{RAVEX_BASE_URL}/api/viagem-faturada/{viagem_id}/canhotos-v3",
                headers=_headers(token), timeout=20, verify=False
            )
            if r3.status_code == 200:
                d3 = r3.json()
                if d3.get("success") and isinstance(d3.get("data"), list) and d3["data"]:
                    c3 = d3["data"][0]
                    if not meta.get("tipoVeiculo"):
                        tv = c3.get("tipoVeiculo") or c3.get("tipo_veiculo")
                        if tv is not None:
                            meta["tipoVeiculo"] = tv
                    if not meta.get("primeiroAjudante"):
                        pa = c3.get("primeiroAjudante") or c3.get("primeiro_ajudante") or c3.get("ajudante1")
                        if pa:
                            meta["primeiroAjudante"] = pa
                    if not meta.get("segundoAjudante"):
                        sa = c3.get("segundoAjudante") or c3.get("segundo_ajudante") or c3.get("ajudante2")
                        if sa:
                            meta["segundoAjudante"] = sa
        except Exception:
            pass
    if enriquecer and (not meta.get("primeiroAjudante") or not meta.get("segundoAjudante")):
        try:
            import requests
            r1 = requests.get(
                f"{RAVEX_BASE_URL}/api/viagem-faturada/{viagem_id}/canhotos",
                headers=_headers(token), timeout=20, verify=False
            )
            if r1.status_code == 200:
                d1 = r1.json()
                if d1.get("success") and isinstance(d1.get("data"), list) and d1["data"]:
                    c1 = d1["data"][0] if isinstance(d1["data"][0], dict) else {}
                    if not meta.get("primeiroAjudante"):
                        pa = c1.get("primeiroAjudante") or c1.get("primeiro_ajudante") or c1.get("ajudante1") or c1.get("ajudanteNome")
                        if pa:
                            meta["primeiroAjudante"] = pa
                    if not meta.get("segundoAjudante"):
                        sa = c1.get("segundoAjudante") or c1.get("segundo_ajudante") or c1.get("ajudante2")
                        if sa:
                            meta["segundoAjudante"] = sa
        except Exception:
            pass
    return entregas, meta


def obter_pedido_por_id(token, pedido_id):
    """GET /api/pedido/{id}. Retorna pedido completo (roteiroId, roteiro, etc.). Usado para obter id_roteiro quando a viagem não traz."""
    if pedido_id is None or (isinstance(pedido_id, (int, float)) and int(pedido_id) <= 0):
        return None
    try:
        pid = int(pedido_id)
    except (TypeError, ValueError):
        return None
    return _get(f"{RAVEX_BASE_URL}/api/pedido/{pid}", token, 20)


def obter_veiculo_por_id(token, veiculo_id):
    """GET /api/veiculo/{id}. Retorna veículo com tipoVeiculo (nome). Usado para placa/tipo quando canhotos não traz."""
    if veiculo_id is None or (isinstance(veiculo_id, (int, float)) and int(veiculo_id) <= 0):
        return None
    try:
        vid = int(veiculo_id)
    except (TypeError, ValueError):
        return None
    return _get(f"{RAVEX_BASE_URL}/api/veiculo/{vid}", token, 15)


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
