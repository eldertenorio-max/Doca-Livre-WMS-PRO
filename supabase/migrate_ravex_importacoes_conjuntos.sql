-- Cria tabela ravex_importacoes quando a tabela de datasets se chama conjuntos_de_dados_excel.
-- Use este script no Supabase SQL Editor se a tabela "excel_datasets" não existir.

-- Coluna importado_em no romaneio_por_item
alter table public.romaneio_por_item add column if not exists importado_em timestamptz;

-- Tabela de histórico (FK para conjuntos_de_dados_excel)
create table if not exists public.ravex_importacoes (
  id bigserial primary key,
  dataset_id uuid references public.conjuntos_de_dados_excel(dataset_id) on delete set null,
  tipo text not null,
  status text not null default 'OK',
  parametros jsonb,
  viagens_processadas integer not null default 0,
  total_itens integer not null default 0,
  usuario text,
  erros jsonb,
  criado_em timestamptz not null default now()
);

create index if not exists idx_ravex_importacoes_dataset on public.ravex_importacoes (dataset_id);
create index if not exists idx_ravex_importacoes_criado_em on public.ravex_importacoes (criado_em desc);

alter table public.ravex_importacoes enable row level security;

drop policy if exists "Permitir SELECT em ravex_importacoes" on public.ravex_importacoes;
drop policy if exists "Permitir INSERT em ravex_importacoes" on public.ravex_importacoes;
drop policy if exists "Permitir UPDATE em ravex_importacoes" on public.ravex_importacoes;
drop policy if exists "Permitir DELETE em ravex_importacoes" on public.ravex_importacoes;

create policy "Permitir SELECT em ravex_importacoes"
  on public.ravex_importacoes for select using (true);
create policy "Permitir INSERT em ravex_importacoes"
  on public.ravex_importacoes for insert with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
create policy "Permitir UPDATE em ravex_importacoes"
  on public.ravex_importacoes for update using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
create policy "Permitir DELETE em ravex_importacoes"
  on public.ravex_importacoes for delete using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
