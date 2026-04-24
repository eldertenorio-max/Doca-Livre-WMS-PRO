-- ============================================================
-- Terceiros (NF-e XML): habilitar RLS e políticas
-- ============================================================
-- Remove o selo "SEM RESTRIÇÃO" / UNRESTRICTED no painel do Supabase.
-- Execute no SQL Editor DEPOIS que as tabelas já existirem
-- (criadas pelo app na primeira conexão ou pelo schema do projeto).
-- Pode rodar mais de uma vez (idempotente).
-- ============================================================

alter table public.terceiros_documentos enable row level security;
alter table public.terceiros_documento_itens enable row level security;
alter table public.terceiros_documento_eventos enable row level security;

-- terceiros_documentos
drop policy if exists "Permitir SELECT em terceiros_documentos" on public.terceiros_documentos;
drop policy if exists "Permitir INSERT em terceiros_documentos" on public.terceiros_documentos;
drop policy if exists "Permitir UPDATE em terceiros_documentos" on public.terceiros_documentos;
drop policy if exists "Permitir DELETE em terceiros_documentos" on public.terceiros_documentos;

create policy "Permitir SELECT em terceiros_documentos"
  on public.terceiros_documentos for select using (true);
create policy "Permitir INSERT em terceiros_documentos"
  on public.terceiros_documentos for insert with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
create policy "Permitir UPDATE em terceiros_documentos"
  on public.terceiros_documentos for update using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
create policy "Permitir DELETE em terceiros_documentos"
  on public.terceiros_documentos for delete using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- terceiros_documento_itens
drop policy if exists "Permitir SELECT em terceiros_documento_itens" on public.terceiros_documento_itens;
drop policy if exists "Permitir INSERT em terceiros_documento_itens" on public.terceiros_documento_itens;
drop policy if exists "Permitir UPDATE em terceiros_documento_itens" on public.terceiros_documento_itens;
drop policy if exists "Permitir DELETE em terceiros_documento_itens" on public.terceiros_documento_itens;

create policy "Permitir SELECT em terceiros_documento_itens"
  on public.terceiros_documento_itens for select using (true);
create policy "Permitir INSERT em terceiros_documento_itens"
  on public.terceiros_documento_itens for insert with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
create policy "Permitir UPDATE em terceiros_documento_itens"
  on public.terceiros_documento_itens for update using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
create policy "Permitir DELETE em terceiros_documento_itens"
  on public.terceiros_documento_itens for delete using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- terceiros_documento_eventos
drop policy if exists "Permitir SELECT em terceiros_documento_eventos" on public.terceiros_documento_eventos;
drop policy if exists "Permitir INSERT em terceiros_documento_eventos" on public.terceiros_documento_eventos;
drop policy if exists "Permitir UPDATE em terceiros_documento_eventos" on public.terceiros_documento_eventos;
drop policy if exists "Permitir DELETE em terceiros_documento_eventos" on public.terceiros_documento_eventos;

create policy "Permitir SELECT em terceiros_documento_eventos"
  on public.terceiros_documento_eventos for select using (true);
create policy "Permitir INSERT em terceiros_documento_eventos"
  on public.terceiros_documento_eventos for insert with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
create policy "Permitir UPDATE em terceiros_documento_eventos"
  on public.terceiros_documento_eventos for update using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
create policy "Permitir DELETE em terceiros_documento_eventos"
  on public.terceiros_documento_eventos for delete using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
