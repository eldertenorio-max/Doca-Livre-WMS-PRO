-- ============================================================
-- Schema Postgres (Supabase) - Controle de Carregamento
-- ============================================================
-- Execute no SQL Editor do Supabase (projeto -> SQL Editor)
-- ============================================================

-- Extensões úteis
create extension if not exists pgcrypto;

-- ============================================================
-- 1. TABELA DE USUÁRIOS (autenticação e auditoria)
-- ============================================================

create table if not exists public.usuarios (
  id bigserial primary key,
  usuario text not null unique,
  senha_hash text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.usuarios is 'Usuários do sistema (login e controle de acesso)';
comment on column public.usuarios.ativo is 'Se false, usuário não pode fazer login';

create index if not exists idx_usuarios_usuario on public.usuarios (usuario) where ativo = true;

-- ============================================================
-- 1.1. TABELA DE COLABORADORES (motoristas, conferentes, etc.)
-- ============================================================

create table if not exists public.colaboradores (
  id bigserial primary key,
  nome text not null,
  funcao text,
  centro_custo text,
  tipo text,
  cpf text,
  telefone text,
  email text,
  ativo boolean not null default true,
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por text,
  atualizado_por text
);

comment on table public.colaboradores is 'Cadastro de colaboradores (motoristas, conferentes, coordenadores, ajudantes)';
comment on column public.colaboradores.funcao is 'Ex: Motorista, Conferente, Ajudante, Coordenador';
comment on column public.colaboradores.centro_custo is 'Ex: TRANSPORTE GRU, TRANSPORTE PPY';
comment on column public.colaboradores.tipo is 'Classificação: MOTORISTA, CONFERENTE, AJUDANTE, COORDENADOR';
comment on column public.colaboradores.ativo is 'Se false, não aparece nas listas de seleção';

create index if not exists idx_colaboradores_nome on public.colaboradores (nome) where ativo = true;
create index if not exists idx_colaboradores_tipo on public.colaboradores (tipo) where ativo = true and tipo is not null;
create index if not exists idx_colaboradores_funcao on public.colaboradores (funcao) where ativo = true and funcao is not null;
create unique index if not exists idx_colaboradores_cpf on public.colaboradores (cpf) where cpf is not null and cpf != '';

-- ============================================================
-- 2. TABELAS DE VIAGEM (roteiro/carregamento)
-- ============================================================

-- Placa da viagem (override manual)
create table if not exists public.viagem_placa (
  id_viagem text primary key,
  placa text not null,
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);

comment on table public.viagem_placa is 'Override de placa por viagem (sobrescreve dados da planilha)';
comment on column public.viagem_placa.atualizado_por is 'Usuário que fez a alteração';

create index if not exists idx_viagem_placa_placa on public.viagem_placa (placa);

-- Motorista da viagem (override manual)
create table if not exists public.viagem_motorista (
  id_viagem text primary key,
  motorista text not null,
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);

comment on table public.viagem_motorista is 'Override de motorista por viagem (sobrescreve dados da planilha)';
comment on column public.viagem_motorista.atualizado_por is 'Usuário que fez a alteração';

create index if not exists idx_viagem_motorista_motorista on public.viagem_motorista (motorista);

-- Responsáveis pela operação de carregamento
create table if not exists public.viagem_responsaveis (
  id_viagem text primary key,
  coordenador text not null default 'ASTROGILDO RODRIGUES DOS SANTOS',
  conferente text,
  ajudante1 text,
  ajudante2 text,
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);

comment on table public.viagem_responsaveis is 'Equipe responsável pelo carregamento de cada viagem';

-- Motivos de divergência por item
create table if not exists public.divergencia_motivo (
  id_viagem text not null,
  codigo_produto text not null,
  motivo text,
  registrado_em timestamptz not null default now(),
  registrado_por text,
  primary key (id_viagem, codigo_produto)
);

comment on table public.divergencia_motivo is 'Justificativa de divergências (falta/sobra) por item e viagem';

create index if not exists idx_divergencia_id_viagem on public.divergencia_motivo (id_viagem);

-- ============================================================
-- 3. PRODUTOS BIPADOS (registro de bipagem)
-- ============================================================

create table if not exists public.produtos_bipados (
  id bigserial primary key,
  
  -- Identificação do produto
  codigo_barras text not null,
  codigo_interno text,
  codigo_dun text,
  produto text not null,
  
  -- Quantidade e unidade
  quantidade integer not null check (quantidade >= 1),
  unidade text,
  peso text,
  
  -- Contexto da bipagem
  id_viagem text not null,
  doca text check (doca in ('1', '2', '3', '4')),
  veiculo text,
  status text not null default 'PENDENTE' check (status in ('PENDENTE', 'CARREGADO', 'CANCELADO')),
  
  -- Auditoria
  data_hora timestamptz not null default now(),
  usuario_bipagem text,
  
  -- Metadados
  criado_em timestamptz not null default now()
);

comment on table public.produtos_bipados is 'Registro de cada bipagem realizada no sistema';
comment on column public.produtos_bipados.codigo_barras is 'EAN ou DUN escaneado';
comment on column public.produtos_bipados.codigo_interno is 'Código do produto (da aba BASE)';
comment on column public.produtos_bipados.doca is 'Doca onde foi realizada a bipagem (1-4)';
comment on column public.produtos_bipados.usuario_bipagem is 'Usuário logado no momento da bipagem';

-- Índices otimizados para consultas frequentes
create index if not exists idx_produtos_bipados_id_viagem on public.produtos_bipados (id_viagem);
create index if not exists idx_produtos_bipados_codigo_barras on public.produtos_bipados (codigo_barras);
create index if not exists idx_produtos_bipados_viagem_codigo on public.produtos_bipados (id_viagem, codigo_barras);
create index if not exists idx_produtos_bipados_data on public.produtos_bipados (data_hora desc);
create index if not exists idx_produtos_bipados_status on public.produtos_bipados (status);
create index if not exists idx_produtos_bipados_doca on public.produtos_bipados (doca) where doca is not null;

-- ============================================================
-- 4. ROMANEIO (controle de quantidades esperadas - opcional)
-- ============================================================

create table if not exists public.romaneio (
  id bigserial primary key,
  codigo_barras text not null unique,
  quantidade_romaneio integer not null default 0,
  atualizado_em timestamptz not null default now()
);

comment on table public.romaneio is 'Quantidade esperada por código de barras (cache/controle)';

-- ============================================================
-- 5. DATASET DE IMPORTAÇÃO (planilha Excel)
-- ============================================================
-- excel_datasets: controle de "versões" de cada importação.
-- Cada vez que você importa uma planilha (BASE, romaneio etc.),
-- é criado um registro com um dataset_id (UUID). As tabelas
-- base_codigo_barras e excel_romaneio_por_item referenciam esse
-- dataset_id, assim o sistema sabe qual versão da planilha usar.
-- Apenas um dataset fica "ativo" (ativo = true); o script de
-- importação desativa os antigos e ativa o novo.
-- ============================================================

create table if not exists public.excel_datasets (
  dataset_id uuid primary key default gen_random_uuid(),
  arquivo_nome text,
  tamanho_bytes bigint,
  checksum text,
  importado_em timestamptz not null default now(),
  importado_por text,
  ativo boolean not null default true
);

comment on table public.excel_datasets is 'Controle de versões de planilhas importadas';
comment on column public.excel_datasets.ativo is 'Dataset ativo (o mais recente). Só um deve estar ativo por vez.';

create index if not exists idx_excel_datasets_ativo on public.excel_datasets (ativo) where ativo = true;
create index if not exists idx_excel_datasets_importado on public.excel_datasets (importado_em desc);

-- Aba BASE (cadastro de produtos / base de código de barras)
create table if not exists public.base_codigo_barras (
  id bigserial primary key,
  dataset_id uuid not null references public.excel_datasets(dataset_id) on delete cascade,
  row_index integer not null,

  -- Campos principais (indexados)
  codigo_interno text,
  ean text,
  dun text,
  descricao text,
  unidade text,
  peso text,

  -- Dados completos em JSONB (flexível)
  data jsonb not null,

  importado_em timestamptz not null default now()
);

comment on table public.base_codigo_barras is 'Base de código de barras (aba BASE da planilha - cadastro de produtos)';

create index if not exists idx_base_codigo_barras_dataset on public.base_codigo_barras (dataset_id);
create index if not exists idx_base_codigo_barras_codigo_interno on public.base_codigo_barras (codigo_interno) where codigo_interno is not null;
create index if not exists idx_base_codigo_barras_ean on public.base_codigo_barras (ean) where ean is not null;
create index if not exists idx_base_codigo_barras_dun on public.base_codigo_barras (dun) where dun is not null;

-- Aba ROMANEIO POR ITEM (itens por viagem/roteiro)
create table if not exists public.excel_romaneio_por_item (
  id bigserial primary key,
  dataset_id uuid not null references public.excel_datasets(dataset_id) on delete cascade,
  row_index integer not null,
  
  -- Campos principais (indexados)
  id_roteiro text,
  id_viagem text,
  codigo_produto text,
  descricao text,
  quantidade integer,
  unidade text,
  peso_bruto text,
  codigo_cliente text,
  endereco text,
  cidade text,
  placa text,
  motorista text,
  data_expedicao text,
  
  -- Dados completos em JSONB
  data jsonb not null,
  
  importado_em timestamptz not null default now()
);

comment on table public.excel_romaneio_por_item is 'Aba ROMANEIO POR ITEM da planilha (itens por viagem)';

create index if not exists idx_excel_romaneio_dataset on public.excel_romaneio_por_item (dataset_id);
create index if not exists idx_excel_romaneio_id_roteiro on public.excel_romaneio_por_item (id_roteiro) where id_roteiro is not null;
create index if not exists idx_excel_romaneio_id_viagem on public.excel_romaneio_por_item (id_viagem) where id_viagem is not null;
create index if not exists idx_excel_romaneio_codigo_produto on public.excel_romaneio_por_item (codigo_produto) where codigo_produto is not null;
create index if not exists idx_excel_romaneio_roteiro_codigo on public.excel_romaneio_por_item (id_roteiro, codigo_produto);

-- ============================================================
-- 6. TRIGGERS (atualização automática de timestamps)
-- ============================================================

create or replace function atualizar_timestamp_modificacao()
returns trigger as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$ language plpgsql;

create trigger trigger_usuarios_timestamp
  before update on public.usuarios
  for each row
  execute function atualizar_timestamp_modificacao();

create trigger trigger_viagem_placa_timestamp
  before update on public.viagem_placa
  for each row
  execute function atualizar_timestamp_modificacao();

create trigger trigger_viagem_motorista_timestamp
  before update on public.viagem_motorista
  for each row
  execute function atualizar_timestamp_modificacao();

create trigger trigger_viagem_responsaveis_timestamp
  before update on public.viagem_responsaveis
  for each row
  execute function atualizar_timestamp_modificacao();

-- ============================================================
-- 7. VIEWS ÚTEIS (relatórios e consultas frequentes)
-- ============================================================

-- View: resumo de bipagem por viagem
create or replace view public.v_resumo_viagem as
select
  id_viagem,
  count(*) as total_registros,
  sum(quantidade) as total_quantidade,
  count(distinct codigo_barras) as produtos_unicos,
  min(data_hora) as inicio_carregamento,
  max(data_hora) as fim_carregamento,
  extract(epoch from (max(data_hora) - min(data_hora))) / 60 as duracao_minutos,
  count(*) filter (where status = 'CARREGADO') as itens_carregados,
  count(*) filter (where status = 'PENDENTE') as itens_pendentes
from public.produtos_bipados
group by id_viagem;

comment on view public.v_resumo_viagem is 'Resumo estatístico de bipagem por viagem';

-- View: itens divergentes (para auditoria)
create or replace view public.v_divergencias as
select
  r.id_roteiro as id_viagem,
  r.codigo_produto,
  r.descricao as produto,
  sum(r.quantidade) as quantidade_esperada,
  coalesce(sum(b.quantidade), 0) as quantidade_bipada,
  sum(r.quantidade) - coalesce(sum(b.quantidade), 0) as divergencia,
  dm.motivo
from public.excel_romaneio_por_item r
left join public.produtos_bipados b
  on r.id_roteiro = b.id_viagem
  and r.codigo_produto = b.codigo_interno
left join public.divergencia_motivo dm
  on r.id_roteiro = dm.id_viagem
  and r.codigo_produto = dm.codigo_produto
where r.dataset_id = (
  select dataset_id
  from public.excel_datasets
  where ativo = true
  order by importado_em desc
  limit 1
)
group by r.id_roteiro, r.codigo_produto, r.descricao, dm.motivo
having sum(r.quantidade) - coalesce(sum(b.quantidade), 0) != 0;

comment on view public.v_divergencias is 'Itens com divergência entre romaneio e bipagem (falta/sobra)';

-- ============================================================
-- 8. POLÍTICAS DE SEGURANÇA (RLS - Row Level Security)
-- ============================================================
-- Descomente se quiser habilitar RLS no Supabase

-- alter table public.usuarios enable row level security;
-- alter table public.produtos_bipados enable row level security;
-- alter table public.viagem_veiculo enable row level security;
-- alter table public.viagem_responsaveis enable row level security;
-- alter table public.divergencia_motivo enable row level security;

-- Exemplo de política: permitir leitura para todos autenticados
-- create policy "Permitir leitura para autenticados"
--   on public.produtos_bipados
--   for select
--   using (auth.role() = 'authenticated');

-- ============================================================
-- FIM DO SCHEMA
-- ============================================================
