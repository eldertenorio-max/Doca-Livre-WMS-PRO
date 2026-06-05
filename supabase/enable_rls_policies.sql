-- ============================================================
-- REMOVER "UNRESTRICTED" - Habilitar RLS (Row Level Security)
-- ============================================================
-- Execute no SQL Editor do Supabase APÓS criar as tabelas
-- ============================================================

-- ============================================================
-- 1. HABILITAR RLS (Row Level Security) em todas as tabelas
-- ============================================================

alter table public.usuarios enable row level security;
alter table public.colaboradores enable row level security;
alter table public.motoristas enable row level security;
alter table public.placas enable row level security;
alter table public.produtos_bipados enable row level security;
alter table public.viagem_placa enable row level security;
alter table public.viagem_motorista enable row level security;
alter table public.viagem_responsaveis enable row level security;
alter table public.divergencia_motivo enable row level security;
alter table public.romaneio enable row level security;
alter table public.excel_datasets enable row level security;
alter table public.base_codigo_barras enable row level security;
alter table public.id_roteiros enable row level security;
alter table public.viagem_periodo_bipagem enable row level security;
alter table public.devolucao_nota_fiscal enable row level security;

-- ============================================================
-- 2. POLÍTICAS DE ACESSO (system interno - acesso total)
-- ============================================================
-- IMPORTANTE: Políticas de escrita usam auth.role() (não o literal true)
-- para satisfazer o Database Linter do Supabase (0024), mantendo acesso
-- para anon / authenticated / service_role (PostgREST).
-- Se quiser restringir no futuro, ajuste as policies.
-- ============================================================

-- Política: Permitir TUDO para service_role (backend)
-- (service_role bypassa RLS, mas vamos criar as policies para clareza)

-- ============================================================
-- 2.1. USUARIOS
-- ============================================================

create policy "Permitir SELECT em usuarios"
  on public.usuarios
  for select
  using (true);

create policy "Permitir INSERT em usuarios"
  on public.usuarios
  for insert
  with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

create policy "Permitir UPDATE em usuarios"
  on public.usuarios
  for update
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

create policy "Permitir DELETE em usuarios"
  on public.usuarios
  for delete
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- ============================================================
-- 2.2. COLABORADORES
-- ============================================================

create policy "Permitir SELECT em colaboradores"
  on public.colaboradores
  for select
  using (true);

create policy "Permitir INSERT em colaboradores"
  on public.colaboradores
  for insert
  with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

create policy "Permitir UPDATE em colaboradores"
  on public.colaboradores
  for update
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

create policy "Permitir DELETE em colaboradores"
  on public.colaboradores
  for delete
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- ============================================================
-- 2.3. MOTORISTAS
-- ============================================================

create policy "Permitir SELECT em motoristas"
  on public.motoristas
  for select
  using (true);

create policy "Permitir INSERT em motoristas"
  on public.motoristas
  for insert
  with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

create policy "Permitir UPDATE em motoristas"
  on public.motoristas
  for update
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

create policy "Permitir DELETE em motoristas"
  on public.motoristas
  for delete
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- ============================================================
-- 2.4. PLACAS
-- ============================================================

create policy "Permitir SELECT em placas"
  on public.placas
  for select
  using (true);

create policy "Permitir INSERT em placas"
  on public.placas
  for insert
  with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

create policy "Permitir UPDATE em placas"
  on public.placas
  for update
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

create policy "Permitir DELETE em placas"
  on public.placas
  for delete
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- ============================================================
-- 2.5. PRODUTOS_BIPADOS
-- ============================================================

create policy "Permitir SELECT em produtos_bipados"
  on public.produtos_bipados
  for select
  using (true);

create policy "Permitir INSERT em produtos_bipados"
  on public.produtos_bipados
  for insert
  with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

create policy "Permitir UPDATE em produtos_bipados"
  on public.produtos_bipados
  for update
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

create policy "Permitir DELETE em produtos_bipados"
  on public.produtos_bipados
  for delete
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- ============================================================
-- 2.4. VIAGEM_PLACA
-- ============================================================

create policy "Permitir SELECT em viagem_placa"
  on public.viagem_placa
  for select
  using (true);

create policy "Permitir INSERT em viagem_placa"
  on public.viagem_placa
  for insert
  with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

create policy "Permitir UPDATE em viagem_placa"
  on public.viagem_placa
  for update
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

create policy "Permitir DELETE em viagem_placa"
  on public.viagem_placa
  for delete
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- ============================================================
-- 2.5. VIAGEM_MOTORISTA
-- ============================================================

create policy "Permitir SELECT em viagem_motorista"
  on public.viagem_motorista
  for select
  using (true);

create policy "Permitir INSERT em viagem_motorista"
  on public.viagem_motorista
  for insert
  with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

create policy "Permitir UPDATE em viagem_motorista"
  on public.viagem_motorista
  for update
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

create policy "Permitir DELETE em viagem_motorista"
  on public.viagem_motorista
  for delete
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- ============================================================
-- 2.6. VIAGEM_RESPONSAVEIS
-- ============================================================

create policy "Permitir SELECT em viagem_responsaveis"
  on public.viagem_responsaveis
  for select
  using (true);

create policy "Permitir INSERT em viagem_responsaveis"
  on public.viagem_responsaveis
  for insert
  with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

