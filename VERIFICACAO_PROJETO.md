# Verificação completa do projeto – Controle de Carregamento

**Data:** verificação pós-limpeza, pronta para subir no Git.

---

## 1. Estrutura no disco (raiz)

| Arquivo / Pasta | Status | Observação |
|-----------------|--------|------------|
| **app.py** | OK | Aplicação Flask principal |
| **CONTROLE DE CARREGAMENTO ULTRAPAO_NOVO.xlsx** | OK | Planilha mantida; scripts usam ela |
| **requirements.txt** | OK | Dependências do deploy |
| **render.yaml** | OK | Deploy no Render (usa `app:app` da raiz) |
| **iniciar_painel.bat** | OK | PORT=5001, abre http://127.0.0.1:5001/ |
| **.env.example** | OK | Modelo de variáveis (não versionar `.env`) |
| **config_usuarios.example.py** | OK | Modelo de usuários (não versionar `config_usuarios.py`) |
| **config_usuarios.py** | Local apenas | No `.gitignore` – não sobe no Git |
| **controle_carregamento.db** | Local apenas | SQLite local; `*.db` no `.gitignore` |
| **EBB1A500** | Local apenas | No `.gitignore` – não sobe no Git |
| **templates/** | OK | index.html, login.html |
| **static/** | OK | script.js, style.css, login.css, logo.png |
| **scripts/** | OK | popular_excel_base.py, gerar_sql_*.py, migrate_sqlite_to_supabase.py |
| **supabase/** | OK | schema.sql, create_table_*.sql, insert_*_data.sql, RLS, etc. |
| **README.md, DEPLOY.md, CHANGELOG.md, QUICK_START.md, SCHEMA_REFERENCE.md** | OK | Documentação |

---

## 2. Segurança / o que não sobe no Git

| Item | .gitignore | Resultado |
|------|------------|-----------|
| `.env` | Sim | Não versionado |
| `config_usuarios.py` | Sim | Não versionado (contém senhas) |
| `*.db` | Sim | `controle_carregamento.db` não sobe |
| `EBB1A500` | Sim | Não versionado |
| `venv/`, `__pycache__/`, `uploads/` | Sim | Ignorados |

---

## 3. Deploy (Render)

- **buildCommand:** `pip install -r requirements.txt`
- **startCommand:** `gunicorn -b 0.0.0.0:$PORT app:app`
- **app:** `app.py` na raiz (não usa mais a pasta `backend/`)
- **Variáveis:** SECRET_KEY (gerada), PGSSLMODE=require, DATABASE_URL (configurar no painel)

---

## 4. Dependências (requirements.txt)

- Flask, openpyxl, Werkzeug – app
- gunicorn – servidor em produção
- psycopg[binary], python-dotenv – Supabase e .env

Nenhuma referência a módulos da pasta `backend/` removida.

---

## 5. Planilha e scripts

- **Planilha:** `CONTROLE DE CARREGAMENTO ULTRAPAO_NOVO.xlsx` existe na raiz e está versionada.
- **popular_excel_base.py:** lê a planilha na raiz (cwd = pasta do projeto); usa `.env` da raiz; preenche `base_codigo_barras`.
- **gerar_sql_*.py:** usam o mesmo nome de planilha na raiz.

---

## 6. Git

- **Branch:** main
- **Status:** working tree clean (nada pendente de commit)
- **Arquivos versionados:** planilha xlsx, .env.example, static/logo.png, app, templates, static, scripts, supabase, docs, etc.
- **Não versionados (correto):** config_usuarios.py, .env, *.db, EBB1A500

---

## 7. Conclusão

- Projeto limpo e consistente com o que deve subir no Git.
- Planilha mantida e referenciada pelos scripts.
- Nenhum arquivo sensível ou local (senhas, .env, SQLite) está sendo versionado.
- Deploy no Render usa apenas o `app.py` da raiz e o `requirements.txt`.

Pode subir para o GitHub com:

```powershell
git remote add origin https://github.com/SEU_USUARIO/controle-carregamento.git
git push -u origin main
```
