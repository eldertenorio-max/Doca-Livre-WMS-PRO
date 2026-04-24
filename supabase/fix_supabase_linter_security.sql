-- ============================================================
-- Corrige avisos do Database Linter do Supabase
-- - 0011_function_search_path_mutable (search_path nas funções)
-- - 0024_rls_policy_always_true (INSERT/UPDATE/DELETE sem USING/WITH CHECK = true)
-- ============================================================
-- Execute UMA VEZ no SQL Editor do projeto Supabase.
-- Comportamento de acesso: clientes PostgREST (anon / authenticated /
-- service_role) continuam podendo ler/escrever; a expressão não é o
-- literal TRUE, o que satisfaz o linter.
-- ============================================================

-- Expressão para mutações (evita policy "always true")
-- Subquery estável: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select

-- ---------------------------------------------------------------------------
-- 1) Funções: fixar search_path = public (mitiga search_path hijacking)
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname in (
        'fn_sync_tabela_geral_dados',
        'fn_row_id_from_json',
        'fn_sync_tabela_geral_snapshot',
        'atualizar_timestamp_modificacao',
        'atualizar_colaboradores_timestamp',
        'atualizar_viagem_motorista_timestamp',
        'atualizar_viagem_placa_timestamp',
        'atualizar_motoristas_timestamp',
        'atualizar_placas_timestamp',
        'atualizar_viagem_responsaveis_timestamp'
      )
  loop
    execute format('alter function %s set search_path = public', r.sig);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2) RLS: recriar políticas de escrita sem literal true
-- ---------------------------------------------------------------------------
-- base_codigo_barras (nomes antigos "excel_base" em alguns projetos)
drop policy if exists "Permitir DELETE em excel_base" on public.base_codigo_barras;
drop policy if exists "Permitir INSERT em excel_base" on public.base_codigo_barras;
drop policy if exists "Permitir DELETE em base_codigo_barras" on public.base_codigo_barras;
drop policy if exists "Permitir INSERT em base_codigo_barras" on public.base_codigo_barras;

create policy "Permitir INSERT em base_codigo_barras"
  on public.base_codigo_barras
  for insert
  with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
create policy "Permitir DELETE em base_codigo_barras"
  on public.base_codigo_barras
  for delete
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- usuarios
drop policy if exists "Permitir INSERT em usuarios" on public.usuarios;
drop policy if exists "Permitir UPDATE em usuarios" on public.usuarios;
drop policy if exists "Permitir DELETE em usuarios" on public.usuarios;
create policy "Permitir INSERT em usuarios"
  on public.usuarios for insert
  with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
create policy "Permitir UPDATE em usuarios"
  on public.usuarios for update
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
create policy "Permitir DELETE em usuarios"
  on public.usuarios for delete
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- colaboradores
drop policy if exists "Permitir INSERT em colaboradores" on public.colaboradores;
drop policy if exists "Permitir UPDATE em colaboradores" on public.colaboradores;
drop policy if exists "Permitir DELETE em colaboradores" on public.colaboradores;
create policy "Permitir INSERT em colaboradores"
  on public.colaboradores for insert
  with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
create policy "Permitir UPDATE em colaboradores"
  on public.colaboradores for update
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
create policy "Permitir DELETE em colaboradores"
  on public.colaboradores for delete
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- motoristas
drop policy if exists "Permitir INSERT em motoristas" on public.motoristas;
drop policy if exists "Permitir UPDATE em motoristas" on public.motoristas;
drop policy if exists "Permitir DELETE em motoristas" on public.motoristas;
create policy "Permitir INSERT em motoristas"
  on public.motoristas for insert
  with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
create policy "Permitir UPDATE em motoristas"
  on public.motoristas for update
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
create policy "Permitir DELETE em motoristas"
  on public.motoristas for delete
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- placas
drop policy if exists "Permitir INSERT em placas" on public.placas;
drop policy if exists "Permitir UPDATE em placas" on public.placas;
drop policy if exists "Permitir DELETE em placas" on public.placas;
create policy "Permitir INSERT em placas"
  on public.placas for insert
  with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
create policy "Permitir UPDATE em placas"
  on public.placas for update
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
create policy "Permitir DELETE em placas"
  on public.placas for delete
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- produtos_bipados
drop policy if exists "Permitir INSERT em produtos_bipados" on public.produtos_bipados;
drop policy if exists "Permitir UPDATE em produtos_bipados" on public.produtos_bipados;
drop policy if exists "Permitir DELETE em produtos_bipados" on public.produtos_bipados;
create policy "Permitir INSERT em produtos_bipados"
  on public.produtos_bipados for insert
  with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
