-- Remove a tabela excel_colaboradores (redundante; usar tabelas colaboradores e motoristas)
-- Execute no SQL Editor do Supabase. As políticas RLS sao removidas junto com a tabela.

drop table if exists public.excel_colaboradores;
