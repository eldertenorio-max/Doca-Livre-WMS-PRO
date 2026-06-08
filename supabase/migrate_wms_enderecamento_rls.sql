-- ============================================================
-- WMS Endereçamento: habilitar RLS e políticas
-- ============================================================
-- Remove o selo "SEM RESTRIÇÕES" / UNRESTRICTED no painel Supabase.
-- Execute no SQL Editor DEPOIS de create_wms_enderecamento.sql.
-- Idempotente (pode rodar mais de uma vez).
-- O Flask usa conexão postgres direta (bypass RLS); PostgREST usa as policies.
-- ============================================================

-- Habilitar RLS
ALTER TABLE public.wms_camara ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wms_localizacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wms_produto_enderecamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wms_zoneamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wms_palete ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wms_palete_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wms_movimentacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wms_posicao_picking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wms_recebimento ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wms_recebimento_palete ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wms_check_qualidade ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wms_check_qualidade_resposta ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wms_inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wms_inventario_linha ENABLE ROW LEVEL SECURITY;

-- Macro manual: para cada tabela, drop + create policies
-- wms_camara
DROP POLICY IF EXISTS "Permitir SELECT em wms_camara" ON public.wms_camara;
DROP POLICY IF EXISTS "Permitir INSERT em wms_camara" ON public.wms_camara;
DROP POLICY IF EXISTS "Permitir UPDATE em wms_camara" ON public.wms_camara;
DROP POLICY IF EXISTS "Permitir DELETE em wms_camara" ON public.wms_camara;
CREATE POLICY "Permitir SELECT em wms_camara" ON public.wms_camara FOR SELECT USING (true);
CREATE POLICY "Permitir INSERT em wms_camara" ON public.wms_camara FOR INSERT
  WITH CHECK ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));
CREATE POLICY "Permitir UPDATE em wms_camara" ON public.wms_camara FOR UPDATE
  USING ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));
CREATE POLICY "Permitir DELETE em wms_camara" ON public.wms_camara FOR DELETE
  USING ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- wms_localizacao
DROP POLICY IF EXISTS "Permitir SELECT em wms_localizacao" ON public.wms_localizacao;
DROP POLICY IF EXISTS "Permitir INSERT em wms_localizacao" ON public.wms_localizacao;
DROP POLICY IF EXISTS "Permitir UPDATE em wms_localizacao" ON public.wms_localizacao;
DROP POLICY IF EXISTS "Permitir DELETE em wms_localizacao" ON public.wms_localizacao;
CREATE POLICY "Permitir SELECT em wms_localizacao" ON public.wms_localizacao FOR SELECT USING (true);
CREATE POLICY "Permitir INSERT em wms_localizacao" ON public.wms_localizacao FOR INSERT
  WITH CHECK ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));
CREATE POLICY "Permitir UPDATE em wms_localizacao" ON public.wms_localizacao FOR UPDATE
  USING ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));
CREATE POLICY "Permitir DELETE em wms_localizacao" ON public.wms_localizacao FOR DELETE
  USING ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- wms_produto_enderecamento
DROP POLICY IF EXISTS "Permitir SELECT em wms_produto_enderecamento" ON public.wms_produto_enderecamento;
DROP POLICY IF EXISTS "Permitir INSERT em wms_produto_enderecamento" ON public.wms_produto_enderecamento;
DROP POLICY IF EXISTS "Permitir UPDATE em wms_produto_enderecamento" ON public.wms_produto_enderecamento;
DROP POLICY IF EXISTS "Permitir DELETE em wms_produto_enderecamento" ON public.wms_produto_enderecamento;
CREATE POLICY "Permitir SELECT em wms_produto_enderecamento" ON public.wms_produto_enderecamento FOR SELECT USING (true);
CREATE POLICY "Permitir INSERT em wms_produto_enderecamento" ON public.wms_produto_enderecamento FOR INSERT
  WITH CHECK ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));
