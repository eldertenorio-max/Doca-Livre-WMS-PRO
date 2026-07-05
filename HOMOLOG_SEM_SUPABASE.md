# Homologação — banco separado (opcional)

**Padrão do projeto (igual seu outro site):** mesmo Supabase nos dois serviços.  
Siga **`HOMOLOGACAO_RENDER.md`**.

Use este guia **só** se quiser homolog **sem** mexer nos dados de produção.

| Opção | Isola dados? |
|-------|----------------|
| **Mesmo Supabase** (padrão) | ❌ |
| Postgres no Render | ✅ |
| Novo projeto Supabase | ✅ |

---

## Postgres no Render

1. **New + → PostgreSQL** → `sistema-wms-homolog-db` (Free, Oregon)
2. Rode `schema.sql` + migrations (lista em `supabase/SUPABASE_HOMOLOG.md`)
3. No serviço homolog, troque `DATABASE_URL` pela URL des desse Postgres

Postgres grátis expira em 30 dias — [Render Free](https://render.com/docs/free).

---

## Novo projeto Supabase

Só se tiver slot livre no plano → **`supabase/SUPABASE_HOMOLOG.md`**.
