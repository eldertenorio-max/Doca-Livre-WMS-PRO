# 📦 Controle de Carregamento Ultrapão

Sistema web (Flask + SQLite/Postgres) para **bipagem, conferência e controle de carregamento** de mercadorias.

## 🚀 Estrutura do repositório (o que sobe no Git)

- **`app.py`** – aplicação Flask (bipagem, conferência, painel)
- **`templates/`** e **`static/`** – frontend (HTML, CSS, JS)
- **`requirements.txt`** e **`render.yaml`** – deploy (Render)
- **`CONTROLE DE CARREGAMENTO ULTRAPAO_NOVO.xlsx`** – planilha base (scripts leem daqui para popular o banco)
- **`scripts/`** – popular base, gerar SQL (motoristas, placas, colaboradores, etc.)
- **`supabase/`** – schema SQL, inserts, RLS, migrações
- **`iniciar_painel.bat`** – atalho para rodar local no Windows
- **`.env.example`**, **`config_usuarios.example.py`** – exemplos de configuração (não versionar `.env` nem `config_usuarios.py`)

### Tabelas principais (Supabase)

- **`usuarios`**: login e autenticação
- **`produtos_bipados`**: registro de cada bipagem (código, quantidade, doca, usuário, timestamp)
- **`viagem_placa`** e **`viagem_motorista`**: override de placa/motorista por viagem
- **`viagem_responsaveis`**: coordenador, conferente e auxiliares por viagem
- **`divergencia_motivo`**: justificativa de faltas/sobras por item
- **`romaneio`**: quantidades esperadas (cache)

## 🔧 Rodar local (desenvolvimento)

```bash
# Instalar dependências
pip install -r requirements.txt

# Rodar com SQLite (local)
python app.py
```

Por padrão abre em `http://127.0.0.1:5001/` (ou a porta definida em `PORT`).

## 📊 Dados: apenas do banco (sem planilha)

Com **DATABASE_URL** configurado (Supabase), o app **não usa mais a planilha Excel** em tempo de execução. Tudo vem do banco:

- **Base de produtos** → tabela `base_codigo_barras` (popular com `scripts/popular_excel_base.py`)
- **Motoristas** → tabela `motoristas` (e `colaboradores`)
- **Placas** → tabela `placas`
- **Romaneio** → tabela `excel_romaneio_por_item`
- **Viagem (placa/motorista/data)** → tabelas `viagem_placa`, `viagem_motorista` e `excel_romaneio_por_item`

Para atualizar dados: use os scripts em `scripts/` (ex.: `popular_excel_base.py`, `gerar_sql_*.py`) ou o cadastro pela tela. A planilha serve só como fonte para gerar os dados que você sobe por código/script.

### 1️⃣ Criar banco no Supabase (Postgres)

- Crie um projeto no [Supabase](https://supabase.com)
- Vá em **SQL Editor** e execute o script:
  ```
  supabase/schema.sql
  ```
- Copie a **Database URL** (recomendado: **Transaction Pooler** em Settings → Database)

### 2️⃣ (Opcional) Migrar dados do SQLite local para Supabase

Se você já tem dados locais no SQLite:

```bash
# Configurar variáveis
set DATABASE_URL=postgresql://postgres:[password]@db.[project].supabase.co:5432/postgres
set PGSSLMODE=require

# Migrar
python scripts/migrate_sqlite_to_supabase.py
```

### 3️⃣ Subir código no GitHub

No terminal, dentro da pasta do projeto:

```bash
# Inicializar repositório
git init
git add .
git commit -m "Deploy: Supabase + Render"

# Criar repositório no GitHub e fazer push (substitua a URL)
git remote add origin https://github.com/seu-usuario/controle-carregamento.git
git branch -M main
git push -u origin main
```

### 4️⃣ Deploy no Render

**Opção A (recomendada): Blueprint (`render.yaml`)**

- No Render: **New** → **Blueprint**
- Selecione o repositório do GitHub
- O Render vai detectar o `render.yaml` e criar o serviço automaticamente

**Opção B: Web Service manual**

- No Render: **New** → **Web Service**
- Conecte ao repositório do GitHub
- Configurações:
  - **Build Command**: `pip install -r requirements.txt`
  - **Start Command**: `gunicorn -b 0.0.0.0:$PORT --timeout 120 --worker-class gthread --threads 4 app:app`
  - **Environment Variables**:
    - `DATABASE_URL` = (URL do Supabase)
    - `PGSSLMODE` = `require`
    - `SECRET_KEY` = (chave forte aleatória)

## 🔐 Variáveis de ambiente

Crie um arquivo `.env` (copie de `.env.example`) com:

```bash
DATABASE_URL=postgresql://...        # URL do Supabase (deixe vazio para SQLite local)
PGSSLMODE=require                   # SSL do Postgres
SECRET_KEY=sua-chave-secreta-aqui   # Chave do Flask (sessão)
PORT=5001                           # Porta (opcional, padrão 5000)
```

## 📊 Funcionalidades

- ✅ Bipagem por código de barras (4 docas simultâneas)
- ✅ Conferência de itens por viagem
- ✅ Agrupamento automático de itens iguais
- ✅ Relatórios em Excel (extrato, divergências, tempos, etc.)
- ✅ Login multi-usuário (config_usuarios.py)
- ✅ Atualização em tempo real (SSE)
- ✅ Compatível com SQLite (local) e Postgres (Supabase)

## 🗂️ Estrutura de arquivos

```
controle-de-carregamento/
├── app.py                       # Backend principal (Flask)
├── requirements.txt             # Dependências Python
├── config_usuarios.py           # Lista de usuários (admin/senha)
├── iniciar_painel.bat          # Script Windows (local)
├── render.yaml                 # Config de deploy (Render)
├── .env.example                # Exemplo de variáveis de ambiente
├── .gitignore                  # Arquivos ignorados pelo Git
├── README.md                   # Este arquivo
├── supabase/
│   └── schema.sql              # Schema Postgres (Supabase)
├── scripts/
│   └── migrate_sqlite_to_supabase.py  # Migração SQLite → Supabase
├── templates/
│   ├── index.html              # Painel principal
│   └── login.html              # Tela de login
└── static/
    ├── script.js               # Lógica do front
    ├── style.css               # Estilos
    └── logo.png                # Logo Ultrapão
```

## 🛠️ Troubleshooting

### Erro "psycopg não instalado"
```bash
pip install psycopg[binary]
```

### Deploy no Render não inicia
- Verifique se `DATABASE_URL` está configurada
- Confira os logs no dashboard do Render
- Certifique-se de que o schema foi executado no Supabase

### Login não funciona
- Edite `config_usuarios.py` e adicione seu usuário
- Reinicie o app

---

**Desenvolvido para Ultrapão Alimentos**  
Sistema de controle de carregamento e conferência
