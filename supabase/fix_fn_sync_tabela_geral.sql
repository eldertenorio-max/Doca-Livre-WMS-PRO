-- Corrige fn_sync_tabela_geral_dados para não bloquear UPDATE/INSERT se a auditoria falhar.
-- Execute no SQL Editor do Supabase após migrate_tabela_geral_dados.sql.

create table if not exists public.tabela_geral_dados (
  id bigserial primary key,
  fonte_tabela text not null,
  row_id text,
  acao text not null,
  dados jsonb,
  criado_em timestamptz not null default now()
);

create table if not exists public.tabela_geral_snapshot (
  fonte_tabela text not null,
  row_id text not null,
  dados jsonb,
  atualizado_em timestamptz not null default now(),
  primary key (fonte_tabela, row_id)
);

create or replace function public.fn_sync_tabela_geral_dados()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  rid text;
  op text;
  r jsonb;
  tg_name text;
begin
  tg_name := tg_table_schema || '.' || tg_table_name;
  op := tg_op;
  if tg_op = 'DELETE' then
    rid := coalesce((to_jsonb(old) ->> 'id'), '');
    r := to_jsonb(old);
  elsif tg_op in ('INSERT', 'UPDATE') then
    rid := coalesce((to_jsonb(new) ->> 'id'), '');
    r := to_jsonb(new);
  else
    return coalesce(new, old);
  end if;
  begin
    insert into public.tabela_geral_dados (fonte_tabela, row_id, acao, dados)
    values (tg_name, rid, op, r);
  exception when others then
    null;
  end;
  return coalesce(new, old);
end;
$$;

create or replace function public.fn_sync_tabela_geral_snapshot()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  rid text;
  r jsonb;
  tg_name text;
begin
  tg_name := tg_table_schema || '.' || tg_table_name;
  if tg_op = 'DELETE' then
    rid := coalesce((to_jsonb(old) ->> 'id'), '');
    delete from public.tabela_geral_snapshot where fonte_tabela = tg_name and row_id = rid;
    return old;
  end if;
  rid := coalesce((to_jsonb(new) ->> 'id'), '');
  r := to_jsonb(new);
  begin
    insert into public.tabela_geral_snapshot (fonte_tabela, row_id, dados, atualizado_em)
    values (tg_name, rid, r, now())
    on conflict (fonte_tabela, row_id) do update
      set dados = excluded.dados, atualizado_em = excluded.atualizado_em;
  exception when others then
    null;
  end;
  return coalesce(new, old);
end;
$$;

-- RLS (remove selo UNRESTRICTED no painel Supabase)
alter table public.tabela_geral_dados enable row level security;
alter table public.tabela_geral_snapshot enable row level security;

drop policy if exists "Permitir SELECT em tabela_geral_dados" on public.tabela_geral_dados;
drop policy if exists "Permitir INSERT em tabela_geral_dados" on public.tabela_geral_dados;
drop policy if exists "Permitir UPDATE em tabela_geral_dados" on public.tabela_geral_dados;
drop policy if exists "Permitir DELETE em tabela_geral_dados" on public.tabela_geral_dados;
create policy "Permitir SELECT em tabela_geral_dados" on public.tabela_geral_dados for select using (true);
create policy "Permitir INSERT em tabela_geral_dados" on public.tabela_geral_dados for insert
  with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
create policy "Permitir UPDATE em tabela_geral_dados" on public.tabela_geral_dados for update
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
create policy "Permitir DELETE em tabela_geral_dados" on public.tabela_geral_dados for delete
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));

drop policy if exists "Permitir SELECT em tabela_geral_snapshot" on public.tabela_geral_snapshot;
drop policy if exists "Permitir INSERT em tabela_geral_snapshot" on public.tabela_geral_snapshot;
drop policy if exists "Permitir UPDATE em tabela_geral_snapshot" on public.tabela_geral_snapshot;
drop policy if exists "Permitir DELETE em tabela_geral_snapshot" on public.tabela_geral_snapshot;
create policy "Permitir SELECT em tabela_geral_snapshot" on public.tabela_geral_snapshot for select using (true);
create policy "Permitir INSERT em tabela_geral_snapshot" on public.tabela_geral_snapshot for insert
  with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
create policy "Permitir UPDATE em tabela_geral_snapshot" on public.tabela_geral_snapshot for update
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
create policy "Permitir DELETE em tabela_geral_snapshot" on public.tabela_geral_snapshot for delete
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
