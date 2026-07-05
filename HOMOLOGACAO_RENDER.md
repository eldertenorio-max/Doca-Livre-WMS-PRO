# Homologação + Produção no Render

Dois ambientes **iguais em código**, separados por **branch** e **URL**.

| Ambiente | Branch | URL | Uso |
|----------|--------|-----|-----|
| **Produção** | `main` | https://sistema-wms.onrender.com | Operação real |
| **Homologação** | `homolog` | https://sistema-wms-homologacao.onrender.com | Testes e edições |

---

## Por que não é Static Site?

O Stock System WMS é **Flask (Python) + PostgreSQL + login + APIs**.  
No Render isso exige **Web Service**, não **Static Site** (que só serve HTML/CSS/JS estáticos, sem backend).

---

## Passo 1 — Banco de homologação

**Sem projeto Supabase extra?** → **`HOMOLOG_SEM_SUPABASE.md`** (Postgres no Render, grátis).

**Com projeto Supabase novo?** → **`supabase/SUPABASE_HOMOLOG.md`**.

- Produção continua no Supabase atual (`ndfjetskugqsrrmulcyz`)
- Homologação usa **banco separado** (Render Postgres ou Supabase novo)
- **Nunca** aponte homolog para o banco de produção, exceto emergência (ver guia)

---

## Passo 2 — Branch `homolog` no GitHub

No repositório **Sistema-WMS** (`wms` remote):

```powershell
git checkout main
git pull wms main
git checkout -b homolog
git push -u wms homolog
```

Fluxo de trabalho:

1. Desenvolver e commitar na branch **`homolog`**
2. Testar em https://sistema-wms-homologacao.onrender.com
3. Quando estiver ok: merge `homolog` → `main` (deploy automático na produção)

---

## Passo 3 — Criar o serviço no Render

### Opção A — Blueprint (`render.yaml`)

1. [Render Dashboard](https://dashboard.render.com) → **Blueprints**
2. Conecte o repo **Sistema-WMS**
3. O arquivo `render.yaml` define **dois Web Services**
4. Após o sync, configure **Environment** em cada serviço:
   - **Produção** (`sistema-wms`): `DATABASE_URL` do Supabase **produção**
   - **Homologação** (`sistema-wms-homologacao`): `DATABASE_URL` do Supabase **homolog**

### Opção B — Manual (se produção já existir)

1. **New +** → **Web Service**
2. Repo: **Sistema-WMS** · Branch: **`homolog`**
3. Name: **`sistema-wms-homologacao`**
4. Build: `pip install -r requirements.txt`
5. Start: `gunicorn -b 0.0.0.0:$PORT --workers 1 --timeout 120 --graceful-timeout 30 --worker-class gthread --threads 4 app:app`
6. Health check: `/api/health`
7. Variáveis:
   - `APP_ENV` = `homologacao`
   - `DATABASE_URL` = URL do banco **homolog**
   - `PGSSLMODE` = `require`
   - `SECRET_KEY` = chave aleatória (diferente da produção)
   - `RAVEX_*` = opcional (pode usar credenciais de teste)

---

## Passo 4 — Deploy (homolog automático, produção manual)

| Push em | Deploy em | Como |
|---------|-----------|------|
| `homolog` | **Homologação** | Automático (`autoDeploy: true`) |
| `main` | **Produção** | **Manual** no Render (`autoDeploy: false`) |

### Fluxo recomendado

1. Commit + push na branch **`homolog`**
2. Testar em https://sistema-wms-homologacao.onrender.com
3. Merge `homolog` → `main` e push
4. No [Render Dashboard](https://dashboard.render.com) → serviço **`sistema-wms`** → **Manual Deploy** → **Deploy latest commit**

Assim a produção **só sobe quando você confirmar** no painel, mesmo após merge na `main`.

---

## Como saber em qual ambiente estou?

- **Homologação**: faixa laranja no topo — *“Homologação — Ambiente de testes”*
- **API**: `GET /api/health` → `{ "ok": true, "env": "homologacao" }` ou `"producao"`

---

## Renomear produção existente

Se o serviço de produção no Render ainda se chama `controle-de-carregamento`:

1. Settings → **Name** → renomeie para **`sistema-wms`** (URL continua `sistema-wms.onrender.com` se já configurada)
2. Ou mantenha o nome e só adicione o serviço **`sistema-wms-homologacao`** manualmente

---

## Resumo

```
[Git homolog] ──push──► Render Web Service (homologação) ──► Supabase homolog
       │
       └── merge main ──► Render Web Service (produção) ──► Supabase produção
```

Produção: https://sistema-wms.onrender.com  
Homologação: https://sistema-wms-homologacao.onrender.com (após criar o serviço)
