-- Adiciona coluna identificador_rota na tabela de romaneio por item.
-- Execute no Supabase (SQL Editor) se a coluna ainda nao existir.
-- O app tambem tenta adicionar automaticamente ao iniciar (init_db).

ALTER TABLE public.romaneio_por_item ADD COLUMN IF NOT EXISTS identificador_rota TEXT;
ALTER TABLE public.excel_romaneio_por_item ADD COLUMN IF NOT EXISTS identificador_rota TEXT;