CREATE POLICY "Permitir UPDATE em wms_produto_enderecamento" ON public.wms_produto_enderecamento FOR UPDATE
  USING ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));
CREATE POLICY "Permitir DELETE em wms_produto_enderecamento" ON public.wms_produto_enderecamento FOR DELETE
  USING ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- wms_zoneamento
DROP POLICY IF EXISTS "Permitir SELECT em wms_zoneamento" ON public.wms_zoneamento;
DROP POLICY IF EXISTS "Permitir INSERT em wms_zoneamento" ON public.wms_zoneamento;
DROP POLICY IF EXISTS "Permitir UPDATE em wms_zoneamento" ON public.wms_zoneamento;
DROP POLICY IF EXISTS "Permitir DELETE em wms_zoneamento" ON public.wms_zoneamento;
CREATE POLICY "Permitir SELECT em wms_zoneamento" ON public.wms_zoneamento FOR SELECT USING (true);
CREATE POLICY "Permitir INSERT em wms_zoneamento" ON public.wms_zoneamento FOR INSERT
  WITH CHECK ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));
CREATE POLICY "Permitir UPDATE em wms_zoneamento" ON public.wms_zoneamento FOR UPDATE
  USING ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));
CREATE POLICY "Permitir DELETE em wms_zoneamento" ON public.wms_zoneamento FOR DELETE
  USING ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- wms_palete
DROP POLICY IF EXISTS "Permitir SELECT em wms_palete" ON public.wms_palete;
DROP POLICY IF EXISTS "Permitir INSERT em wms_palete" ON public.wms_palete;
DROP POLICY IF EXISTS "Permitir UPDATE em wms_palete" ON public.wms_palete;
DROP POLICY IF EXISTS "Permitir DELETE em wms_palete" ON public.wms_palete;
CREATE POLICY "Permitir SELECT em wms_palete" ON public.wms_palete FOR SELECT USING (true);
CREATE POLICY "Permitir INSERT em wms_palete" ON public.wms_palete FOR INSERT
  WITH CHECK ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));
CREATE POLICY "Permitir UPDATE em wms_palete" ON public.wms_palete FOR UPDATE
  USING ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));
CREATE POLICY "Permitir DELETE em wms_palete" ON public.wms_palete FOR DELETE
  USING ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- wms_palete_item
DROP POLICY IF EXISTS "Permitir SELECT em wms_palete_item" ON public.wms_palete_item;
DROP POLICY IF EXISTS "Permitir INSERT em wms_palete_item" ON public.wms_palete_item;
DROP POLICY IF EXISTS "Permitir UPDATE em wms_palete_item" ON public.wms_palete_item;
DROP POLICY IF EXISTS "Permitir DELETE em wms_palete_item" ON public.wms_palete_item;
CREATE POLICY "Permitir SELECT em wms_palete_item" ON public.wms_palete_item FOR SELECT USING (true);
CREATE POLICY "Permitir INSERT em wms_palete_item" ON public.wms_palete_item FOR INSERT
  WITH CHECK ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));
CREATE POLICY "Permitir UPDATE em wms_palete_item" ON public.wms_palete_item FOR UPDATE
  USING ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));
CREATE POLICY "Permitir DELETE em wms_palete_item" ON public.wms_palete_item FOR DELETE
  USING ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- wms_movimentacao
DROP POLICY IF EXISTS "Permitir SELECT em wms_movimentacao" ON public.wms_movimentacao;
DROP POLICY IF EXISTS "Permitir INSERT em wms_movimentacao" ON public.wms_movimentacao;
DROP POLICY IF EXISTS "Permitir UPDATE em wms_movimentacao" ON public.wms_movimentacao;
DROP POLICY IF EXISTS "Permitir DELETE em wms_movimentacao" ON public.wms_movimentacao;
CREATE POLICY "Permitir SELECT em wms_movimentacao" ON public.wms_movimentacao FOR SELECT USING (true);
CREATE POLICY "Permitir INSERT em wms_movimentacao" ON public.wms_movimentacao FOR INSERT
  WITH CHECK ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));