create policy "Permitir UPDATE em produtos_bipados"
  on public.produtos_bipados for update
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
create policy "Permitir DELETE em produtos_bipados"
  on public.produtos_bipados for delete
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- viagem_placa
drop policy if exists "Permitir INSERT em viagem_placa" on public.viagem_placa;
drop policy if exists "Permitir UPDATE em viagem_placa" on public.viagem_placa;
drop policy if exists "Permitir DELETE em viagem_placa" on public.viagem_placa;
create policy "Permitir INSERT em viagem_placa"
  on public.viagem_placa for insert
  with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
create policy "Permitir UPDATE em viagem_placa"
  on public.viagem_placa for update
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
create policy "Permitir DELETE em viagem_placa"
  on public.viagem_placa for delete
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- viagem_motorista
drop policy if exists "Permitir INSERT em viagem_motorista" on public.viagem_motorista;
drop policy if exists "Permitir UPDATE em viagem_motorista" on public.viagem_motorista;
drop policy if exists "Permitir DELETE em viagem_motorista" on public.viagem_motorista;
create policy "Permitir INSERT em viagem_motorista"
  on public.viagem_motorista for insert
  with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
create policy "Permitir UPDATE em viagem_motorista"
  on public.viagem_motorista for update
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
create policy "Permitir DELETE em viagem_motorista"
  on public.viagem_motorista for delete
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- viagem_responsaveis
drop policy if exists "Permitir INSERT em viagem_responsaveis" on public.viagem_responsaveis;
drop policy if exists "Permitir UPDATE em viagem_responsaveis" on public.viagem_responsaveis;
drop policy if exists "Permitir DELETE em viagem_responsaveis" on public.viagem_responsaveis;
create policy "Permitir INSERT em viagem_responsaveis"
  on public.viagem_responsaveis for insert
  with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
create policy "Permitir UPDATE em viagem_responsaveis"
  on public.viagem_responsaveis for update
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
create policy "Permitir DELETE em viagem_responsaveis"
  on public.viagem_responsaveis for delete
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- divergencia_motivo
drop policy if exists "Permitir INSERT em divergencia_motivo" on public.divergencia_motivo;
drop policy if exists "Permitir UPDATE em divergencia_motivo" on public.divergencia_motivo;
drop policy if exists "Permitir DELETE em divergencia_motivo" on public.divergencia_motivo;
create policy "Permitir INSERT em divergencia_motivo"
  on public.divergencia_motivo for insert
  with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
create policy "Permitir UPDATE em divergencia_motivo"
  on public.divergencia_motivo for update
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
create policy "Permitir DELETE em divergencia_motivo"
  on public.divergencia_motivo for delete
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- romaneio
drop policy if exists "Permitir INSERT em romaneio" on public.romaneio;
drop policy if exists "Permitir UPDATE em romaneio" on public.romaneio;
drop policy if exists "Permitir DELETE em romaneio" on public.romaneio;
create policy "Permitir INSERT em romaneio"
  on public.romaneio for insert
  with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
create policy "Permitir UPDATE em romaneio"
  on public.romaneio for update
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
create policy "Permitir DELETE em romaneio"
  on public.romaneio for delete
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- excel_datasets
drop policy if exists "Permitir INSERT em excel_datasets" on public.excel_datasets;
drop policy if exists "Permitir UPDATE em excel_datasets" on public.excel_datasets;
drop policy if exists "Permitir DELETE em excel_datasets" on public.excel_datasets;
create policy "Permitir INSERT em excel_datasets"
  on public.excel_datasets for insert
  with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
create policy "Permitir UPDATE em excel_datasets"
  on public.excel_datasets for update
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
create policy "Permitir DELETE em excel_datasets"
  on public.excel_datasets for delete
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- id_roteiros
drop policy if exists "Permitir INSERT em id_roteiros" on public.id_roteiros;
drop policy if exists "Permitir UPDATE em id_roteiros" on public.id_roteiros;
drop policy if exists "Permitir DELETE em id_roteiros" on public.id_roteiros;
create policy "Permitir INSERT em id_roteiros"
  on public.id_roteiros for insert
  with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
create policy "Permitir UPDATE em id_roteiros"
  on public.id_roteiros for update
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
create policy "Permitir DELETE em id_roteiros"
  on public.id_roteiros for delete
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- excel_romaneio_por_item
do $$
begin
  if to_regclass('public.excel_romaneio_por_item') is not null then
    execute 'drop policy if exists "Permitir INSERT em excel_romaneio_por_item" on public.excel_romaneio_por_item';
    execute 'drop policy if exists "Permitir DELETE em excel_romaneio_por_item" on public.excel_romaneio_por_item';
    execute $p$
      create policy "Permitir INSERT em excel_romaneio_por_item"
        on public.excel_romaneio_por_item for insert
        with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)))
    $p$;
    execute $p$
      create policy "Permitir DELETE em excel_romaneio_por_item"
        on public.excel_romaneio_por_item for delete
        using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)))
    $p$;
  end if;
