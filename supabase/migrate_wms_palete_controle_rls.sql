-- RLS em wms_palete_controle (remove "SEM RESTRIÇÕES" no painel Supabase)
-- Execute no SQL Editor do projeto Sistema WMS.
-- Idempotente (pode rodar mais de uma vez).

ALTER TABLE public.wms_palete_controle ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir SELECT em wms_palete_controle" ON public.wms_palete_controle;
DROP POLICY IF EXISTS "Permitir INSERT em wms_palete_controle" ON public.wms_palete_controle;
DROP POLICY IF EXISTS "Permitir UPDATE em wms_palete_controle" ON public.wms_palete_controle;
DROP POLICY IF EXISTS "Permitir DELETE em wms_palete_controle" ON public.wms_palete_controle;

CREATE POLICY "Permitir SELECT em wms_palete_controle"
  ON public.wms_palete_controle FOR SELECT USING (true);

CREATE POLICY "Permitir INSERT em wms_palete_controle"
  ON public.wms_palete_controle FOR INSERT
  WITH CHECK ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));

CREATE POLICY "Permitir UPDATE em wms_palete_controle"
  ON public.wms_palete_controle FOR UPDATE
  USING ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));

CREATE POLICY "Permitir DELETE em wms_palete_controle"
  ON public.wms_palete_controle FOR DELETE
  USING ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));
