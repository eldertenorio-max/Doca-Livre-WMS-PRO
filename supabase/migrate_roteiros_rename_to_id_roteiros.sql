-- Se "id_roteiros" já existe e "roteiros" também: remove a tabela antiga "roteiros".
-- Se só existe "roteiros": renomeia para id_roteiros.
-- Em seguida habilita RLS em id_roteiros e cria as políticas.

do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'id_roteiros') then
    drop table if exists public.roteiros cascade;
  elsif exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'roteiros') then
    alter table public.roteiros rename to id_roteiros;
  end if;
end $$;

alter table public.id_roteiros enable row level security;

-- Recria as políticas (evita erro se já existirem)
drop policy if exists "Permitir SELECT em id_roteiros" on public.id_roteiros;
drop policy if exists "Permitir INSERT em id_roteiros" on public.id_roteiros;
drop policy if exists "Permitir UPDATE em id_roteiros" on public.id_roteiros;
drop policy if exists "Permitir DELETE em id_roteiros" on public.id_roteiros;

create policy "Permitir SELECT em id_roteiros"
  on public.id_roteiros for select using (true);
create policy "Permitir INSERT em id_roteiros"
  on public.id_roteiros for insert with check (true);
create policy "Permitir UPDATE em id_roteiros"
  on public.id_roteiros for update using (true);
create policy "Permitir DELETE em id_roteiros"
  on public.id_roteiros for delete using (true);
