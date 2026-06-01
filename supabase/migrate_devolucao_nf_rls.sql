-- Habilita RLS em devolucao_nota_fiscal (remove UNRESTRICTED no Supabase).
-- Execute no SQL Editor se a tabela já existir sem RLS.

ALTER TABLE public.devolucao_nota_fiscal ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir SELECT em devolucao_nota_fiscal" ON public.devolucao_nota_fiscal;
DROP POLICY IF EXISTS "Permitir INSERT em devolucao_nota_fiscal" ON public.devolucao_nota_fiscal;
DROP POLICY IF EXISTS "Permitir UPDATE em devolucao_nota_fiscal" ON public.devolucao_nota_fiscal;
DROP POLICY IF EXISTS "Permitir DELETE em devolucao_nota_fiscal" ON public.devolucao_nota_fiscal;

CREATE POLICY "Permitir SELECT em devolucao_nota_fiscal"
  ON public.devolucao_nota_fiscal FOR SELECT USING (true);
CREATE POLICY "Permitir INSERT em devolucao_nota_fiscal"
  ON public.devolucao_nota_fiscal FOR INSERT
  WITH CHECK ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));
CREATE POLICY "Permitir UPDATE em devolucao_nota_fiscal"
  ON public.devolucao_nota_fiscal FOR UPDATE
  USING ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));
CREATE POLICY "Permitir DELETE em devolucao_nota_fiscal"
  ON public.devolucao_nota_fiscal FOR DELETE
  USING ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));
