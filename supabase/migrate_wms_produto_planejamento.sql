-- Campos de planejamento de estoque / posições por SKU (WMS)
ALTER TABLE public.wms_produto_enderecamento ADD COLUMN IF NOT EXISTS pedido_med_abril INTEGER;
ALTER TABLE public.wms_produto_enderecamento ADD COLUMN IF NOT EXISTS pedido_max_abril INTEGER;
ALTER TABLE public.wms_produto_enderecamento ADD COLUMN IF NOT EXISTS media_5_dias INTEGER;
ALTER TABLE public.wms_produto_enderecamento ADD COLUMN IF NOT EXISTS estoque_ideal_max INTEGER;
ALTER TABLE public.wms_produto_enderecamento ADD COLUMN IF NOT EXISTS estoque_ideal_med INTEGER;
ALTER TABLE public.wms_produto_enderecamento ADD COLUMN IF NOT EXISTS estoque_ideal_min INTEGER;
ALTER TABLE public.wms_produto_enderecamento ADD COLUMN IF NOT EXISTS dias_estoque_max SMALLINT;
ALTER TABLE public.wms_produto_enderecamento ADD COLUMN IF NOT EXISTS dias_estoque_med SMALLINT;
ALTER TABLE public.wms_produto_enderecamento ADD COLUMN IF NOT EXISTS dias_estoque_min SMALLINT;
ALTER TABLE public.wms_produto_enderecamento ADD COLUMN IF NOT EXISTS posicoes_max SMALLINT;
ALTER TABLE public.wms_produto_enderecamento ADD COLUMN IF NOT EXISTS posicoes_med SMALLINT;
ALTER TABLE public.wms_produto_enderecamento ADD COLUMN IF NOT EXISTS posicoes_min SMALLINT;
ALTER TABLE public.wms_produto_enderecamento ADD COLUMN IF NOT EXISTS estoque_atual INTEGER;
ALTER TABLE public.wms_produto_enderecamento ADD COLUMN IF NOT EXISTS posicao_atual SMALLINT;
ALTER TABLE public.wms_produto_enderecamento ADD COLUMN IF NOT EXISTS status_condicional TEXT;

CREATE INDEX IF NOT EXISTS idx_wms_prod_status ON public.wms_produto_enderecamento (status_condicional);
CREATE INDEX IF NOT EXISTS idx_wms_prod_posicoes ON public.wms_produto_enderecamento (categoria, posicoes_med);
