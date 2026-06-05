# Migrar base para o Supabase **Sistema WMS**

Projeto novo: **Sistema WMS**  
URL: `https://ndfjetskugqsrrmulcyz.supabase.co`  
Região: **Oregon (us-west-2)**

Este guia copia **todos os dados** do Supabase antigo para o novo e aponta o **Render** para a base nova.

---

## Visão geral

| Etapa | O quê |
|-------|--------|
| 1 | Criar estrutura (tabelas) no Supabase **novo** |
| 2 | Copiar dados do Supabase **antigo** → **novo** |
| 3 | Conferir contagens |
| 4 | Atualizar `DATABASE_URL` no **Render** |
| 5 | (Opcional) Atualizar `.env` local e GitHub Secrets |

O código do app **não muda** — só a URL de conexão.

---

## 1. Estrutura no Supabase novo

1. Abra [Supabase → Sistema WMS → SQL Editor](https://supabase.com/dashboard/project/ndfjetskugqsrrmulcyz/sql/new).
2. Execute **`supabase/schema.sql`** (copie o arquivo inteiro → Run).
3. Execute as migrations abaixo **nesta ordem** (uma query por arquivo):

```
supabase/migrate_excel_base_to_base_codigo_barras.sql
supabase/create_table_romaneio_por_item.sql          ← IMPORTANTE (Ravex/conferência)
supabase/create_table_motoristas.sql
supabase/create_table_placas.sql
supabase/migrate_roteiros.sql
supabase/migrate_identificador_rota.sql
supabase/migrate_viagem_periodo_bipagem.sql
supabase/migrate_devolucao_nf.sql
supabase/migrate_ravex_importacoes.sql
supabase/migrate_ravex_importacoes_sem_fk.sql
supabase/migrate_ravex_importacoes_conjuntos.sql
supabase/migrate_tabela_geral_dados.sql
supabase/migrate_terceiros_motivos_fluxo.sql
supabase/migrate_terceiros_consumivel_sp.sql
supabase/migrate_terceiros_recebedor_mg.sql
supabase/migrate_terceiros_motorista_saida_mg.sql
supabase/fix_fn_sync_tabela_geral.sql
supabase/enable_rls_policies.sql
supabase/migrate_terceiros_rls.sql
supabase/migrate_devolucao_nf_rls.sql
supabase/migrate_viagem_periodo_bipagem_rls.sql
supabase/migrate_tabela_geral_rls.sql
supabase/enable_rls_views.sql
supabase/fix_supabase_linter_security.sql
```

> **Não rode** `migrate_roteiros_rename_to_id_roteiros.sql` em projeto novo (só renomeia tabela antiga `roteiros` → `id_roteiros`).

> Se algum script der “já existe”, pode ignorar e seguir.

### Como saber se a estrutura está completa

No **Table Editor** do projeto **Sistema WMS**, você deve ver **cerca de 22 tabelas** + 2 views (`v_divergencias`, `v_resumo_viagem`).

Se só aparecerem **~14 tabelas** (só `schema.sql`), faltam migrations. Compare com esta lista:

| Tabela | Vem de |
|--------|--------|
| usuarios, colaboradores, produtos_bipados, romaneio, divergencia_motivo | schema.sql |
| viagem_placa, viagem_motorista, viagem_responsaveis | schema.sql |
| excel_datasets, base_codigo_barras, excel_romaneio_por_item, id_roteiros | schema.sql |
| **romaneio_por_item** | create_table_romaneio_por_item.sql |
| **motoristas**, **placas** | create_table_motoristas/placas.sql |
| **ravex_importacoes** | migrate_ravex_importacoes.sql |
| **terceiros_documentos** (+ itens, eventos) | app boot ou migrate_terceiros_* |
| **devolucao_nota_fiscal** | migrate_devolucao_nf.sql |
| **viagem_periodo_bipagem** | migrate_viagem_periodo_bipagem.sql |
| **tabela_geral_dados**, **tabela_geral_snapshot** | migrate_tabela_geral_dados.sql |

**Atalho:** após `schema.sql` + `create_table_romaneio_por_item.sql`, aponte o Render **temporariamente** para o banco novo e abra o site uma vez — o `app.py` cria terceiros e outras tabelas no boot. Depois rode o restante das migrations (RLS) e copie os dados.

---

## 2. Pegar as URLs de conexão

Em **Settings → Database → Connection string**:

| Uso | Modo recomendado |
|-----|------------------|
| Migração (script Python) | **Session** — porta **5432** (URI direta) |
| Render em produção | **Transaction pooler** — porta **6543** |

Substitua `[YOUR-PASSWORD]` pela senha do banco do projeto.

**Antigo (origem):** Supabase do projeto que está em produção hoje.  
**Novo (destino):** `ndfjetskugqsrrmulcyz`.

---

## 3. Copiar os dados (PowerShell)

Na pasta do projeto:

```powershell
pip install psycopg[binary] python-dotenv

$env:PGSSLMODE = "require"
$env:DATABASE_URL_ORIGEM = "postgresql://postgres.[PROJETO_ANTIGO]:SENHA@....supabase.com:5432/postgres"
$env:DATABASE_URL_DESTINO = "postgresql://postgres.ndfjetskugqsrrmulcyz:SENHA@aws-0-us-west-2.pooler.supabase.com:5432/postgres"

# Simular (só conta linhas)
python scripts/migrar_supabase_para_supabase.py --dry-run

# Migrar de verdade
python scripts/migrar_supabase_para_supabase.py
```

O script:

- Trunca as tabelas no **destino** (com `CASCADE`)
- Copia na ordem correta (respeitando FKs)
- Ajusta sequences (`id` bigserial)
- Mostra resumo origem × destino

---

## 4. Conferir

```powershell
$env:DATABASE_URL = $env:DATABASE_URL_ORIGEM
python scripts/contar_linhas_supabase.py

$env:DATABASE_URL = $env:DATABASE_URL_DESTINO
python scripts/contar_linhas_supabase.py
```

As contagens devem bater (principalmente `base_codigo_barras`, `romaneio_por_item`, `produtos_bipados`, `terceiros_*`, `ravex_importacoes`).

---

## 5. Atualizar o Render

1. [Render Dashboard](https://dashboard.render.com) → serviço **controle-de-carregamento**
2. **Environment** → variável **`DATABASE_URL`**
3. Cole a URL do **Transaction pooler** do projeto **Sistema WMS** (porta **6543**)
4. Confirme **`PGSSLMODE`** = `require`
5. **Save Changes** → o Render redeploya sozinho

Teste: login, conferência de um roteiro, aba Base, Terceiros.

---

## 6. Git / GitHub

O repositório **não guarda** senha nem `DATABASE_URL` (está no `.gitignore`).

Opcional — arquivo `.env` local (nunca commitar):

```env
DATABASE_URL=postgresql://postgres.ndfjetskugqsrrmulcyz:SENHA@....pooler.supabase.com:6543/postgres
PGSSLMODE=require
SECRET_KEY=sua-chave-local
```

Se usar **GitHub Actions** ou secrets, atualize `DATABASE_URL` lá também.

---

## 7. Desligar o Supabase antigo

Só depois de **1–2 dias** usando o novo sem problemas:

- Confirme backup no projeto novo (Supabase → Backups)
- Pause ou exclua o projeto antigo para não pagar dois bancos

---

## Problemas comuns

| Erro | Solução |
|------|---------|
| Tabela não existe no destino | Rode `schema.sql` + migrations no passo 1 |
| `password authentication failed` | Senha errada ou URL do pooler sem usuário `postgres.PROJECT_REF` |
| Contagem divergente em 1 tabela | Rode de novo só ela: `--tabela nome_da_tabela` |
| App no Render não conecta | Use **Transaction pooler** 6543, não a URI direta 5432 |

---

## Referência rápida — projeto novo

- **Project ref:** `ndfjetskugqsrrmulcyz`
- **Host API:** `https://ndfjetskugqsrrmulcyz.supabase.co`
- **Script de migração:** `scripts/migrar_supabase_para_supabase.py`