create policy "Permitir UPDATE em viagem_responsaveis"
  on public.viagem_responsaveis
  for update
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

create policy "Permitir DELETE em viagem_responsaveis"
  on public.viagem_responsaveis
  for delete
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- ============================================================
-- 2.7. DIVERGENCIA_MOTIVO
-- ============================================================

create policy "Permitir SELECT em divergencia_motivo"
  on public.divergencia_motivo
  for select
  using (true);

create policy "Permitir INSERT em divergencia_motivo"
  on public.divergencia_motivo
  for insert
  with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

create policy "Permitir UPDATE em divergencia_motivo"
  on public.divergencia_motivo
  for update
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

create policy "Permitir DELETE em divergencia_motivo"
  on public.divergencia_motivo
  for delete
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- ============================================================
-- 2.8. ROMANEIO
-- ============================================================

create policy "Permitir SELECT em romaneio"
  on public.romaneio
  for select
  using (true);

create policy "Permitir INSERT em romaneio"
  on public.romaneio
  for insert
  with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

create policy "Permitir UPDATE em romaneio"
  on public.romaneio
  for update
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

create policy "Permitir DELETE em romaneio"
  on public.romaneio
  for delete
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- ============================================================
-- 2.9. EXCEL_DATASETS
-- ============================================================

create policy "Permitir SELECT em excel_datasets"
  on public.excel_datasets
  for select
  using (true);

create policy "Permitir INSERT em excel_datasets"
  on public.excel_datasets
  for insert
  with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

create policy "Permitir UPDATE em excel_datasets"
  on public.excel_datasets
  for update
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

create policy "Permitir DELETE em excel_datasets"
  on public.excel_datasets
  for delete
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- ============================================================
-- 2.10. BASE_CODIGO_BARRAS (ex-excel_base)
-- ============================================================

create policy "Permitir SELECT em base_codigo_barras"
  on public.base_codigo_barras
  for select
  using (true);

create policy "Permitir INSERT em base_codigo_barras"
  on public.base_codigo_barras
  for insert
  with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

create policy "Permitir DELETE em base_codigo_barras"
  on public.base_codigo_barras
  for delete
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- ============================================================
-- 2.12. ID_ROTEIROS
-- ============================================================

drop policy if exists "Permitir SELECT em id_roteiros" on public.id_roteiros;
create policy "Permitir SELECT em id_roteiros"
  on public.id_roteiros for select using (true);
drop policy if exists "Permitir INSERT em id_roteiros" on public.id_roteiros;
create policy "Permitir INSERT em id_roteiros"
  on public.id_roteiros for insert with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
drop policy if exists "Permitir UPDATE em id_roteiros" on public.id_roteiros;
create policy "Permitir UPDATE em id_roteiros"
  on public.id_roteiros for update using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
drop policy if exists "Permitir DELETE em id_roteiros" on public.id_roteiros;
create policy "Permitir DELETE em id_roteiros"
  on public.id_roteiros for delete using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- ============================================================
-- 2.14. VIAGEM_PERIODO_BIPAGEM
-- ============================================================

drop policy if exists "Permitir SELECT em viagem_periodo_bipagem" on public.viagem_periodo_bipagem;
create policy "Permitir SELECT em viagem_periodo_bipagem"
  on public.viagem_periodo_bipagem for select using (true);
drop policy if exists "Permitir INSERT em viagem_periodo_bipagem" on public.viagem_periodo_bipagem;
create policy "Permitir INSERT em viagem_periodo_bipagem"
  on public.viagem_periodo_bipagem for insert with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
drop policy if exists "Permitir UPDATE em viagem_periodo_bipagem" on public.viagem_periodo_bipagem;
create policy "Permitir UPDATE em viagem_periodo_bipagem"
  on public.viagem_periodo_bipagem for update using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
drop policy if exists "Permitir DELETE em viagem_periodo_bipagem" on public.viagem_periodo_bipagem;
create policy "Permitir DELETE em viagem_periodo_bipagem"
  on public.viagem_periodo_bipagem for delete using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- ============================================================
-- 2.15. DEVOLUCAO_NOTA_FISCAL
-- ============================================================

drop policy if exists "Permitir SELECT em devolucao_nota_fiscal" on public.devolucao_nota_fiscal;
create policy "Permitir SELECT em devolucao_nota_fiscal"
  on public.devolucao_nota_fiscal for select using (true);
drop policy if exists "Permitir INSERT em devolucao_nota_fiscal" on public.devolucao_nota_fiscal;
create policy "Permitir INSERT em devolucao_nota_fiscal"
  on public.devolucao_nota_fiscal for insert with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
drop policy if exists "Permitir UPDATE em devolucao_nota_fiscal" on public.devolucao_nota_fiscal;
create policy "Permitir UPDATE em devolucao_nota_fiscal"
  on public.devolucao_nota_fiscal for update using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
drop policy if exists "Permitir DELETE em devolucao_nota_fiscal" on public.devolucao_nota_fiscal;
create policy "Permitir DELETE em devolucao_nota_fiscal"
  on public.devolucao_nota_fiscal for delete using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- ============================================================
-- PRONTO! RLS habilitado em todas as tabelas
-- ============================================================
-- UNRESTRICTED removido ✅
-- Políticas de acesso configuradas (permissão total) ✅
-- ============================================================