CREATE POLICY "Permitir UPDATE em wms_movimentacao" ON public.wms_movimentacao FOR UPDATE
  USING ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));
CREATE POLICY "Permitir DELETE em wms_movimentacao" ON public.wms_movimentacao FOR DELETE
  USING ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- wms_posicao_picking
DROP POLICY IF EXISTS "Permitir SELECT em wms_posicao_picking" ON public.wms_posicao_picking;
DROP POLICY IF EXISTS "Permitir INSERT em wms_posicao_picking" ON public.wms_posicao_picking;
DROP POLICY IF EXISTS "Permitir UPDATE em wms_posicao_picking" ON public.wms_posicao_picking;
DROP POLICY IF EXISTS "Permitir DELETE em wms_posicao_picking" ON public.wms_posicao_picking;
CREATE POLICY "Permitir SELECT em wms_posicao_picking" ON public.wms_posicao_picking FOR SELECT USING (true);
CREATE POLICY "Permitir INSERT em wms_posicao_picking" ON public.wms_posicao_picking FOR INSERT
  WITH CHECK ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));
CREATE POLICY "Permitir UPDATE em wms_posicao_picking" ON public.wms_posicao_picking FOR UPDATE
  USING ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));
CREATE POLICY "Permitir DELETE em wms_posicao_picking" ON public.wms_posicao_picking FOR DELETE
  USING ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- wms_recebimento
DROP POLICY IF EXISTS "Permitir SELECT em wms_recebimento" ON public.wms_recebimento;
DROP POLICY IF EXISTS "Permitir INSERT em wms_recebimento" ON public.wms_recebimento;
DROP POLICY IF EXISTS "Permitir UPDATE em wms_recebimento" ON public.wms_recebimento;
DROP POLICY IF EXISTS "Permitir DELETE em wms_recebimento" ON public.wms_recebimento;
CREATE POLICY "Permitir SELECT em wms_recebimento" ON public.wms_recebimento FOR SELECT USING (true);
CREATE POLICY "Permitir INSERT em wms_recebimento" ON public.wms_recebimento FOR INSERT
  WITH CHECK ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));
CREATE POLICY "Permitir UPDATE em wms_recebimento" ON public.wms_recebimento FOR UPDATE
  USING ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));
CREATE POLICY "Permitir DELETE em wms_recebimento" ON public.wms_recebimento FOR DELETE
  USING ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- wms_recebimento_palete
DROP POLICY IF EXISTS "Permitir SELECT em wms_recebimento_palete" ON public.wms_recebimento_palete;
DROP POLICY IF EXISTS "Permitir INSERT em wms_recebimento_palete" ON public.wms_recebimento_palete;
DROP POLICY IF EXISTS "Permitir UPDATE em wms_recebimento_palete" ON public.wms_recebimento_palete;
DROP POLICY IF EXISTS "Permitir DELETE em wms_recebimento_palete" ON public.wms_recebimento_palete;
CREATE POLICY "Permitir SELECT em wms_recebimento_palete" ON public.wms_recebimento_palete FOR SELECT USING (true);
CREATE POLICY "Permitir INSERT em wms_recebimento_palete" ON public.wms_recebimento_palete FOR INSERT
  WITH CHECK ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));
CREATE POLICY "Permitir UPDATE em wms_recebimento_palete" ON public.wms_recebimento_palete FOR UPDATE
  USING ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));
CREATE POLICY "Permitir DELETE em wms_recebimento_palete" ON public.wms_recebimento_palete FOR DELETE
  USING ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- wms_check_qualidade
DROP POLICY IF EXISTS "Permitir SELECT em wms_check_qualidade" ON public.wms_check_qualidade;
DROP POLICY IF EXISTS "Permitir INSERT em wms_check_qualidade" ON public.wms_check_qualidade;
DROP POLICY IF EXISTS "Permitir UPDATE em wms_check_qualidade" ON public.wms_check_qualidade;
DROP POLICY IF EXISTS "Permitir DELETE em wms_check_qualidade" ON public.wms_check_qualidade;
CREATE POLICY "Permitir SELECT em wms_check_qualidade" ON public.wms_check_qualidade FOR SELECT USING (true);
CREATE POLICY "Permitir INSERT em wms_check_qualidade" ON public.wms_check_qualidade FOR INSERT
  WITH CHECK ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));
