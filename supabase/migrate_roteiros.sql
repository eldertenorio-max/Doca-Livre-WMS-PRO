-- Cria a tabela roteiros para registrar os roteiros da API Ravex (obter-roteiro-por-periodo).
-- Execute no Supabase (SQL Editor) se a tabela ainda não existir.
-- O app também cria a tabela ao iniciar (init_db) quando usa Postgres.

create table if not exists public.roteiros (
  dataset_id uuid not null references public.excel_datasets(dataset_id) on delete cascade,
  id_roteiro text not null,
  id_viagem text not null,
  identificador_rota text,
  data_viagem timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (dataset_id, id_roteiro)
);

comment on table public.roteiros is 'Roteiros obtidos da API Ravex (obter-roteiro-por-periodo) para o dataset ativo';

create index if not exists idx_roteiros_dataset on public.roteiros (dataset_id);
create index if not exists idx_roteiros_id_viagem on public.roteiros (id_viagem) where id_viagem is not null;
