-- ============================================================
-- CRIAR TABELA: viagem_responsaveis
-- ============================================================
-- Execute este arquivo no SQL Editor do Supabase
-- ============================================================

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

-- Trigger
create or replace function atualizar_viagem_responsaveis_timestamp()
returns trigger as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$ language plpgsql;

create trigger trigger_viagem_responsaveis_timestamp
  before update on public.viagem_responsaveis
  for each row
  execute function atualizar_viagem_responsaveis_timestamp();
