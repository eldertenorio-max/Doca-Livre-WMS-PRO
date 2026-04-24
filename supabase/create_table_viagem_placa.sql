-- ============================================================
-- CRIAR TABELA: viagem_placa
-- ============================================================
-- Execute este arquivo no SQL Editor do Supabase
-- ============================================================

-- Remover tabela se já existir (opcional - use com cuidado)
-- drop table if exists public.viagem_placa cascade;

-- Criar tabela viagem_placa
create table if not exists public.viagem_placa (
  id_viagem text primary key,
  placa text not null,
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);

-- Comentários (documentação)
comment on table public.viagem_placa is 'Override de placa por viagem (sobrescreve dados da planilha)';
comment on column public.viagem_placa.id_viagem is 'ID do roteiro (chave primária)';
comment on column public.viagem_placa.placa is 'Placa do veículo (override manual)';
comment on column public.viagem_placa.atualizado_em is 'Última modificação';
comment on column public.viagem_placa.atualizado_por is 'Usuário que fez a alteração';

-- Índices
create index if not exists idx_viagem_placa_placa on public.viagem_placa (placa);

-- Trigger para atualizar timestamp automaticamente
create or replace function atualizar_viagem_placa_timestamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

create trigger trigger_viagem_placa_timestamp
  before update on public.viagem_placa
  for each row
  execute function atualizar_viagem_placa_timestamp();

-- ============================================================
-- Pronto! Tabela viagem_placa criada
-- ============================================================
