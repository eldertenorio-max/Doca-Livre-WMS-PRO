-- Habilita RLS em portal_email_codigos (remove UNRESTRICTED no Supabase).
-- Sem policies para anon/authenticated: códigos OTP só pelo backend (DATABASE_URL).
-- service_role / postgres bypassam RLS automaticamente.

ALTER TABLE public.portal_email_codigos ENABLE ROW LEVEL SECURITY;

-- Garante que nada do PostgREST público leia hashes de código
DROP POLICY IF EXISTS "Permitir SELECT em portal_email_codigos" ON public.portal_email_codigos;
DROP POLICY IF EXISTS "Permitir INSERT em portal_email_codigos" ON public.portal_email_codigos;
DROP POLICY IF EXISTS "Permitir UPDATE em portal_email_codigos" ON public.portal_email_codigos;
DROP POLICY IF EXISTS "Permitir DELETE em portal_email_codigos" ON public.portal_email_codigos;
