# 📊 Como popular base_codigo_barras (somente aba BASE)

Por enquanto **apenas a aba BASE** da planilha é populada; as demais abas (ROMANEIO POR ITEM, COLABORADORES, PLACAS etc.) podem ser tratadas depois.

A aba BASE tem **845 produtos** — muito grande para SQL manual.

---

## ⚡ Opção 1: SQL no painel Supabase (mais simples)

1. Abra o projeto no [Supabase](https://supabase.com) → **SQL Editor** → **New query**.
2. Cole o conteúdo do arquivo **`supabase/import_base_codigo_barras_atual.sql`** (ou faça upload do arquivo).
3. Clique em **Run** (executar uma vez só).

O script cria um dataset novo, desativa os antigos e insere os **249** produtos atualizados.

Para regerar o SQL depois de editar o TSV:

```bash
python scripts\gerar_sql_base_codigo_barras.py
```

---

## ⚡ Opção 2: TSV + script Python (lista FILIAL / SKU / EAN / DUN)

Quando você receber a base em texto (como exportação com colunas **FILIAL**, **SEQ. SKU(s)**, **DESCRIÇÃO**, **EAN**, **UND EAN**, **DUN**, **UND DUN**):

1. Salve ou use o arquivo `data/base_codigo_barras_atual.tsv` na raiz do projeto.
2. Configure `DATABASE_URL` (ou `.env` na raiz).
3. Execute:

```bash
python scripts\importar_base_codigo_barras_tsv.py
```

O script cria um **novo dataset ativo**, desativa os antigos e insere **uma linha por combinação** de código (EAN e/ou DUN). A filial fica em `data` (JSON), pois a tabela ainda não tem coluna `filial`.

---

## ⚡ Opção 3: Script Python da planilha Excel (aba BASE)

Execute o script que lê a aba BASE do `.xlsx`:

### 1. Configure a DATABASE_URL

No terminal (Windows):
```powershell
$env:DATABASE_URL = "postgresql://postgres.[projeto]:[senha]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres"
$env:PGSSLMODE = "require"
```

### 2. Execute o script

```bash
python scripts\popular_excel_base.py
```

**O que ele faz**:
- ✅ Cria um `dataset_id` novo
- ✅ Lê **somente** os produtos da aba BASE
- ✅ Insere no Supabase em lotes (rápido)
- ✅ Armazena dados completos em JSONB

**Tempo estimado**: 10-30 segundos

---

## 🌐 Opção 2: Pelo painel web (depois do deploy)

Depois que o app estiver rodando no Render, você pode usar a importação pela interface (quando disponível). Por enquanto, use o script para a aba BASE.

---

## 📋 Resumo

| Método | Quando usar | Vantagens |
|--------|-------------|-----------|
| **Script Python** | Antes do deploy | Rápido, direto, testável |
| **Painel web** | Depois do deploy | Interface visual, fácil |

---

## ✅ Depois de popular

A tabela `base_codigo_barras` terá:
- ✅ 845 produtos
- ✅ Códigos internos, EAN, DUN
- ✅ Descrições, preços, datas
- ✅ Dados completos em JSONB

---

**Recomendação**: Use o script Python agora para testar a conexão com o Supabase!
