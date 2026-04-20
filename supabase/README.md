# 📁 Scripts SQL para Supabase

Execute estes arquivos **no SQL Editor do Supabase** na ordem indicada.

---

## ✅ Opção 1: Executar tudo de uma vez

Execute o arquivo completo:

📄 **`schema.sql`** (todas as tabelas de uma vez)

---

## ✅ Opção 2: Executar tabela por tabela (separado)

Execute **nesta ordem**:

### 1️⃣ Tabelas de autenticação e colaboradores
- 📄 `create_table_usuarios.sql`
- 📄 `create_table_colaboradores.sql`

### 2️⃣ Tabelas de viagem (override de dados da planilha)
- 📄 `create_table_viagem_placa.sql`
- 📄 `create_table_viagem_motorista.sql`
- 📄 `create_table_viagem_responsaveis.sql`
- 📄 `create_table_divergencia_motivo.sql`

### 3️⃣ Tabelas de bipagem
- 📄 `create_table_produtos_bipados.sql`

### 4️⃣ (Opcional) Dados iniciais
- 📄 `seed_colaboradores.sql` (colaboradores de exemplo)

### 5️⃣ REMOVER "UNRESTRICTED" / "SEM RESTRIÇÃO" (habilitar RLS)
Execute **nesta ordem**:
- 📄 `enable_rls_policies.sql` (habilita RLS nas tabelas)
- 📄 `enable_rls_views.sql` (remove UNRESTRICTED das views)
- 📄 **`migrate_terceiros_rls.sql`** — se as tabelas `terceiros_documentos` / `terceiros_documento_itens` / `terceiros_documento_eventos` existirem (módulo terceiros). Rode após a primeira carga do app ou quando o painel mostrar **SEM RESTRIÇÃO** nessas tabelas.

---

## 🔍 Como executar no Supabase

1. Abra o Supabase → **SQL Editor**
2. Clique em **New query**
3. **Cole** o conteúdo do arquivo SQL
4. Clique em **Run** (ou Ctrl+Enter)
5. ✅ Confirme "Success"

---

## 📊 Tabelas criadas

Após executar todos os scripts, você terá:

### Tabelas operacionais (7)
- ✅ `usuarios` (login)
- ✅ `colaboradores` (motoristas, conferentes, etc.)
- ✅ `produtos_bipados` (registro de bipagem)
- ✅ `viagem_placa` (override de placa)
- ✅ `viagem_motorista` (override de motorista)
- ✅ `viagem_responsaveis` (coordenador, conferente, ajudantes)
- ✅ `divergencia_motivo` (justificativa de faltas/sobras)

### Tabelas de planilha Excel (4 - criadas automaticamente)
- ✅ `excel_datasets` (controle de versões)
- ✅ `base_codigo_barras` (aba BASE)
- ✅ `excel_romaneio_por_item` (aba ROMANEIO POR ITEM)

### Views (2 - relatórios prontos)
- ✅ `v_resumo_viagem` (estatísticas por viagem)
- ✅ `v_divergencias` (itens com falta/sobra)

---

## ⚠️ Se aparecer erro "já existe"

É normal se você rodar os scripts mais de uma vez.

**Solução 1**: Ignorar (tabelas já estão criadas)

**Solução 2**: Remover e recriar
```sql
-- Descomente a linha "drop table if exists" no início de cada arquivo
```

---

## 🔒 Remover "UNRESTRICTED"

Se as tabelas aparecem com **UNRESTRICTED** no Supabase, execute:

📄 **`enable_rls_policies.sql`**

Isso vai:
- ✅ Habilitar **RLS (Row Level Security)** em todas as tabelas
- ✅ Criar **políticas de acesso** (permitir SELECT, INSERT, UPDATE, DELETE)
- ✅ Remover o aviso "UNRESTRICTED"

**Importante**: As políticas criadas permitem **acesso total** (sem autenticação JWT), adequado para sistema interno. Se quiser restringir no futuro, edite as policies.

Para **terceiros** (XML de NF-e), use também `migrate_terceiros_rls.sql` — o arquivo `enable_rls_policies.sql` não inclui essas tabelas porque elas costumam ser criadas depois pelo aplicativo.

---

## 🎯 Próximo passo

Após criar as tabelas, configure o app no Render com:
- `DATABASE_URL` (do Supabase)
- `PGSSLMODE=require`
- `SECRET_KEY` (chave forte)

Consulte: **`DEPLOY.md`** ou **`QUICK_START.md`**
