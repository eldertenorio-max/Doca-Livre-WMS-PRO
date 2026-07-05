# Supabase de homologação — passo a passo

> **Sem slot no Supabase?** Use **`HOMOLOG_SEM_SUPABASE.md`** (Postgres grátis no Render — recomendado).

Banco **separado** da produção. Produção hoje: projeto **Sistema WMS** (`ndfjetskugqsrrmulcyz`).

Homologação = **novo projeto Supabase** (ex.: `sistema-wms-homolog`) — **só se você tiver vaga** no plano.

---

## 1. Criar o projeto

1. [supabase.com](https://supabase.com) → **New project**
2. **Name:** `Sistema WMS Homolog` (ou `sistema-wms-homolog`)
3. **Database password:** anote em local seguro
4. **Region:** Oregon (us-west-2) — mesma região do Render
5. Aguarde ~2 minutos

Anote o **Project ref** (ex.: `abcdefghijklmnop`) — aparece em Settings → General.

---

## 2. Estrutura (SQL Editor)

Abra **SQL Editor → New query** e execute **um arquivo por vez**, nesta ordem:

### Base

| # | Arquivo |
|---|---------|
| 1 | `supabase/schema.sql` |
| 2 | `supabase/migrate_excel_base_to_base_codigo_barras.sql` |
| 3 | `supabase/create_table_romaneio_por_item.sql` |
| 4 | `supabase/create_table_motoristas.sql` |
| 5 | `supabase/create_table_placas.sql` |
| 6 | `supabase/migrate_roteiros.sql` |
| 7 | `supabase/migrate_identificador_rota.sql` |
| 8 | `supabase/migrate_viagem_periodo_bipagem.sql` |
| 9 | `supabase/migrate_devolucao_nf.sql` |
| 10 | `supabase/migrate_ravex_importacoes.sql` |
| 11 | `supabase/migrate_ravex_importacoes_sem_fk.sql` |
| 12 | `supabase/migrate_ravex_importacoes_conjuntos.sql` |
| 13 | `supabase/migrate_tabela_geral_dados.sql` |
| 14 | `supabase/migrate_terceiros_motivos_fluxo.sql` |
| 15 | `supabase/migrate_terceiros_consumivel_sp.sql` |
| 16 | `supabase/migrate_terceiros_recebedor_mg.sql` |
| 17 | `supabase/migrate_terceiros_motorista_saida_mg.sql` |
| 18 | `supabase/fix_fn_sync_tabela_geral.sql` |

### WMS (endereçamento)

| # | Arquivo |
|---|---------|
| 19 | `supabase/create_wms_enderecamento.sql` |
| 20 | `supabase/migrate_wms_produto_planejamento.sql` |
| 21 | `supabase/fix_wms_camara_totais.sql` |

### Segurança (RLS)

| # | Arquivo |
|---|---------|
| 22 | `supabase/enable_rls_policies.sql` |
| 23 | `supabase/migrate_terceiros_rls.sql` |
| 24 | `supabase/migrate_devolucao_nf_rls.sql` |
| 25 | `supabase/migrate_viagem_periodo_bipagem_rls.sql` |
| 26 | `supabase/migrate_tabela_geral_rls.sql` |
| 27 | `supabase/migrate_wms_enderecamento_rls.sql` |
| 28 | `supabase/migrate_wms_palete_controle_rls.sql` |
| 29 | `supabase/migrate_romaneio_por_item_rls.sql` |
| 30 | `supabase/enable_rls_views.sql` |
| 31 | `supabase/fix_supabase_linter_security.sql` |

> Erro **"already exists"** → ignore e siga.  
> **Não rode** `migrate_roteiros_rename_to_id_roteiros.sql` em projeto novo.

---

## 3. Usuários de teste (homolog)

Execute **`supabase/insert_usuarios_data.sql`** (4 usuários).

Login de teste (mesmas senhas da produção, se você usa os mesmos hashes):

| Usuário | Observação |
|---------|------------|
| `admin` | Troque a senha após o primeiro login em homolog |
| `Diego`, `Elder`, `astro` | Conforme cadastro existente |

Para **só** homolog, pode criar um usuário novo pelo app (Cadastrar-se) em vez de copiar todos.

---

## 4. Dados de teste (opcional)

**Opção A — Banco vazio + testes manuais**  
Ideal para validar WMS/endereçamento sem risco.

**Opção B — Copiar snapshot da produção**  
Use o script de migração (PowerShell na pasta do projeto):

```powershell
pip install psycopg[binary] python-dotenv

$env:PGSSLMODE = "require"
# Session pooler, porta 5432 (origem = produção)
$env:DATABASE_URL_ORIGEM = "postgresql://postgres.ndfjetskugqsrrmulcyz:SENHA_PROD@aws-1-us-west-2.pooler.supabase.com:5432/postgres"
# Session pooler, porta 5432 (destino = homolog)
$env:DATABASE_URL_DESTINO = "postgresql://postgres.SEU_REF_HOMOLOG:SENHA_HOMOLOG@aws-1-us-west-2.pooler.supabase.com:5432/postgres"

python scripts/migrar_supabase_para_supabase.py --dry-run
python scripts/migrar_supabase_para_supabase.py
```

> Copiar produção → homolog **sobrescreve** o banco de homolog. Use só quando quiser espelhar dados reais para teste.

**Opção C — Dados mínimos**  
Execute `supabase/INSERT_TUDO_DE_UMA_VEZ.sql` (usuários + colaboradores de exemplo).

---

## 5. Pegar a `DATABASE_URL` para o Render

1. Supabase (projeto **Homolog**) → **Settings → Database**
2. **Connection string** → **Transaction pooler** → modo **Session**
3. Copie a URL (porta **6543**)
4. Substitua `[YOUR-PASSWORD]` pela senha do passo 1

Formato esperado:

```text
postgresql://postgres.SEU_REF_HOMOLOG:SENHA@aws-1-us-west-2.pooler.supabase.com:6543/postgres
```

---

## 6. Colar no Render (serviço homologação)

No serviço **`sistema-wms-homologacao`** → **Environment**:

| Variável | Valor |
|----------|--------|
| `APP_ENV` | `homologacao` |
| `DATABASE_URL` | URL do passo 5 |
| `PGSSLMODE` | `require` |
| `SECRET_KEY` | `python -c "import secrets; print(secrets.token_hex(32))"` |
| `RAVEX_USER` / `RAVEX_PASSWORD` | Opcional (credenciais de teste) |

**Save** → aguarde o redeploy.

Teste:

- https://sistema-wms-homologacao.onrender.com → faixa laranja **Homologação**
- `GET /api/health` → `"env": "homologacao"`
- Login com usuário de teste

---

## 7. Manutenção

| Ação | Onde |
|------|------|
| Nova migration SQL | Rode **só em homolog** primeiro; depois em produção |
| Resetar homolog | Apague projeto Supabase e recrie, ou truncate + migrations |
| Nunca | Apontar homolog para `DATABASE_URL` de produção |

---

## Checklist rápido

- [ ] Projeto Supabase **Homolog** criado
- [ ] `schema.sql` + migrations (lista acima) executados
- [ ] `insert_usuarios_data.sql` (ou cadastro manual)
- [ ] `DATABASE_URL` (pooler **6543**) no Render homolog
- [ ] `APP_ENV=homologacao` no Render homolog
- [ ] Site abre com faixa laranja e login ok

Consulte também: **`HOMOLOGACAO_RENDER.md`** (branches Git + deploy).
