-- ============================================================
-- CRIAR TABELA: motoristas (cadastro de motoristas)
-- ============================================================
-- Execute este arquivo no SQL Editor do Supabase
-- ============================================================

create table if not exists public.motoristas (
  id bigserial primary key,
  nome text not null unique,
  cpf text,
  cnh text,
  categoria_cnh text,
  validade_cnh date,
  telefone text,
  email text,
  centro_custo text,
  ativo boolean not null default true,
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por text,
  atualizado_por text
);

comment on table public.motoristas is 'Cadastro de motoristas (colaboradores que dirigem)';
comment on column public.motoristas.nome is 'Nome completo do motorista (único)';
comment on column public.motoristas.cpf is 'CPF do motorista';
comment on column public.motoristas.cnh is 'Número da CNH';
comment on column public.motoristas.categoria_cnh is 'Ex: C, D, E';
comment on column public.motoristas.validade_cnh is 'Data de validade da CNH';
comment on column public.motoristas.centro_custo is 'Ex: TRANSPORTE GRU, TRANSPORTE PPY';
comment on column public.motoristas.ativo is 'Se false, não aparece nas listas';

-- Índices
create index if not exists idx_motoristas_nome on public.motoristas (nome) where ativo = true;
create unique index if not exists idx_motoristas_cpf on public.motoristas (cpf) where cpf is not null and cpf != '';
create index if not exists idx_motoristas_centro_custo on public.motoristas (centro_custo) where ativo = true;

-- Trigger
create or replace function atualizar_motoristas_timestamp()
returns trigger as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$ language plpgsql;

create trigger trigger_motoristas_timestamp
  before update on public.motoristas
  for each row
  execute function atualizar_motoristas_timestamp();

-- ============================================================
-- Pronto! Tabela motoristas criada
-- ============================================================
