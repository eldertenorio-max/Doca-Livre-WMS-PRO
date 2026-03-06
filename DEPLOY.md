# 🚀 Guia Completo de Deploy (Supabase + GitHub + Render)

Este guia detalha o passo a passo para colocar o sistema em produção.

---

## ☁️ PASSO 1: Configurar o Banco de Dados (Supabase)

### 1.1 Criar projeto no Supabase

1. Acesse [supabase.com](https://supabase.com)
2. Clique em **New project**
3. Preencha:
   - **Name**: `controle-carregamento` (ou o nome que preferir)
   - **Database Password**: escolha uma senha forte
   - **Region**: `South America (São Paulo)` (mais próximo)
4. Aguarde o projeto ser criado (~2 minutos)

### 1.2 Executar o schema

1. No painel do Supabase, vá em **SQL Editor** (menu lateral)
2. Clique em **New query**
3. Copie **TODO** o conteúdo do arquivo `supabase/schema.sql`
4. Cole no editor e clique em **Run**
5. ✅ Confirme que aparece "Success. No rows returned"

### 1.3 Copiar a Database URL

1. No Supabase, vá em **Settings** → **Database**
2. Role até **Connection string**
3. Escolha **Transaction Pooler** (recomendado para Render)
4. Modo: **Session**
5. Copie a URL (formato: `postgresql://postgres.[project]:[password]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`)
6. ⚠️ **Substitua `[YOUR-PASSWORD]` pela senha que você criou no passo 1.1**

---

## 📁 PASSO 2: Subir o código no GitHub

### 2.1 Criar repositório no GitHub

1. Acesse [github.com](https://github.com)
2. Clique em **New repository**
3. Preencha:
   - **Repository name**: `controle-carregamento`
   - **Public** ou **Private** (sua escolha)
   - **NÃO** marque "Initialize this repository with a README"
4. Clique em **Create repository**
5. Copie a URL do repo (exemplo: `https://github.com/seu-usuario/controle-carregamento.git`)

### 2.2 Enviar o código

Abra o terminal na pasta do projeto e execute:

```bash
# Inicializar Git
git init

# Adicionar todos os arquivos
git add .

# Criar o primeiro commit
git commit -m "Deploy: Supabase + Render - Schema organizado"

# Conectar ao GitHub (substitua a URL)
git remote add origin https://github.com/seu-usuario/controle-carregamento.git

# Enviar para o GitHub
git branch -M main
git push -u origin main
```

✅ Confirme que os arquivos aparecem no GitHub

---

## 🌐 PASSO 3: Deploy no Render

### 3.1 Conectar o repositório

1. Acesse [render.com](https://render.com)
2. Clique em **New** → **Blueprint**
3. Conecte sua conta do GitHub (se ainda não conectou)
4. Selecione o repositório `controle-carregamento`
5. O Render vai detectar o `render.yaml` automaticamente
6. Clique em **Apply**

### 3.2 Configurar variáveis de ambiente

Durante a criação ou depois (Settings → Environment):

| Variável | Valor | Descrição |
|----------|-------|-----------|
| `DATABASE_URL` | `postgresql://postgres.[project]:...` | URL do Supabase (Transaction Pooler) |
| `PGSSLMODE` | `require` | SSL obrigatório |
| `SECRET_KEY` | (gere uma chave aleatória) | Chave do Flask |

**Como gerar SECRET_KEY**:
```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

### 3.3 Aguardar o deploy

- O Render vai:
  1. Instalar dependências (`pip install -r requirements.txt`)
  2. Iniciar o servidor (`gunicorn -b 0.0.0.0:$PORT app:app`)
- Acompanhe os logs em tempo real
- ✅ Quando aparecer "Build successful" e "Deploy live", o sistema está no ar

### 3.4 Acessar a aplicação

- URL: `https://controle-de-carregamento.onrender.com` (ou o nome que você escolheu)
- Login padrão: **admin** / **admin** (altere em `config_usuarios.py`)

---

## 🔄 (Opcional) Migrar dados do SQLite local para Supabase

Se você já tem dados locais (SQLite) e quer levá-los para o Supabase:

```bash
# No terminal, configure as variáveis
set DATABASE_URL=postgresql://...
set PGSSLMODE=require

# Execute o script de migração
python scripts/migrate_sqlite_to_supabase.py
```

Isso vai copiar:
- Usuários
- Produtos bipados
- Viagens (placa, motorista, responsáveis)
- Divergências
- Romaneio

---

## 📝 Atualizações futuras

Depois de fazer alterações no código:

```bash
# No terminal da pasta do projeto
git add .
git commit -m "Descrição da alteração"
git push
```

O Render vai detectar o push e fazer o **deploy automático**.

---

## 🆘 Problemas comuns

### "Cannot connect to database"
- ✅ Verifique se `DATABASE_URL` está configurada no Render
- ✅ Confirme que executou o `schema.sql` no Supabase
- ✅ Teste a conexão local: `python -c "import os; os.environ['DATABASE_URL']='...'; import app"`

### "psycopg not found"
```bash
pip install psycopg[binary]
```

### Login não funciona
- Edite `config_usuarios.py` e adicione seu usuário
- Faça commit e push (ou reinicie o app local)

### Planilha não carrega
- Certifique-se de que a planilha Excel está no diretório ou use **Enviar Planilha** no painel

---

## 📊 Melhorias implementadas no schema

✅ **Tabelas unificadas**: `viagem_veiculo` (placa + motorista em uma só)  
✅ **Auditoria**: campos `atualizado_em`, `atualizado_por`, `registrado_por`  
✅ **Constraints**: CHECK, DEFAULT, NOT NULL adequados  
✅ **Índices otimizados**: queries de bipagem ficam rápidas mesmo com milhares de registros  
✅ **Views úteis**: `v_resumo_viagem`, `v_divergencias` (relatórios prontos)  
✅ **Comentários**: todas as tabelas/colunas documentadas  
✅ **Compatibilidade**: SQLite (local) e Postgres (produção)  

---

**Desenvolvido para Ultrapão Alimentos**  
Sistema de controle de carregamento e conferência
