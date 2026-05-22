-- Motivos ao encerrar etapa com «Não» (lançamento, envio MG, recebida MG).
-- Execute no SQL Editor do Supabase após migrate_terceiros_rls.sql.

alter table public.terceiros_documentos
  add column if not exists motivo_nao_lancada text,
  add column if not exists motivo_nao_enviar_mg text,
  add column if not exists motivo_nao_recebida_mg text;
