-- ============================================================
-- REMOVER "UNRESTRICTED" - Motoristas e Placas
-- ============================================================
-- Execute no SQL Editor do Supabase APÓS criar as tabelas
-- ============================================================

-- Habilitar RLS
alter table public.motoristas enable row level security;
alter table public.placas enable row level security;

-- ============================================================
-- POLÍTICAS: MOTORISTAS
-- ============================================================

create policy "Permitir SELECT em motoristas"
  on public.motoristas
  for select
  using (true);

create policy "Permitir INSERT em motoristas"
  on public.motoristas
  for insert
  with check (true);

create policy "Permitir UPDATE em motoristas"
  on public.motoristas
  for update
  using (true);

create policy "Permitir DELETE em motoristas"
  on public.motoristas
  for delete
  using (true);

-- ============================================================
-- POLÍTICAS: PLACAS
-- ============================================================

create policy "Permitir SELECT em placas"
  on public.placas
  for select
  using (true);

create policy "Permitir INSERT em placas"
  on public.placas
  for insert
  with check (true);

create policy "Permitir UPDATE em placas"
  on public.placas
  for update
  using (true);

create policy "Permitir DELETE em placas"
  on public.placas
  for delete
  using (true);

-- ============================================================
-- Pronto! UNRESTRICTED removido de motoristas e placas
-- ============================================================
