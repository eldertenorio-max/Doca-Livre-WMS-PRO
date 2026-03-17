-- =============================================================================
-- 1) DIAGNÓSTICO: Ver se o registro TESTE-001 existe e qual o dataset_id dele
-- =============================================================================
SELECT id_viagem, id_roteiro, codigo_produto, descricao, quantidade, dataset_id, row_index
FROM public.romaneio_por_item
WHERE TRIM(COALESCE(id_viagem::text, '')) = 'TESTE-001'
   OR TRIM(COALESCE(id_roteiro::text, '')) = 'TESTE-001';

-- =============================================================================
-- 2) Qual é o dataset_id ATIVO que o app usa? (excel_datasets ou conjuntos_de_dados_excel)
-- =============================================================================
SELECT dataset_id, arquivo_nome, importado_em, ativo
FROM public.excel_datasets
WHERE ativo = true
LIMIT 1;
-- Se der erro "excel_datasets does not exist", tente:
-- SELECT * FROM public.conjuntos_de_dados_excel WHERE ativo = true LIMIT 1;

-- =============================================================================
-- 3) CORRIGIR: Atualizar o(s) registro(s) TESTE-001 para usar o dataset ativo
--    (rode só depois de ver o resultado dos SELECTs acima; substitua SEU_DATASET_ID pelo UUID ativo)
-- =============================================================================
-- UPDATE public.romaneio_por_item
-- SET dataset_id = (SELECT dataset_id FROM public.excel_datasets WHERE ativo = true LIMIT 1)
-- WHERE TRIM(COALESCE(id_viagem::text, '')) = 'TESTE-001'
--    OR TRIM(COALESCE(id_roteiro::text, '')) = 'TESTE-001';

-- Versão que já usa o dataset ativo (descomente as 4 linhas acima e comente a de baixo, ou use esta):
UPDATE public.romaneio_por_item
SET dataset_id = (SELECT dataset_id FROM public.excel_datasets WHERE ativo = true LIMIT 1)
WHERE TRIM(COALESCE(id_viagem::text, '')) = 'TESTE-001'
   OR TRIM(COALESCE(id_roteiro::text, '')) = 'TESTE-001';
