ALTER TABLE public.terceiros_documentos ADD COLUMN IF NOT EXISTS consumivel_sp TEXT;
ALTER TABLE public.terceiros_documentos ADD COLUMN IF NOT EXISTS recebedor_consumivel_sp TEXT;
ALTER TABLE public.terceiros_documentos ADD COLUMN IF NOT EXISTS consumivel_sp_historico TEXT;
ALTER TABLE public.terceiros_documentos ADD COLUMN IF NOT EXISTS consumivel_sp_historico_em TIMESTAMPTZ;
ALTER TABLE public.terceiros_documentos ADD COLUMN IF NOT EXISTS consumivel_sp_historico_por TEXT;
