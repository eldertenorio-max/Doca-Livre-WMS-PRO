-- RLS em romaneio_por_item (remove "SEM RESTRIÇÕES" no painel Supabase)
-- Execute no SQL Editor do projeto Sistema WMS.

alter table public.romaneio_por_item enable row level security;

drop policy if exists "Permitir SELECT em romaneio_por_item" on public.romaneio_por_item;
drop policy if exists "Permitir INSERT em romaneio_por_item" on public.romaneio_por_item;
drop policy if exists "Permitir UPDATE em romaneio_por_item" on public.romaneio_por_item;
drop policy if exists "Permitir DELETE em romaneio_por_item" on public.romaneio_por_item;
drop policy if exists "Permitir SELECT em excel_romaneio_por_item" on public.romaneio_por_item;
drop policy if exists "Permitir INSERT em excel_romaneio_por_item" on public.romaneio_por_item;
drop policy if exists "Permitir UPDATE em excel_romaneio_por_item" on public.romaneio_por_item;
drop policy if exists "Permitir DELETE em excel_romaneio_por_item" on public.romaneio_por_item;

create policy "Permitir SELECT em romaneio_por_item"
  on public.romaneio_por_item for select using (true);

create policy "Permitir INSERT em romaneio_por_item"
  on public.romaneio_por_item for insert
  with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

create policy "Permitir UPDATE em romaneio_por_item"
  on public.romaneio_por_item for update
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

create policy "Permitir DELETE em romaneio_por_item"
  on public.romaneio_por_item for delete
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
