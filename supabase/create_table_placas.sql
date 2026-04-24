-- ============================================================
-- CRIAR TABELA: placas (cadastro de veículos/placas)
-- ============================================================
-- Execute este arquivo no SQL Editor do Supabase
-- ============================================================

create table if not exists public.placas (
  id bigserial primary key,
  placa text not null unique,
  descricao text,
  tipo_veiculo text,
  capacidade_kg numeric(10,2),
  ano integer,
  marca text,
  modelo text,
  ativo boolean not null default true,
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por text,
  atualizado_por text
);

comment on table public.placas is 'Cadastro de veículos/placas da frota';
comment on column public.placas.placa is 'Placa do veículo (única)';
comment on column public.placas.descricao is 'Ex: Caminhão Baú, Carreta, Van';
comment on column public.placas.tipo_veiculo is 'Ex: CAMINHÃO, CARRETA, VAN, UTILITÁRIO';
comment on column public.placas.capacidade_kg is 'Capacidade de carga em kg';
comment on column public.placas.ativo is 'Se false, não aparece nas listas';

-- Índices
create unique index if not exists idx_placas_placa on public.placas (placa);
create index if not exists idx_placas_ativo on public.placas (ativo) where ativo = true;
create index if not exists idx_placas_tipo on public.placas (tipo_veiculo) where ativo = true;

-- Trigger
create or replace function atualizar_placas_timestamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

create trigger trigger_placas_timestamp
  before update on public.placas
  for each row
  execute function atualizar_placas_timestamp();

-- ============================================================
-- Pronto! Tabela placas criada
-- ============================================================
