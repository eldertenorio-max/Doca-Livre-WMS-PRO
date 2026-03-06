# 📥 Guia: Preencher todas as tabelas no Supabase

Execute **nesta ordem exata** no SQL Editor do Supabase.

---

## ✅ ETAPA 1: Criar as tabelas (se ainda não criou)

Copie e execute cada arquivo **um por um**:

```
1. create_table_usuarios.sql
2. create_table_colaboradores.sql
3. create_table_motoristas.sql
4. create_table_placas.sql
5. create_table_viagem_placa.sql
6. create_table_viagem_motorista.sql
7. create_table_viagem_responsaveis.sql
8. create_table_divergencia_motivo.sql
9. create_table_produtos_bipados.sql
```

**Ou execute tudo de uma vez**: `schema.sql`

---

## 📥 ETAPA 2: Preencher com dados

Execute nesta ordem:

### 1️⃣ Usuários (4 usuários)
📄 **`insert_usuarios_data.sql`**

Contém:
- admin / admin
- Diego / Diego
- Elder / Elder123
- astro / 175940

### 2️⃣ Colaboradores (16 pessoas)
📄 **`insert_colaboradores_data.sql`**

Contém:
- 11 Ajudantes
- 2 Conferentes
- 2 Coordenadores
- 1 Operador

### 3️⃣ Motoristas (44 motoristas)
📄 **`insert_motoristas_data.sql`**

Contém:
- 41 motoristas TRANSPORTE GRU
- 3 motoristas TRANSPORTE PPY

### 4️⃣ Placas (38 veículos)
📄 **`insert_placas_data.sql`**

Contém:
- Placas com capacidade (4200kg, 4500kg, etc.)

---

## 🔒 ETAPA 3: Remover UNRESTRICTED

Execute **APÓS** popular os dados:

### 1️⃣ Tabelas
📄 **`enable_rls_policies.sql`**

Remove UNRESTRICTED de:
- usuarios, colaboradores, motoristas, placas
- produtos_bipados, viagem_*, divergencia_motivo
- excel_* (todas as tabelas da planilha)

### 2️⃣ Views
📄 **`enable_rls_views.sql`**

Remove UNRESTRICTED de:
- v_divergencias
- v_resumo_viagem

---

## 🎯 Checklist de execução

Marque conforme executar:

### Criar tabelas
- [ ] Todas as 9 tabelas criadas

### Popular dados
- [ ] insert_usuarios_data.sql (4 usuários)
- [ ] insert_colaboradores_data.sql (16 colaboradores)
- [ ] insert_motoristas_data.sql (44 motoristas)
- [ ] insert_placas_data.sql (38 placas)

### Segurança
- [ ] enable_rls_policies.sql (tabelas)
- [ ] enable_rls_views.sql (views)

---

## ✅ Resultado final esperado

Após executar tudo, você terá:

| Tabela | Registros | Status |
|--------|-----------|--------|
| usuarios | 4 | Sem UNRESTRICTED |
| colaboradores | 16 | Sem UNRESTRICTED |
| motoristas | 44 | Sem UNRESTRICTED |
| placas | 38 | Sem UNRESTRICTED |
| viagem_* | 0 (vazias) | Sem UNRESTRICTED |
| divergencia_motivo | 0 (vazia) | Sem UNRESTRICTED |
| produtos_bipados | 0 (vazia) | Sem UNRESTRICTED |
| v_divergencias | (view) | Sem UNRESTRICTED |
| v_resumo_viagem | (view) | Sem UNRESTRICTED |

---

## 🚀 Próximo passo

Depois de preencher tudo: **Configurar o Render** (DATABASE_URL, SECRET_KEY, etc.)

Consulte: `DEPLOY.md` ou `QUICK_START.md`
