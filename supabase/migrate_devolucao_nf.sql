-- Notas fiscais de devolução por viagem (sessão de bipagem de retorno)
create table if not exists public.devolucao_nota_fiscal (
    id bigserial primary key,
    id_viagem text not null,
    numero_nf text not null,
    motivo text not null check (motivo in ('parcial', 'total', 'reentrega')),
    status text not null default 'em_andamento' check (status in ('em_andamento', 'concluida')),
    doca text,
    criado_em timestamptz not null default now(),
    concluida_em timestamptz,
    criado_por text,
    concluida_por text
);

create index if not exists idx_devolucao_nf_viagem on public.devolucao_nota_fiscal (id_viagem, status);
create index if not exists idx_devolucao_nf_numero on public.devolucao_nota_fiscal (numero_nf);

alter table public.produtos_bipados
    add column if not exists devolucao_nf_id bigint references public.devolucao_nota_fiscal(id) on delete set null;

create index if not exists idx_produtos_bipados_devolucao_nf on public.produtos_bipados (devolucao_nf_id);

comment on table public.devolucao_nota_fiscal is 'Sessões de bipagem de retorno por NF e motivo (parcial/total/reentrega)';

alter table public.devolucao_nota_fiscal enable row level security;

drop policy if exists "Permitir SELECT em devolucao_nota_fiscal" on public.devolucao_nota_fiscal;
drop policy if exists "Permitir INSERT em devolucao_nota_fiscal" on public.devolucao_nota_fiscal;
drop policy if exists "Permitir UPDATE em devolucao_nota_fiscal" on public.devolucao_nota_fiscal;
drop policy if exists "Permitir DELETE em devolucao_nota_fiscal" on public.devolucao_nota_fiscal;

create policy "Permitir SELECT em devolucao_nota_fiscal"
  on public.devolucao_nota_fiscal for select using (true);
create policy "Permitir INSERT em devolucao_nota_fiscal"
  on public.devolucao_nota_fiscal for insert
  with check ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
create policy "Permitir UPDATE em devolucao_nota_fiscal"
  on public.devolucao_nota_fiscal for update
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
create policy "Permitir DELETE em devolucao_nota_fiscal"
  on public.devolucao_nota_fiscal for delete
  using ((select auth.role() in ('anon'::text, 'authenticated'::text, 'service_role'::text)));