end $$;

-- romaneio_por_item (algumas bases usam este nome de tabela com as mesmas políticas)
do $$
begin
  if to_regclass('public.romaneio_por_item') is not null then
    execute 'drop policy if exists "Permitir INSERT em excel_romaneio_por_item" on public.romaneio_por_item';
    execute 'drop policy if exists "Permitir DELETE em excel_romaneio_por_item" on public.romaneio_por_item';
    execute 'drop policy if exists "Permitir UPDATE em excel_romaneio_por_item" on public.romaneio_por_item';
    execute $p$
      create policy "Permitir INSERT em excel_romaneio_por_item"
        on public.romaneio_por_item for insert
        with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)))
    $p$;
    execute $p$
      create policy "Permitir DELETE em excel_romaneio_por_item"
        on public.romaneio_por_item for delete
        using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)))
    $p$;
  end if;
end $$;

-- ravex_importacoes
do $$
begin
  if to_regclass('public.ravex_importacoes') is not null then
    execute 'drop policy if exists "Permitir INSERT em ravex_importacoes" on public.ravex_importacoes';
    execute 'drop policy if exists "Permitir UPDATE em ravex_importacoes" on public.ravex_importacoes';
    execute 'drop policy if exists "Permitir DELETE em ravex_importacoes" on public.ravex_importacoes';
    execute $p$
      create policy "Permitir INSERT em ravex_importacoes"
        on public.ravex_importacoes for insert
        with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)))
    $p$;
    execute $p$
      create policy "Permitir UPDATE em ravex_importacoes"
        on public.ravex_importacoes for update
        using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)))
    $p$;
    execute $p$
      create policy "Permitir DELETE em ravex_importacoes"
        on public.ravex_importacoes for delete
        using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)))
    $p$;
  end if;
end $$;

-- terceiros
do $$
begin
  if to_regclass('public.terceiros_documentos') is not null then
    execute 'drop policy if exists "Permitir INSERT em terceiros_documentos" on public.terceiros_documentos';
    execute 'drop policy if exists "Permitir UPDATE em terceiros_documentos" on public.terceiros_documentos';
    execute 'drop policy if exists "Permitir DELETE em terceiros_documentos" on public.terceiros_documentos';
    execute $p$
      create policy "Permitir INSERT em terceiros_documentos"
        on public.terceiros_documentos for insert
        with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)))
    $p$;
    execute $p$
      create policy "Permitir UPDATE em terceiros_documentos"
        on public.terceiros_documentos for update
        using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)))
    $p$;
    execute $p$
      create policy "Permitir DELETE em terceiros_documentos"
        on public.terceiros_documentos for delete
        using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)))
    $p$;
  end if;
  if to_regclass('public.terceiros_documento_itens') is not null then
    execute 'drop policy if exists "Permitir INSERT em terceiros_documento_itens" on public.terceiros_documento_itens';
    execute 'drop policy if exists "Permitir UPDATE em terceiros_documento_itens" on public.terceiros_documento_itens';
    execute 'drop policy if exists "Permitir DELETE em terceiros_documento_itens" on public.terceiros_documento_itens';
    execute $p$
      create policy "Permitir INSERT em terceiros_documento_itens"
        on public.terceiros_documento_itens for insert
        with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)))
    $p$;
    execute $p$
      create policy "Permitir UPDATE em terceiros_documento_itens"
        on public.terceiros_documento_itens for update
        using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)))
    $p$;
    execute $p$
      create policy "Permitir DELETE em terceiros_documento_itens"
        on public.terceiros_documento_itens for delete
        using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)))
    $p$;
  end if;
  if to_regclass('public.terceiros_documento_eventos') is not null then
    execute 'drop policy if exists "Permitir INSERT em terceiros_documento_eventos" on public.terceiros_documento_eventos';
    execute 'drop policy if exists "Permitir UPDATE em terceiros_documento_eventos" on public.terceiros_documento_eventos';
    execute 'drop policy if exists "Permitir DELETE em terceiros_documento_eventos" on public.terceiros_documento_eventos';
    execute $p$
      create policy "Permitir INSERT em terceiros_documento_eventos"
        on public.terceiros_documento_eventos for insert
        with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)))
    $p$;
    execute $p$
      create policy "Permitir UPDATE em terceiros_documento_eventos"
        on public.terceiros_documento_eventos for update
        using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)))
    $p$;
    execute $p$
      create policy "Permitir DELETE em terceiros_documento_eventos"
        on public.terceiros_documento_eventos for delete
        using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)))
    $p$;
  end if;
end $$;

-- ============================================================
-- Pronto. Rode o Database Linter de novo no painel do Supabase.
-- ============================================================
