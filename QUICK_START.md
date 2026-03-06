# ⚡ Guia Rápido de Deploy

## ✅ Checklist completo (Supabase → GitHub → Render)

### □ 1. Supabase (Banco de Dados)

- [ ] Criar projeto no Supabase ([supabase.com](https://supabase.com))
- [ ] Ir em **SQL Editor** e executar `supabase/schema.sql`
- [ ] Copiar **Database URL** (Settings → Database → Transaction Pooler)
- [ ] ⚠️ Substituir `[YOUR-PASSWORD]` pela senha do projeto

**Resultado esperado**: Tabelas criadas (`usuarios`, `produtos_bipados`, `viagem_veiculo`, etc.)

---

### □ 2. GitHub (Repositório)

- [ ] Criar repositório no GitHub (público ou privado)
- [ ] Copiar a URL do repo

**No terminal da pasta do projeto**:

```bash
git init
git add .
git commit -m "Deploy: Sistema pronto para produção"
git remote add origin https://github.com/SEU-USUARIO/controle-carregamento.git
git branch -M main
git push -u origin main
```

**Resultado esperado**: Código aparece no GitHub

---

### □ 3. Render (Servidor Web)

- [ ] Acessar [render.com](https://render.com)
- [ ] New → **Blueprint**
- [ ] Selecionar o repositório do GitHub
- [ ] Render detecta `render.yaml` e cria o serviço

**Configurar variáveis**:
- [ ] `DATABASE_URL` = URL do Supabase (Transaction Pooler)
- [ ] `PGSSLMODE` = `require`
- [ ] `SECRET_KEY` = (gerar: `python -c "import secrets; print(secrets.token_hex(32))"`)

- [ ] Aguardar "Deploy live" (3-5 minutos)
- [ ] Acessar a URL: `https://seu-app.onrender.com`

**Resultado esperado**: Sistema funcionando na nuvem

---

### □ 4. Testar

- [ ] Fazer login (admin/admin)
- [ ] Importar a planilha Excel
- [ ] Selecionar um roteiro
- [ ] Bipar um item
- [ ] Verificar que apareceu na lista

---

## 🎯 Resumo das Melhorias

### Antes → Depois

| Item | Antes | Depois |
|------|-------|--------|
| **Banco** | SQLite (local) | Supabase (Postgres na nuvem) |
| **Deploy** | Manual (.bat Windows) | Automático (Render) |
| **Tabelas de viagem** | 2 tabelas separadas | 1 tabela unificada |
| **Auditoria** | Sem rastreio | Campos `atualizado_por`, `registrado_por` |
| **Constraints** | Poucos | CHECK, DEFAULT, NOT NULL |
| **Views** | Nenhuma | `v_resumo_viagem`, `v_divergencias` |
| **Timestamps** | TEXT | TIMESTAMPTZ (com timezone) |

---

## 🔧 Comandos úteis

### Testar conexão com Supabase (local)

```bash
set DATABASE_URL=postgresql://...
set PGSSLMODE=require
python -c "import app; app.init_db(); print('Conexão OK')"
```

### Migrar dados SQLite → Supabase

```bash
set DATABASE_URL=postgresql://...
set PGSSLMODE=require
python scripts/migrate_sqlite_to_supabase.py
```

### Rodar com Gunicorn (simula produção)

```bash
gunicorn -b 127.0.0.1:5001 app:app
```

---

## 📞 Suporte

Se algo der errado:

1. **Verifique os logs** (Render → Logs)
2. **Teste local** com Supabase primeiro
3. **Consulte** `DEPLOY.md` e `SCHEMA_REFERENCE.md`

---

**Tempo estimado total**: 15-20 minutos  
**Dificuldade**: ⭐⭐⭐ (Intermediário)
