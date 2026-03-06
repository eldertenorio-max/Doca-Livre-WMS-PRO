# 📝 Changelog - Refatoração do Schema (2026-03-05)

## 🎯 Resumo das Mudanças

Schema do banco de dados **completamente reorganizado** para ser mais robusto, escalável e preparado para produção (Supabase + Render).

---

## ✨ Novas Funcionalidades

### 1. **Tabelas unificadas**
- ❌ Antes: `viagem_motorista` + `viagem_placa` (2 tabelas separadas)
- ✅ Agora: `viagem_veiculo` (1 tabela com placa + motorista)

**Benefícios**:
- Menos JOINs
- Queries mais rápidas
- Código mais simples
- Melhor rastreabilidade (quem alterou o quê)

### 2. **Auditoria completa**
Novos campos em todas as tabelas:
- `criado_em` / `importado_em`: quando o registro foi criado
- `atualizado_em`: última modificação
- `atualizado_por` / `registrado_por`: quem fez a alteração

### 3. **Constraints e validações**
- `CHECK (quantidade >= 1)`: quantidade sempre positiva
- `CHECK (doca IN ('1','2','3','4'))`: doca sempre válida
- `CHECK (status IN (...))`: status sempre um dos permitidos
- `NOT NULL`: campos obrigatórios bem definidos
- `DEFAULT`: valores padrão adequados

### 4. **Índices otimizados**
Novos índices para acelerar queries:
- `idx_produtos_bipados_data` (para relatórios por período)
- `idx_produtos_bipados_status` (filtrar por status)
- `idx_produtos_bipados_doca` (consultas por doca)
- Índices parciais (`WHERE doca IS NOT NULL`) economizam espaço

### 5. **Views prontas** (Postgres/Supabase)
- `v_resumo_viagem`: estatísticas automáticas por viagem
- `v_divergencias`: itens com falta/sobra (relatório instantâneo)

### 6. **Compatibilidade dual**
O mesmo código funciona com:
- **SQLite** (local, desenvolvimento)
- **Postgres** (Supabase, produção)

Camada `CompatConn` traduz queries automaticamente.

### 7. **Triggers automáticos** (Postgres)
Timestamp `atualizado_em` atualiza sozinho a cada UPDATE.

---

## 🔄 Mudanças no Código

### `app.py`

#### Camada de banco
```python
# Antes
conn = sqlite3.connect(DB_NAME)

# Depois
conn = get_db()  # Retorna SQLite ou Postgres conforme DATABASE_URL
```

#### Queries (UPSERT)
```python
# Antes (SQLite only)
INSERT OR REPLACE INTO viagem_motorista (id_viagem, motorista) VALUES (?, ?)

# Depois (SQLite + Postgres)
INSERT INTO viagem_veiculo (id_viagem, motorista) VALUES (?, ?)
ON CONFLICT (id_viagem) DO UPDATE SET motorista = excluded.motorista
```

#### Consultas unificadas
```python
# Antes (2 queries)
row_m = conn.execute('SELECT motorista FROM viagem_motorista WHERE id_viagem = ?', (id,)).fetchone()
row_p = conn.execute('SELECT placa FROM viagem_placa WHERE id_viagem = ?', (id,)).fetchone()

# Depois (1 query)
row_v = conn.execute('SELECT placa, motorista FROM viagem_veiculo WHERE id_viagem = ?', (id,)).fetchone()
```

---

## 📁 Novos Arquivos

- `supabase/schema.sql` - Schema Postgres completo
- `scripts/migrate_sqlite_to_supabase.py` - Migração de dados
- `.env.example` - Template de variáveis de ambiente
- `.gitignore` - Arquivos ignorados pelo Git
- `render.yaml` - Configuração de deploy
- `DEPLOY.md` - Guia completo de deploy
- `QUICK_START.md` - Checklist rápido
- `SCHEMA_REFERENCE.md` - Documentação das tabelas
- `config_usuarios.example.py` - Template de usuários

---

## 🔐 Segurança

### Antes
- Secret key fixa no código
- Sem suporte a variáveis de ambiente
- Senhas versionadas (config_usuarios.py)

### Depois
- Secret key via `SECRET_KEY` (ambiente)
- Suporte a `.env` (dotenv)
- `.gitignore` protege senhas e dados sensíveis
- Preparado para RLS (Row Level Security) no Supabase

---

## 🎨 Melhorias de Performance

### Bipagem mais rápida
- Agrupamento por código (menos linhas)
- Atualização otimista (não trava o leitor)
- Debounce de estatísticas (menos requisições)
- Cancelamento de buscas antigas (AbortController)
- `keepalive` e `priority: high` no POST

### Queries otimizadas
- Índices compostos (`id_viagem, codigo_barras`)
- Índices parciais (filtra null)
- Views pré-calculadas (Postgres)

---

## 📦 Tabelas do Schema Novo

```
usuarios (login)
  ├── id, usuario, senha_hash
  ├── ativo, criado_em, atualizado_em
  └── [índice único: usuario]

produtos_bipados (bipagem)
  ├── id, codigo_barras, codigo_interno, produto
  ├── quantidade, unidade, peso
  ├── id_viagem, doca, veiculo, status
  ├── data_hora, usuario_bipagem, criado_em
  └── [6 índices otimizados]

viagem_veiculo (placa + motorista) ⭐ UNIFICADA
  ├── id_viagem [PK]
  ├── placa, motorista
  └── atualizado_em, atualizado_por

viagem_responsaveis (equipe)
  ├── id_viagem [PK]
  ├── coordenador, conferente, ajudante1, ajudante2
  └── atualizado_em, atualizado_por

divergencia_motivo (justificativas)
  ├── id_viagem, codigo_produto [PK composta]
  ├── motivo
  └── registrado_em, registrado_por

romaneio (cache de quantidades)
  ├── id, codigo_barras [único]
  └── quantidade_romaneio, atualizado_em
```

---

## ⚙️ Compatibilidade

- ✅ **Windows**: funciona (SQLite local)
- ✅ **Linux/Render**: funciona (Postgres/Supabase)
- ✅ **Desenvolvimento local**: SQLite (sem configurar nada)
- ✅ **Produção**: Postgres (configurar DATABASE_URL)

---

## 🚦 Status

- [x] Schema reorganizado e documentado
- [x] Tabelas unificadas (viagem_veiculo)
- [x] Auditoria implementada
- [x] Compatibilidade SQLite + Postgres
- [x] Script de migração de dados
- [x] Arquivos de deploy (render.yaml, .gitignore, .env.example)
- [x] Documentação completa (README, DEPLOY, QUICK_START, SCHEMA_REFERENCE)
- [ ] Inicializar Git e push para GitHub (aguardando ação do usuário)
- [ ] Deploy no Render (aguardando ação do usuário)

---

**Versão**: 2.0 (Schema reorganizado)  
**Data**: 05/03/2026  
**Autor**: Sistema atualizado para produção
