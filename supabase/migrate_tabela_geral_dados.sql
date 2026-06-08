  -- ============================================================
  -- Tabela exigida pelos triggers fn_sync_tabela_geral_* no Supabase
  -- Erro típico sem ela: relation "public.tabela_geral_dados" does not exist
  -- Execute no SQL Editor do Supabase (ou deixe o app criar via init_db).
  -- ============================================================

  create table if not exists public.tabela_geral_dados (
    id bigserial primary key,
    fonte_tabela text not null,
    row_id text,
    acao text not null,
    dados jsonb,
    criado_em timestamptz not null default now()
  );

  create index if not exists idx_tabela_geral_dados_fonte
    on public.tabela_geral_dados (fonte_tabela, criado_em desc);

  create index if not exists idx_tabela_geral_dados_row
    on public.tabela_geral_dados (fonte_tabela, row_id);

  comment on table public.tabela_geral_dados is
    'Auditoria/replicação de mudanças (alimentada por fn_sync_tabela_geral_dados).';

  -- Snapshot (alguns projetos usam fn_sync_tabela_geral_snapshot)
  create table if not exists public.tabela_geral_snapshot (
    fonte_tabela text not null,
    row_id text not null,
    dados jsonb,
    atualizado_em timestamptz not null default now(),
    primary key (fonte_tabela, row_id)
  );

  comment on table public.tabela_geral_snapshot is
    'Último estado por linha (alimentada por fn_sync_tabela_geral_snapshot, se existir).';
