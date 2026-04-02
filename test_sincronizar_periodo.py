"""
Teste da API /api/ravex/sincronizar-periodo (lógica: obter-roteiro-por-periodo -> id_viagem -> linhas romaneio).
Requer servidor rodando (python app.py). Usa usuário admin/admin por padrão.
"""
import requests
import json

BASE = "http://127.0.0.1:5002"
USER = "admin"
PASS = "admin"

def main():
    s = requests.Session()
    # Login
    r = s.post(f"{BASE}/api/login", json={"usuario": USER, "senha": PASS}, timeout=10)
    if r.status_code != 200:
        print("Login falhou:", r.status_code, r.text)
        return
    data = r.json()
    if not data.get("ok"):
        print("Login rejeitado:", data.get("erro", r.text))
        return
    print("Login OK")

    # Sincronizar período
    payload = {"data_inicio": "2026-02-01", "data_fim": "2026-02-28"}
    r = s.post(f"{BASE}/api/ravex/sincronizar-periodo", json=payload, timeout=120)
    print("Status:", r.status_code)
    try:
        out = r.json()
        print(json.dumps(out, indent=2, ensure_ascii=False))
    except Exception:
        print("Body:", r.text[:2000])

if __name__ == "__main__":
    main()
