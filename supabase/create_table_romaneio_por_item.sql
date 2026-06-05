-- Romaneio por item (Ravex / conferência) — tabela operacional usada pelo app.
-- Execute no Supabase NOVO após schema.sql e antes de migrate_ravex_importacoes.sql

create table if not exists public.romaneio_por_item (
  dataset_id uuid not null references public.excel_datasets(dataset_id) on delete cascade,
  row_index integer not null,
  id_roteiro text,
  id_viagem text,
  identificador_rota text,
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
  importado_em timestamptz,
  data jsonb not null default '{}'::jsonb,
  primary key (dataset_id, row_index)
);

comment on table public.romaneio_por_item is 'Romaneio por item (Ravex e conferência — dataset ativo)';

create index if not exists idx_romaneio_por_item_dataset_viagem on public.romaneio_por_item (dataset_id, id_viagem);
create index if not exists idx_romaneio_por_item_dataset_roteiro on public.romaneio_por_item (dataset_id, id_roteiro);
create index if not exists idx_romaneio_por_item_row_index on public.romaneio_por_item (dataset_id, row_index);
create index if not exists idx_romaneio_por_item_codigo_produto on public.romaneio_por_item (codigo_produto) where codigo_produto is not null;
