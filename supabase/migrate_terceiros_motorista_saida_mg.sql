-- Separa motorista/placa de chegada do motorista/placa que leva para MG.
alter table if exists public.terceiros_documentos
  add column if not exists motorista_saida_mg text,
  add column if not exists motorista_saida_mg_em timestamptz,
  add column if not exists placa_saida_mg text;
