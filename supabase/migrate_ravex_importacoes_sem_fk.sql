-- Cria tabela ravex_importacoes SEM chave estrangeira (funciona mesmo se a tabela de datasets tiver outro nome ou não existir).

-- Coluna importado_em no romaneio_por_item
alter table public.romaneio_por_item add column if not exists importado_em timestamptz;

-- Tabela de histórico (dataset_id sem FK)
create table if not exists public.ravex_importacoes (
  id bigserial primary key,
  dataset_id uuid,
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
