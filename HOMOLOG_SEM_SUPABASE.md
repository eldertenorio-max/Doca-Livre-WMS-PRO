# Homologação **sem** projeto Supabase extra

Se você **não tem slot** para outro projeto no Supabase, use uma destas opções.

| Opção | Custo | Isola dados da produção? | Recomendado |
|-------|-------|--------------------------|-------------|
| **A — Postgres no Render** | Grátis (30 dias)* | ✅ Sim | ⭐ **Sim** |
| **B — Mesmo Supabase da produção** | Grátis | ❌ Não | Só emergência |
| **C — Liberar slot no Supabase** | Grátis | ✅ Sim | Se tiver projeto antigo parado |

\* Postgres grátis no Render expira em **30 dias**; depois upgrade (~US$ 7/mês no plano básico) ou recrie e rode o schema de novo. Ver [Render Free Postgres](https://render.com/docs/free).

Produção continua no Supabase **Sistema WMS** (`ndfjetskugqsrrmulcyz`).  
Homologação usa **outro banco** (Render Postgres), com o **mesmo código** e os **mesmos scripts SQL** da pasta `supabase/`.

---

## Opção A — Postgres no Render (recomendada)

### 1. Criar o banco no Render

**Pelo Blueprint** (repo já tem `render.yaml` com `sistema-wms-homolog-db`):

1. [Render Dashboard](https://dashboard.render.com) → **Blueprints** → sync do repo **Sistema-WMS**
2. Serão criados: Web Service homolog + Postgres **`sistema-wms-homolog-db`**
3. O serviço homolog recebe `DATABASE_URL` automaticamente

**Ou manual:**

1. **New +** → **PostgreSQL**
2. Name: **`sistema-wms-homolog-db`** · Plan: **Free** · Region: **Oregon**
3. No Web Service **`sistema-wms-homologacao`** → Environment → `DATABASE_URL` = **Internal Database URL** do Postgres criado

### 2. Rodar o schema no Postgres do Render

1. No Postgres no Render → **Connections** → copie a **External Database URL**
2. Conecte com **psql**, DBeaver ou pgAdmin (local)
3. Execute os scripts na ordem (mesma lista de **`supabase/SUPABASE_HOMOLOG.md`**, seção 2), começando por `schema.sql`

Atalho mínimo para só login + WMS:

1. `supabase/schema.sql`
2. `supabase/create_wms_enderecamento.sql`
3. `supabase/migrate_wms_produto_planejamento.sql`
4. `supabase/insert_usuarios_data.sql`

Depois abra o site homolog **uma vez** — o `app.py` cria tabelas que faltarem no boot.

### 3. Variáveis no serviço homolog

| Variável | Valor |
|----------|--------|
| `APP_ENV` | `homologacao` |
| `DATABASE_URL` | Automático (Blueprint) ou URL do Postgres Render |
| `PGSSLMODE` | `require` |
| `SECRET_KEY` | Chave nova (diferente da produção) |

Produção **não muda**: continua com `DATABASE_URL` do **Supabase** no serviço `sistema-wms`.

---

## Opção B — Mesmo Supabase da produção (emergência)

Use **só** se não puder criar Postgres no Render agora.

1. No serviço **`sistema-wms-homologacao`**, cole a **mesma** `DATABASE_URL` da produção
2. `APP_ENV=homologacao` (faixa laranja no site)

⚠️ **Riscos:**

- Testes em homolog **alteram dados reais** (bipagem, WMS, terceiros, etc.)
- Não use para testes destrutivos ou carga pesada
- Assim que possível, migre para a **Opção A**

---

## Opção C — Liberar slot no Supabase

1. [Supabase Dashboard](https://supabase.com/dashboard) → projetos que **não usa**
2. **Pause project** ou exclua (só se tiver backup)
3. Crie **Sistema WMS Homolog** e siga **`supabase/SUPABASE_HOMOLOG.md`**

---

## Fluxo Git + deploy (igual antes)

```
push homolog → deploy automático em sistema-wms-homologacao.onrender.com
merge main   → Manual Deploy em sistema-wms.onrender.com (produção)
```

Detalhes: **`HOMOLOGACAO_RENDER.md`**

---

## Checklist (Opção A)

- [ ] Postgres **`sistema-wms-homolog-db`** criado no Render
- [ ] Web Service homolog com `APP_ENV=homologacao` e `DATABASE_URL` apontando para esse Postgres
- [ ] `schema.sql` (+ WMS) executados no banco Render
- [ ] `insert_usuarios_data.sql` ou cadastro manual
- [ ] Site homolog abre com faixa laranja e login ok
- [ ] Produção continua só no Supabase (URL antiga intacta)
