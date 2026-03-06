-- ============================================================
-- CRIAR TABELA: produtos_bipados
-- ============================================================
-- Execute este arquivo no SQL Editor do Supabase
-- ============================================================

create table if not exists public.produtos_bipados (
  id bigserial primary key,
  
  -- Identificação do produto
  codigo_barras text not null,
  codigo_interno text,
  codigo_dun text,
  produto text not null,
  
  -- Quantidade e unidade
  quantidade integer not null check (quantidade >= 1),
  unidade text,
  peso text,
  
  -- Contexto da bipagem
  id_viagem text not null,
  doca text check (doca in ('1', '2', '3', '4')),
  veiculo text,
  status text not null default 'PENDENTE' check (status in ('PENDENTE', 'CARREGADO', 'CANCELADO')),
  
  -- Auditoria
  data_hora timestamptz not null default now(),
  usuario_bipagem text,
  
  -- Metadados
  criado_em timestamptz not null default now()
);

comment on table public.produtos_bipados is 'Registro de cada bipagem realizada no sistema';
comment on column public.produtos_bipados.codigo_barras is 'EAN ou DUN escaneado';
comment on column public.produtos_bipados.codigo_interno is 'Código do produto (da aba BASE)';
comment on column public.produtos_bipados.doca is 'Doca onde foi realizada a bipagem (1-4)';
comment on column public.produtos_bipados.usuario_bipagem is 'Usuário logado no momento da bipagem';

-- Índices otimizados
create index if not exists idx_produtos_bipados_id_viagem on public.produtos_bipados (id_viagem);
create index if not exists idx_produtos_bipados_codigo_barras on public.produtos_bipados (codigo_barras);
create index if not exists idx_produtos_bipados_viagem_codigo on public.produtos_bipados (id_viagem, codigo_barras);
create index if not exists idx_produtos_bipados_data on public.produtos_bipados (data_hora desc);
create index if not exists idx_produtos_bipados_status on public.produtos_bipados (status);
create index if not exists idx_produtos_bipados_doca on public.produtos_bipados (doca) where doca is not null;
