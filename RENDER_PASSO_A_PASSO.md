# Deploy no Render – Passo a passo

Repositório já está no GitHub: **https://github.com/diegoisidoro-byte/controle-carregamento**

---

## 1. Entrar no Render

1. Acesse **https://render.com**
2. Faça login (ou crie conta com GitHub).

---

## 2. Novo Web Service

1. No dashboard, clique em **New +** → **Web Service**.
2. Em **Connect a repository**, clique em **Connect account** ou **Configure account** e autorize o **GitHub**.
3. Selecione o repositório **diegoisidoro-byte/controle-carregamento**.
4. Clique em **Connect**.

---

## 3. Configurar o serviço

O Render pode detectar o `render.yaml` e preencher quase tudo. Confira:

| Campo | Valor |
|-------|--------|
| **Name** | `controle-carregamento` (ou o que preferir) |
| **Region** | **Oregon (US West)** ou **Frankfurt** – escolha o mais próximo |
| **Branch** | `main` |
| **Runtime** | **Python 3** |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `gunicorn -b 0.0.0.0:$PORT app:app` |
| **Plan** | **Free** |

---

## 4. Variáveis de ambiente (obrigatório)

Em **Environment** (ou **Environment Variables**), adicione:

| Key | Value |
|-----|--------|
| **DATABASE_URL** | A URL do Supabase (Transaction Pooler). Exemplo: `postgresql://postgres.lvcygloownkzotqynbol:SUA_SENHA@aws-1-us-east-1.pooler.supabase.com:5432/postgres` |
| **PGSSLMODE** | `require` |
| **SECRET_KEY** | Uma chave aleatória (veja abaixo) |

**Como gerar SECRET_KEY** (no PowerShell ou CMD):

```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```

Copie o resultado e cole no valor de **SECRET_KEY** no Render.

**Onde pegar a DATABASE_URL:**

- Supabase → **Settings** → **Database**
- Em **Connection string**, escolha **Transaction** (ou **Session**)
- Copie a URL e **troque `[YOUR-PASSWORD]` pela senha do banco**.

---

## 5. Criar o serviço

1. Clique em **Create Web Service**.
2. Aguarde o **build** e o **deploy** (alguns minutos).
3. Nos **Logs**, deve aparecer algo como: **"Build successful"** e depois **"Your service is live"**.

---

## 6. Acessar o app

- A URL será algo como: **https://controle-carregamento.onrender.com** (ou o nome que você deu).
- Login: use os usuários que estão no Supabase (tabela `usuarios`). Se você rodou os inserts, provavelmente **admin** / **admin** (troque a senha depois).

---

## Problemas comuns

- **"Application failed to respond"** → Confira se **Start Command** é exatamente: `gunicorn -b 0.0.0.0:$PORT app:app`
- **Erro de conexão com o banco** → Confira **DATABASE_URL** e **PGSSLMODE**; teste a URL no Supabase (SQL Editor).
- **Build falha** → Veja os logs do build; em geral é dependência (requirements.txt) ou Python version.

---

Depois do primeiro deploy, cada **git push** na branch **main** dispara um novo deploy automático.
