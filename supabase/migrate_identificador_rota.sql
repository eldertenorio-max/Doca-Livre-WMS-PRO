-- Adiciona coluna identificador_rota na tabela de romaneio por item.
-- Execute no Supabase (SQL Editor) se a coluna ainda nao existir.
-- O app tambem tenta adicionar automaticamente ao iniciar (init_db).
-- (Se sua base usar a tabela excel_romaneio_por_item, descomente a linha abaixo.)

ALTER TABLE public.romaneio_por_item ADD COLUMN IF NOT EXISTS identificador_rota TEXT;
-- ALTER TABLE public.excel_romaneio_por_item ADD COLUMN IF NOT EXISTS identificador_rota TEXT;

-- Preenche id_roteiro onde estiver NULL usando id_viagem (dados antigos ou quando a API nao retornou roteiro).
UPDATE public.romaneio_por_item SET id_roteiro = id_viagem WHERE id_roteiro IS NULL AND id_viagem IS NOT NULL;
