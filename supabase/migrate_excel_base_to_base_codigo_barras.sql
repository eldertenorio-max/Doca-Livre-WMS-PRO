-- Migração: renomear excel_base para base_codigo_barras
-- Execute apenas se você já criou a tabela com o nome antigo (excel_base).

alter table if exists public.excel_base rename to base_codigo_barras;

-- Renomear índices para manter padrão (opcional)
alter index if exists idx_excel_base_dataset rename to idx_base_codigo_barras_dataset;
alter index if exists idx_excel_base_codigo_interno rename to idx_base_codigo_barras_codigo_interno;
alter index if exists idx_excel_base_ean rename to idx_base_codigo_barras_ean;
alter index if exists idx_excel_base_dun rename to idx_base_codigo_barras_dun;

-- Comentário
comment on table public.base_codigo_barras is 'Base de codigo de barras (aba BASE da planilha - cadastro de produtos)';

-- Nota: após o RENAME, as políticas RLS continuam válidas na nova tabela
-- (os nomes das políticas continuam com "excel_base" no texto, mas se aplicam a base_codigo_barras).