CREATE POLICY "Permitir UPDATE em wms_check_qualidade" ON public.wms_check_qualidade FOR UPDATE
  USING ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));
CREATE POLICY "Permitir DELETE em wms_check_qualidade" ON public.wms_check_qualidade FOR DELETE
  USING ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- wms_check_qualidade_resposta
DROP POLICY IF EXISTS "Permitir SELECT em wms_check_qualidade_resposta" ON public.wms_check_qualidade_resposta;
DROP POLICY IF EXISTS "Permitir INSERT em wms_check_qualidade_resposta" ON public.wms_check_qualidade_resposta;
DROP POLICY IF EXISTS "Permitir UPDATE em wms_check_qualidade_resposta" ON public.wms_check_qualidade_resposta;
DROP POLICY IF EXISTS "Permitir DELETE em wms_check_qualidade_resposta" ON public.wms_check_qualidade_resposta;
CREATE POLICY "Permitir SELECT em wms_check_qualidade_resposta" ON public.wms_check_qualidade_resposta FOR SELECT USING (true);
CREATE POLICY "Permitir INSERT em wms_check_qualidade_resposta" ON public.wms_check_qualidade_resposta FOR INSERT
  WITH CHECK ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));
CREATE POLICY "Permitir UPDATE em wms_check_qualidade_resposta" ON public.wms_check_qualidade_resposta FOR UPDATE
  USING ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));
CREATE POLICY "Permitir DELETE em wms_check_qualidade_resposta" ON public.wms_check_qualidade_resposta FOR DELETE
  USING ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- wms_inventario
DROP POLICY IF EXISTS "Permitir SELECT em wms_inventario" ON public.wms_inventario;
DROP POLICY IF EXISTS "Permitir INSERT em wms_inventario" ON public.wms_inventario;
DROP POLICY IF EXISTS "Permitir UPDATE em wms_inventario" ON public.wms_inventario;
DROP POLICY IF EXISTS "Permitir DELETE em wms_inventario" ON public.wms_inventario;
CREATE POLICY "Permitir SELECT em wms_inventario" ON public.wms_inventario FOR SELECT USING (true);
CREATE POLICY "Permitir INSERT em wms_inventario" ON public.wms_inventario FOR INSERT
  WITH CHECK ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));
CREATE POLICY "Permitir UPDATE em wms_inventario" ON public.wms_inventario FOR UPDATE
  USING ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));
CREATE POLICY "Permitir DELETE em wms_inventario" ON public.wms_inventario FOR DELETE
  USING ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));

-- wms_inventario_linha
DROP POLICY IF EXISTS "Permitir SELECT em wms_inventario_linha" ON public.wms_inventario_linha;
DROP POLICY IF EXISTS "Permitir INSERT em wms_inventario_linha" ON public.wms_inventario_linha;
DROP POLICY IF EXISTS "Permitir UPDATE em wms_inventario_linha" ON public.wms_inventario_linha;
DROP POLICY IF EXISTS "Permitir DELETE em wms_inventario_linha" ON public.wms_inventario_linha;
CREATE POLICY "Permitir SELECT em wms_inventario_linha" ON public.wms_inventario_linha FOR SELECT USING (true);
CREATE POLICY "Permitir INSERT em wms_inventario_linha" ON public.wms_inventario_linha FOR INSERT
  WITH CHECK ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));
CREATE POLICY "Permitir UPDATE em wms_inventario_linha" ON public.wms_inventario_linha FOR UPDATE
  USING ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));
CREATE POLICY "Permitir DELETE em wms_inventario_linha" ON public.wms_inventario_linha FOR DELETE
  USING ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));
