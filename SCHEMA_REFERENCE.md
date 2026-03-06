# 📊 Referência do Schema do Banco de Dados

## Estrutura das Tabelas (Nova Organização)

### 🔐 `usuarios`
Controle de acesso e autenticação

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | BIGSERIAL | ID único do usuário |
| `usuario` | TEXT | Nome de usuário (único) |
| `senha_hash` | TEXT | Senha em hash (pbkdf2:sha256) |
| `ativo` | BOOLEAN | Se false, não pode fazer login |
| `criado_em` | TIMESTAMPTZ | Data de criação |
| `atualizado_em` | TIMESTAMPTZ | Última atualização |

**Índices**: `usuario` (único)

---

### 👷 `colaboradores`
Cadastro de motoristas, conferentes, coordenadores e ajudantes

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | BIGSERIAL | ID único |
| `nome` | TEXT | Nome completo (obrigatório) |
| `funcao` | TEXT | Ex: Motorista, Conferente, Ajudante |
| `centro_custo` | TEXT | Ex: TRANSPORTE GRU, TRANSPORTE PPY |
| `tipo` | TEXT | MOTORISTA / CONFERENTE / AJUDANTE / COORDENADOR |
| `cpf` | TEXT | CPF (único) |
| `telefone` | TEXT | Telefone de contato |
| `email` | TEXT | E-mail |
| `ativo` | BOOLEAN | Se false, não aparece nas listas |
| `observacoes` | TEXT | Notas adicionais |
| `criado_em` | TIMESTAMPTZ | Data de cadastro |
| `atualizado_em` | TIMESTAMPTZ | Última modificação |
| `criado_por` | TEXT | Usuário que cadastrou |
| `atualizado_por` | TEXT | Usuário que alterou |

**Índices**:
- `nome` (where ativo = true)
- `tipo` (where ativo = true)
- `cpf` (único, where not null)

**Rotas da API**:
- `GET /api/colaboradores?tipo=MOTORISTA` — listar
- `POST /api/colaboradores` — adicionar
- `PUT /api/colaboradores/<id>` — editar
- `DELETE /api/colaboradores/<id>` — desativar (soft delete)
- `POST /api/colaboradores/importar-planilha` — sincronizar com Excel

---

### 📦 `produtos_bipados`
Registro de cada bipagem realizada

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | BIGSERIAL | ID único do registro |
| `codigo_barras` | TEXT | EAN ou DUN escaneado |
| `codigo_interno` | TEXT | Código do produto (da planilha) |
| `codigo_dun` | TEXT | Código DUN (se aplicável) |
| `produto` | TEXT | Descrição do produto |
| `quantidade` | INTEGER | Quantidade bipada (≥1) |
| `unidade` | TEXT | Unidade: Pacote, Caixa, UN |
| `peso` | TEXT | Peso unitário |
| `id_viagem` | TEXT | ID do roteiro (obrigatório) |
| `doca` | TEXT | Doca onde foi bipado (1-4) |
| `veiculo` | TEXT | Placa do veículo (opcional) |
| `status` | TEXT | PENDENTE / CARREGADO / CANCELADO |
| `data_hora` | TIMESTAMPTZ | Momento da bipagem |
| `usuario_bipagem` | TEXT | Quem fez a bipagem |
| `criado_em` | TIMESTAMPTZ | Data de criação do registro |

**Índices**:
- `id_viagem`
- `codigo_barras`
- `(id_viagem, codigo_barras)`
- `data_hora DESC`
- `status`
- `doca` (where not null)

---

### 🚛 `viagem_veiculo` (UNIFICADA)
Override de placa e motorista por viagem

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id_viagem` | TEXT | ID do roteiro (PK) |
| `placa` | TEXT | Placa do veículo (override) |
| `motorista` | TEXT | Nome do motorista (override) |
| `atualizado_em` | TIMESTAMPTZ | Última modificação |
| `atualizado_por` | TEXT | Usuário que alterou |

**⚠️ Mudança importante**: Antes eram **duas tabelas** (`viagem_motorista` + `viagem_placa`). Agora é **uma só**.

---

### 👥 `viagem_responsaveis`
Equipe responsável pelo carregamento

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id_viagem` | TEXT | ID do roteiro (PK) |
| `coordenador` | TEXT | Nome do coordenador (padrão: Astrogildo) |
| `conferente` | TEXT | Nome do conferente |
| `ajudante1` | TEXT | Auxiliar de carregamento 1 |
| `ajudante2` | TEXT | Auxiliar de carregamento 2 |
| `atualizado_em` | TIMESTAMPTZ | Última modificação |
| `atualizado_por` | TEXT | Usuário que alterou |

---

### ⚠️ `divergencia_motivo`
Justificativa de divergências (falta/sobra)

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id_viagem` | TEXT | ID do roteiro |
| `codigo_produto` | TEXT | Código do produto |
| `motivo` | TEXT | Justificativa da divergência |
| `registrado_em` | TIMESTAMPTZ | Quando foi registrado |
| `registrado_por` | TEXT | Usuário que registrou |

**PK Composta**: `(id_viagem, codigo_produto)`

**Índice**: `id_viagem`

---

### 📋 `romaneio` (opcional)
Cache de quantidades esperadas

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | BIGSERIAL | ID único |
| `codigo_barras` | TEXT | Código de barras (único) |
| `quantidade_romaneio` | INTEGER | Quantidade esperada |
| `atualizado_em` | TIMESTAMPTZ | Última atualização |

---

## 📊 Views (Relatórios prontos - somente Postgres)

### `v_resumo_viagem`
Estatísticas por viagem (automática)

```sql
select * from public.v_resumo_viagem where id_viagem = 'EBB1A500';
```

Retorna:
- Total de registros
- Total de quantidade
- Produtos únicos
- Início/fim do carregamento
- Duração em minutos
- Itens carregados vs pendentes

### `v_divergencias`
Itens com diferença entre romaneio e bipagem

```sql
select * from public.v_divergencias order by divergencia desc;
```

Retorna automaticamente itens com falta ou sobra.

---

## 🔍 Queries úteis

### Listar bipagens de hoje
```sql
select 
  codigo_barras, 
  produto, 
  quantidade, 
  id_viagem, 
  usuario_bipagem,
  data_hora
from public.produtos_bipados
where data_hora::date = current_date
order by data_hora desc;
```

### Viagens com divergência
```sql
select distinct id_viagem
from public.v_divergencias;
```

### Total bipado por doca (hoje)
```sql
select 
  doca, 
  count(*) as total_itens,
  sum(quantidade) as total_quantidade
from public.produtos_bipados
where data_hora::date = current_date
  and doca is not null
group by doca
order by doca;
```

### Tempo médio de carregamento
```sql
select 
  avg(duracao_minutos) as media_minutos
from public.v_resumo_viagem
where duracao_minutos > 0;
```

---

## 🔄 Migração SQLite → Postgres

### Diferenças importantes

| SQLite | Postgres | Mudança |
|--------|----------|---------|
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `BIGSERIAL PRIMARY KEY` | Auto-incremento |
| `?` | `%s` | Placeholder de query |
| `INSERT OR REPLACE` | `INSERT ... ON CONFLICT ... DO UPDATE` | Upsert |
| `TEXT` datetime | `TIMESTAMPTZ` | Timestamp com timezone |
| Sem `CHECK` | Com `CHECK` | Validação de dados |

### Compatibilidade

O `app.py` tem uma camada `CompatConn` que **traduz automaticamente** queries SQLite para Postgres, então **não precisa reescrever todas as queries**.

---

**Última atualização**: 05/03/2026
