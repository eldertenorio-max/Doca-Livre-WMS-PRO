-- Cria a tabela id_roteiros para registrar os roteiros da API Ravex (obter-roteiro-por-periodo).
-- Remove o aviso UNRESTRICTED habilitando RLS (Row Level Security).
-- Execute no Supabase (SQL Editor) se a tabela ainda não existir.
-- O app também cria a tabela ao iniciar (init_db) quando usa Postgres.

create table if not exists public.id_roteiros (
  dataset_id uuid not null references public.excel_datasets(dataset_id) on delete cascade,
  id_roteiro text not null,
  id_viagem text not null,
  identificador_rota text,
  data_viagem timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (dataset_id, id_roteiro)
);

comment on table public.id_roteiros is 'Roteiros obtidos da API Ravex (obter-roteiro-por-periodo) para o dataset ativo';

create index if not exists idx_id_roteiros_dataset on public.id_roteiros (dataset_id);
create index if not exists idx_id_roteiros_id_viagem on public.id_roteiros (id_viagem) where id_viagem is not null;

-- Habilitar RLS para remover o aviso UNRESTRICTED
alter table public.id_roteiros enable row level security;

create policy "Permitir SELECT em id_roteiros"
  on public.id_roteiros for select using (true);
create policy "Permitir INSERT em id_roteiros"
  on public.id_roteiros for insert with check (true);
create policy "Permitir UPDATE em id_roteiros"
  on public.id_roteiros for update using (true);
create policy "Permitir DELETE em id_roteiros"
  on public.id_roteiros for delete using (true);
