-- ============================================================
-- CRIAR TABELA: usuarios
-- ============================================================
-- Execute este arquivo no SQL Editor do Supabase
-- ============================================================

create table if not exists public.usuarios (
  id bigserial primary key,
  usuario text not null unique,
  senha_hash text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

comment on table public.usuarios is 'Usuários do sistema (login e controle de acesso)';
comment on column public.usuarios.ativo is 'Se false, usuário não pode fazer login';

create index if not exists idx_usuarios_usuario on public.usuarios (usuario) where ativo = true;

-- Trigger
create or replace function atualizar_usuarios_timestamp()
returns trigger as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$ language plpgsql;

create trigger trigger_usuarios_timestamp
  before update on public.usuarios
  for each row
  execute function atualizar_usuarios_timestamp();
