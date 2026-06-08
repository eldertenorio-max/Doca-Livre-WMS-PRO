-- WMS Endereçamento — UltraPão Guarulhos
-- Execute no SQL Editor do Supabase (projeto Sistema WMS)

-- Câmaras
CREATE TABLE IF NOT EXISTS public.wms_camara (
  id BIGSERIAL PRIMARY KEY,
  codigo SMALLINT NOT NULL UNIQUE,
  descricao TEXT NOT NULL,
  total_posicoes INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Localizações (bin: câmara + rua + posição + nível)
CREATE TABLE IF NOT EXISTS public.wms_localizacao (
  id BIGSERIAL PRIMARY KEY,
  camara SMALLINT NOT NULL,
  rua TEXT NOT NULL,
  posicao SMALLINT NOT NULL,
  nivel SMALLINT NOT NULL DEFAULT 1,
  codigo_endereco TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL DEFAULT 'porta_palete',
  status TEXT NOT NULL DEFAULT 'vazia',
  capacidade_max SMALLINT NOT NULL DEFAULT 1,
  bloqueio_entrada BOOLEAN NOT NULL DEFAULT FALSE,
  bloqueio_saida BOOLEAN NOT NULL DEFAULT FALSE,
  bloqueio_inventario BOOLEAN NOT NULL DEFAULT FALSE,
  area TEXT,
  categoria_zona TEXT,
  zona_armazenagem TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (camara, rua, posicao, nivel)
);

CREATE INDEX IF NOT EXISTS idx_wms_loc_camara ON public.wms_localizacao (camara, status);
CREATE INDEX IF NOT EXISTS idx_wms_loc_status ON public.wms_localizacao (status);
CREATE INDEX IF NOT EXISTS idx_wms_loc_categoria_zona ON public.wms_localizacao (categoria_zona, camara, status);

-- Classificação de produtos para endereçamento (categoria A/B/C/D)
CREATE TABLE IF NOT EXISTS public.wms_produto_enderecamento (
  id BIGSERIAL PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  descricao TEXT,
  medida_cx TEXT,
  cubagem NUMERIC(12, 6),
  peso_cx NUMERIC(12, 3),
  padrao_plt TEXT,
  conversao INTEGER,
  categoria TEXT NOT NULL DEFAULT 'C',
  pedido_med_abril INTEGER,
  pedido_max_abril INTEGER,
  media_5_dias INTEGER,
  estoque_ideal_max INTEGER,
  estoque_ideal_med INTEGER,
  estoque_ideal_min INTEGER,
  dias_estoque_max SMALLINT,
  dias_estoque_med SMALLINT,
  dias_estoque_min SMALLINT,
  posicoes_max SMALLINT,
  posicoes_med SMALLINT,
  posicoes_min SMALLINT,
  estoque_atual INTEGER,
  posicao_atual SMALLINT,
  status_condicional TEXT,
  temperatura_zona TEXT DEFAULT 'congelado',
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wms_prod_cat ON public.wms_produto_enderecamento (categoria);

-- Zoneamento: categoria → câmara preferencial
CREATE TABLE IF NOT EXISTS public.wms_zoneamento (
  id BIGSERIAL PRIMARY KEY,
  categoria TEXT NOT NULL,
  camara SMALLINT NOT NULL,
  prioridade SMALLINT NOT NULL DEFAULT 1,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (categoria, camara)
);

-- Paletes (etiqueta 22 caracteres)
CREATE TABLE IF NOT EXISTS public.wms_palete (
  id BIGSERIAL PRIMARY KEY,
  etiqueta TEXT NOT NULL UNIQUE CHECK (char_length(etiqueta) = 22),
  localizacao_id BIGINT REFERENCES public.wms_localizacao(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'em_conferencia',
  estado_fisico TEXT DEFAULT 'bom',
  temperatura NUMERIC(6, 2),
  bloqueio_tipo TEXT,
  bloqueio_motivo TEXT,
  recebimento_id BIGINT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_por TEXT
);

CREATE INDEX IF NOT EXISTS idx_wms_palete_loc ON public.wms_palete (localizacao_id);
CREATE INDEX IF NOT EXISTS idx_wms_palete_status ON public.wms_palete (status);

-- Itens do palete
CREATE TABLE IF NOT EXISTS public.wms_palete_item (
  id BIGSERIAL PRIMARY KEY,
  palete_id BIGINT NOT NULL REFERENCES public.wms_palete(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  descricao TEXT,
  lote TEXT,
  data_producao DATE,
  data_validade DATE,
  sif TEXT,
  quantidade_caixas INTEGER NOT NULL DEFAULT 0,
  peso_liquido NUMERIC(12, 3),
  rg_caixa TEXT,
  shelf_dias INTEGER,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wms_palete_item_sku ON public.wms_palete_item (sku);
CREATE INDEX IF NOT EXISTS idx_wms_palete_item_lote ON public.wms_palete_item (lote);

-- Movimentações pendentes (empilhadeira / putaway)
CREATE TABLE IF NOT EXISTS public.wms_movimentacao (
  id BIGSERIAL PRIMARY KEY,
  tipo TEXT NOT NULL,
  palete_id BIGINT NOT NULL REFERENCES public.wms_palete(id) ON DELETE CASCADE,
  origem_localizacao_id BIGINT REFERENCES public.wms_localizacao(id) ON DELETE SET NULL,
  destino_localizacao_id BIGINT REFERENCES public.wms_localizacao(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  prioridade SMALLINT NOT NULL DEFAULT 5,
  observacao TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  concluida_em TIMESTAMPTZ,
  criado_por TEXT,
  concluida_por TEXT
);

CREATE INDEX IF NOT EXISTS idx_wms_mov_status ON public.wms_movimentacao (status, prioridade);

-- Posições de picking / buffer
CREATE TABLE IF NOT EXISTS public.wms_posicao_picking (
  id BIGSERIAL PRIMARY KEY,
  localizacao_id BIGINT NOT NULL UNIQUE REFERENCES public.wms_localizacao(id) ON DELETE CASCADE,
  sku TEXT,
  shelf_min_dias INTEGER,
  qtd_minima INTEGER DEFAULT 0,
  buffer BOOLEAN NOT NULL DEFAULT FALSE,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Recebimento WMS clássico
CREATE TABLE IF NOT EXISTS public.wms_recebimento (
  id BIGSERIAL PRIMARY KEY,
  numero_nf TEXT,
  fornecedor TEXT,
  placa TEXT,
  doca TEXT,
  origem TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'aguardando',
  check_qualidade_ok BOOLEAN,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_por TEXT
);

CREATE TABLE IF NOT EXISTS public.wms_recebimento_palete (
  id BIGSERIAL PRIMARY KEY,
  recebimento_id BIGINT NOT NULL REFERENCES public.wms_recebimento(id) ON DELETE CASCADE,
  palete_id BIGINT NOT NULL REFERENCES public.wms_palete(id) ON DELETE CASCADE,
  estado_palete TEXT DEFAULT 'bom',
  conferencia_cega BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (recebimento_id, palete_id)
);

-- Check de qualidade configurável
CREATE TABLE IF NOT EXISTS public.wms_check_qualidade (
  id BIGSERIAL PRIMARY KEY,
  contexto TEXT NOT NULL DEFAULT 'recebimento',
  ordem SMALLINT NOT NULL DEFAULT 1,
  pergunta TEXT NOT NULL,
  tipo_resposta TEXT NOT NULL DEFAULT 'sim_nao',
  ativo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS public.wms_check_qualidade_resposta (
  id BIGSERIAL PRIMARY KEY,
  recebimento_id BIGINT NOT NULL REFERENCES public.wms_recebimento(id) ON DELETE CASCADE,
  pergunta_id BIGINT NOT NULL REFERENCES public.wms_check_qualidade(id) ON DELETE CASCADE,
  resposta TEXT,
  valor_numerico NUMERIC(12, 3),
  respondido_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  respondido_por TEXT
);

-- Inventário
CREATE TABLE IF NOT EXISTS public.wms_inventario (
  id BIGSERIAL PRIMARY KEY,
  tipo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativo',
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalizado_em TIMESTAMPTZ,
  criado_por TEXT
);

CREATE TABLE IF NOT EXISTS public.wms_inventario_linha (
  id BIGSERIAL PRIMARY KEY,
  inventario_id BIGINT NOT NULL REFERENCES public.wms_inventario(id) ON DELETE CASCADE,
  localizacao_id BIGINT REFERENCES public.wms_localizacao(id) ON DELETE SET NULL,
  palete_etiqueta TEXT,
  sku TEXT,
  status_esperado TEXT,
  status_informado TEXT,
  quantidade_contada INTEGER,
  divergencia BOOLEAN NOT NULL DEFAULT FALSE,
  contado_em TIMESTAMPTZ,
  contado_por TEXT
);

COMMENT ON TABLE public.wms_localizacao IS 'Endereços WMS: câmara, rua, posição, nível (bin)';
COMMENT ON TABLE public.wms_palete IS 'Palete com etiqueta de 22 caracteres';
COMMENT ON TABLE public.wms_produto_enderecamento IS 'Cadastro auxiliar SKU + categoria A/B/C/D para zoneamento';

-- Após criar as tabelas, execute também:
--   supabase/migrate_wms_enderecamento_rls.sql
-- (habilita RLS e remove "SEM RESTRIÇÕES" no painel Supabase)
