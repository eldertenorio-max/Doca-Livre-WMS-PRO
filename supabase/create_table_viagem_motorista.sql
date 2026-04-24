-- ============================================================
-- CRIAR TABELA: viagem_motorista
-- ============================================================
-- Execute este arquivo no SQL Editor do Supabase
-- ============================================================

-- Remover tabela se já existir (opcional - use com cuidado)
-- drop table if exists public.viagem_motorista cascade;

-- Criar tabela viagem_motorista
create table if not exists public.viagem_motorista (
  id_viagem text primary key,
  motorista text not null,
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);

-- Comentários (documentação)
comment on table public.viagem_motorista is 'Override de motorista por viagem (sobrescreve dados da planilha)';
comment on column public.viagem_motorista.id_viagem is 'ID do roteiro (chave primária)';
comment on column public.viagem_motorista.motorista is 'Nome do motorista (override manual)';
comment on column public.viagem_motorista.atualizado_em is 'Última modificação';
comment on column public.viagem_motorista.atualizado_por is 'Usuário que fez a alteração';

-- Índices
create index if not exists idx_viagem_motorista_motorista on public.viagem_motorista (motorista);

-- Trigger para atualizar timestamp automaticamente
create or replace function atualizar_viagem_motorista_timestamp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

create trigger trigger_viagem_motorista_timestamp
  before update on public.viagem_motorista
  for each row
  execute function atualizar_viagem_motorista_timestamp();

-- ============================================================
-- Pronto! Tabela viagem_motorista criada
-- ============================================================
