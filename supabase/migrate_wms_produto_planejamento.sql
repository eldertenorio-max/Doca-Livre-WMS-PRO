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

COMMENT ON COLUMN public.wms_produto_enderecamento.estoque_atual IS 'Cache: caixas no WMS (paletes armazenados). Recalculado do estoque real.';
COMMENT ON COLUMN public.wms_produto_enderecamento.posicao_atual IS 'Cache: posições WMS ocupadas pelo SKU. Recalculado do estoque real.';
COMMENT ON COLUMN public.wms_produto_enderecamento.status_condicional IS 'Cache: Verde/Amarelo/Vermelho/Excedido calculado vs metas planejadas.';

CREATE INDEX IF NOT EXISTS idx_wms_prod_status ON public.wms_produto_enderecamento (status_condicional);
CREATE INDEX IF NOT EXISTS idx_wms_prod_posicoes ON public.wms_produto_enderecamento (categoria, posicoes_med);
