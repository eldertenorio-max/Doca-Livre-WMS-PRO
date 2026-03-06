-- ============================================================
-- CRIAR TABELA: colaboradores
-- ============================================================
-- Execute este arquivo separadamente no SQL Editor do Supabase
-- ============================================================

-- Remover tabela se já existir (opcional - use com cuidado)
-- drop table if exists public.colaboradores cascade;

-- Criar tabela colaboradores
create table if not exists public.colaboradores (
  id bigserial primary key,
  nome text not null,
  funcao text,
  centro_custo text,
  tipo text,
  cpf text,
  telefone text,
  email text,
  ativo boolean not null default true,
  observacoes text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por text,
  atualizado_por text
);

-- Comentários (documentação)
comment on table public.colaboradores is 'Cadastro de colaboradores (motoristas, conferentes, coordenadores, ajudantes)';
comment on column public.colaboradores.nome is 'Nome completo do colaborador';
comment on column public.colaboradores.funcao is 'Ex: Motorista, Conferente, Ajudante, Coordenador';
comment on column public.colaboradores.centro_custo is 'Ex: TRANSPORTE GRU, TRANSPORTE PPY, LOGÍSTICA';
comment on column public.colaboradores.tipo is 'Classificação: MOTORISTA, CONFERENTE, AJUDANTE, COORDENADOR';
comment on column public.colaboradores.cpf is 'CPF do colaborador (único)';
comment on column public.colaboradores.ativo is 'Se false, não aparece nas listas de seleção';
comment on column public.colaboradores.observacoes is 'Notas adicionais sobre o colaborador';
comment on column public.colaboradores.criado_por is 'Usuário que cadastrou';
comment on column public.colaboradores.atualizado_por is 'Usuário que fez a última alteração';

-- Índices para performance
create index if not exists idx_colaboradores_nome on public.colaboradores (nome) where ativo = true;
create index if not exists idx_colaboradores_tipo on public.colaboradores (tipo) where ativo = true and tipo is not null;
create index if not exists idx_colaboradores_funcao on public.colaboradores (funcao) where ativo = true and funcao is not null;
create unique index if not exists idx_colaboradores_cpf on public.colaboradores (cpf) where cpf is not null and cpf != '';

-- Trigger para atualizar timestamp automaticamente
create or replace function atualizar_colaboradores_timestamp()
returns trigger as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$ language plpgsql;

create trigger trigger_colaboradores_timestamp
  before update on public.colaboradores
  for each row
  execute function atualizar_colaboradores_timestamp();

-- ============================================================
-- Pronto! Tabela criada com sucesso
-- ============================================================
-- Próximo passo (opcional): inserir dados iniciais
-- Execute: supabase/seed_colaboradores.sql
-- ============================================================
