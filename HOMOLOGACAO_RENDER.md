# Homologação + Produção no Render

Igual ao seu **outro projeto**: **mesmo banco**, **outro site** no Render.  
A diferença é só o **tipo de serviço** — aqui é **Web Service (Python)**, não Static Site.

| Ambiente | Branch | URL | Banco |
|----------|--------|-----|-------|
| **Produção** | `main` | https://sistema-wms.onrender.com | Supabase (atual) |
| **Homologação** | `homolog` | https://sistema-wms-homologacao.onrender.com | **Mesmo Supabase** |

---

## Por que não é Static Site?

No outro projeto o front era só HTML/JS e apontava para uma API.  
O **Stock System WMS** é o **app completo** (Flask + login + `/api/*` + WMS).  
No Render isso precisa ser **Web Service**, não Static Site.

Na prática para você: **duplicar o Web Service de produção**, mudar branch e URL.

---

## Passo 1 — Criar homologação no Render (5 min)

1. [Render Dashboard](https://dashboard.render.com) → serviço **`sistema-wms`** (produção)
2. Anote em **Environment** os valores de:
   - `DATABASE_URL`
   - `PGSSLMODE`
   - `RAVEX_USER` / `RAVEX_PASSWORD` (se existirem)
3. **New +** → **Web Service** (não Static Site)
4. Repo: **Sistema-WMS** · Branch: **`homolog`**
5. Name: **`sistema-wms-homologacao`**
6. Build: `pip install -r requirements.txt`
7. Start: `gunicorn -b 0.0.0.0:$PORT --workers 1 --timeout 120 --graceful-timeout 30 --worker-class gthread --threads 4 app:app`
8. Health check: `/api/health`
9. **Environment** — copie da produção:

| Variável | Homologação |
|----------|-------------|
| `APP_ENV` | `homologacao` |
| `DATABASE_URL` | **Igual à produção** |
| `PGSSLMODE` | `require` |
| `SECRET_KEY` | Pode ser a mesma ou outra |
| `RAVEX_*` | Igual à produção (opcional) |

10. **Create Web Service** → URL: `https://sistema-wms-homologacao.onrender.com`

Não precisa criar banco novo, Postgres no Render nem projeto Supabase extra.

---

## Passo 2 — Branch `homolog` no Git

```powershell
git checkout main
git pull wms main
git checkout -b homolog
git push -u wms homolog
```

---

## Passo 3 — Fluxo do dia a dia

```
Editar código → commit/push na branch homolog
       ↓
Deploy automático em sistema-wms-homologacao.onrender.com (faixa laranja)
       ↓ ok
Merge homolog → main → Manual Deploy em sistema-wms (produção)
```

| Push | O que atualiza |
|------|----------------|
| `homolog` | Só homologação (automático) |
| `main` | Produção (**Manual Deploy** no Render) |

---

## Como saber onde estou?

- **Homologação**: faixa laranja **Homologação** no topo
- **Produção**: sem faixa
- API: `/api/health` → `"env": "homologacao"` ou `"producao"`

---

## Atenção (mesmo banco)

Como homolog e produção usam o **mesmo Supabase**:

- Alterações em homolog (bipagem, WMS, cadastros) **aparecem na produção**
- Use homolog para testar **layout, rotas, telas e código novo**
- Evite testes destrutivos (apagar dados, inventário em massa, etc.)

Se no futuro quiser banco separado: **`HOMOLOG_SEM_SUPABASE.md`** (Postgres Render ou Supabase novo).

---

## Resumo

```
                    ┌── Web Service produção (main) ──► sistema-wms.onrender.com
Supabase (único) ◄──┤
                    └── Web Service homolog (homolog) ► sistema-wms-homologacao.onrender.com
```

Produção: https://sistema-wms.onrender.com  
Homologação: https://sistema-wms-homologacao.onrender.com
