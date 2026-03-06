# 📊 Como popular base_codigo_barras (somente aba BASE)

Por enquanto **apenas a aba BASE** da planilha é populada; as demais abas (ROMANEIO POR ITEM, COLABORADORES, PLACAS etc.) podem ser tratadas depois.

A aba BASE tem **845 produtos** — muito grande para SQL manual.

---

## ⚡ Opção 1: Script Python (RECOMENDADO)

Execute o script que conecta direto no Supabase:

### 1. Configure a DATABASE_URL

No terminal (Windows):
```bash
set DATABASE_URL=postgresql://postgres.[projeto]:[senha]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres
set PGSSLMODE=require
```

### 2. Execute o script

```bash
python scripts\popular_base_codigo_barras.py
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
