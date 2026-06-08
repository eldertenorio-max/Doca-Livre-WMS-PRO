  -- Período real de bipagem (início/fim), independente de data_hora dos itens gravados em lote.
  CREATE TABLE IF NOT EXISTS public.viagem_periodo_bipagem (
      id_viagem TEXT NOT NULL,
      fluxo TEXT NOT NULL DEFAULT 'carregamento',
      inicio_em TIMESTAMPTZ NOT NULL,
      fim_em TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (id_viagem, fluxo)
  );

  -- RLS (remove selo UNRESTRICTED no painel Supabase)
  ALTER TABLE public.viagem_periodo_bipagem ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "Permitir SELECT em viagem_periodo_bipagem" ON public.viagem_periodo_bipagem;
  DROP POLICY IF EXISTS "Permitir INSERT em viagem_periodo_bipagem" ON public.viagem_periodo_bipagem;
  DROP POLICY IF EXISTS "Permitir UPDATE em viagem_periodo_bipagem" ON public.viagem_periodo_bipagem;
  DROP POLICY IF EXISTS "Permitir DELETE em viagem_periodo_bipagem" ON public.viagem_periodo_bipagem;

  CREATE POLICY "Permitir SELECT em viagem_periodo_bipagem"
    ON public.viagem_periodo_bipagem FOR SELECT USING (true);
  CREATE POLICY "Permitir INSERT em viagem_periodo_bipagem"
    ON public.viagem_periodo_bipagem FOR INSERT
    WITH CHECK ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));
  CREATE POLICY "Permitir UPDATE em viagem_periodo_bipagem"
    ON public.viagem_periodo_bipagem FOR UPDATE
    USING ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));
  CREATE POLICY "Permitir DELETE em viagem_periodo_bipagem"
    ON public.viagem_periodo_bipagem FOR DELETE
    USING ((SELECT auth.role() IN ('anon'::text, 'authenticated'::text, 'service_role'::text)));
