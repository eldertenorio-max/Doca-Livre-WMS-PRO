-- ============================================================
-- CRIAR TABELA: divergencia_motivo
-- ============================================================
-- Execute este arquivo no SQL Editor do Supabase
-- ============================================================

create table if not exists public.divergencia_motivo (
  id_viagem text not null,
  codigo_produto text not null,
  motivo text,
  registrado_em timestamptz not null default now(),
  registrado_por text,
  primary key (id_viagem, codigo_produto)
);

comment on table public.divergencia_motivo is 'Justificativa de divergências (falta/sobra) por item e viagem';

create index if not exists idx_divergencia_id_viagem on public.divergencia_motivo (id_viagem);
