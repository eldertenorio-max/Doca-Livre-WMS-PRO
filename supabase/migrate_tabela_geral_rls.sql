-- ============================================================
-- tabela_geral_* : habilitar RLS (remove UNRESTRICTED no Supabase)
-- ============================================================
-- Execute no SQL Editor DEPOIS de migrate_tabela_geral_dados.sql
-- Pode rodar mais de uma vez (idempotente).
-- ============================================================

alter table public.tabela_geral_dados enable row level security;
alter table public.tabela_geral_snapshot enable row level security;

-- tabela_geral_dados
drop policy if exists "Permitir SELECT em tabela_geral_dados" on public.tabela_geral_dados;
drop policy if exists "Permitir INSERT em tabela_geral_dados" on public.tabela_geral_dados;
drop policy if exists "Permitir UPDATE em tabela_geral_dados" on public.tabela_geral_dados;
drop policy if exists "Permitir DELETE em tabela_geral_dados" on public.tabela_geral_dados;

create policy "Permitir SELECT em tabela_geral_dados"
  on public.tabela_geral_dados for select using (true);
create policy "Permitir INSERT em tabela_geral_dados"
  on public.tabela_geral_dados for insert
  with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
create policy "Permitir UPDATE em tabela_geral_dados"
  on public.tabela_geral_dados for update
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
create policy "Permitir DELETE em tabela_geral_dados"
  on public.tabela_geral_dados for delete
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- tabela_geral_snapshot
drop policy if exists "Permitir SELECT em tabela_geral_snapshot" on public.tabela_geral_snapshot;
drop policy if exists "Permitir INSERT em tabela_geral_snapshot" on public.tabela_geral_snapshot;
drop policy if exists "Permitir UPDATE em tabela_geral_snapshot" on public.tabela_geral_snapshot;
drop policy if exists "Permitir DELETE em tabela_geral_snapshot" on public.tabela_geral_snapshot;

create policy "Permitir SELECT em tabela_geral_snapshot"
  on public.tabela_geral_snapshot for select using (true);
create policy "Permitir INSERT em tabela_geral_snapshot"
  on public.tabela_geral_snapshot for insert
  with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
create policy "Permitir UPDATE em tabela_geral_snapshot"
  on public.tabela_geral_snapshot for update
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
create policy "Permitir DELETE em tabela_geral_snapshot"
  on public.tabela_geral_snapshot for delete
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
