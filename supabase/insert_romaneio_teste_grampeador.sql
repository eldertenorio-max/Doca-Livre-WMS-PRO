-- =============================================================================
-- ROTEIRO DE TESTE: 1 item (GRAMPEADOR, 20 unidades) na tabela romaneio_por_item
-- Cole este script no SQL Editor do Supabase e execute.
-- ID da viagem/roteiro de teste: TESTE-001 (use na aba Conferência para carregar).
-- =============================================================================
-- Se a tabela de datasets no seu projeto for "conjuntos_de_dados_excel", troque
-- "excel_datasets" por "conjuntos_de_dados_excel" nas duas ocorrências abaixo.
-- =============================================================================

INSERT INTO public.romaneio_por_item (
  dataset_id,
  row_index,
  id_roteiro,
  id_viagem,
  identificador_rota,
  codigo_produto,
  descricao,
  quantidade,
  unidade,
  peso_bruto,
  codigo_cliente,
  endereco,
  cidade,
  placa,
  motorista,
  data_expedicao,
  importado_em,
  data
)
SELECT
  (SELECT dataset_id FROM public.excel_datasets WHERE ativo = true LIMIT 1),
  COALESCE(
    (SELECT MAX(r.row_index) FROM public.romaneio_por_item r
     WHERE r.dataset_id = (SELECT dataset_id FROM public.excel_datasets WHERE ativo = true LIMIT 1)),
    0
  ) + 1,
  'TESTE-001',
  'TESTE-001',
  'Rota Teste GRAMPEADOR',
  '2030',
  'GRAMPEADOR',
  20,
  'CX',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  to_char(now()::date, 'YYYY-MM-DD'),
  now(),
  jsonb_build_object(
    'Codigo', '2030',
    'Descricao', 'GRAMPEADOR',
    'Unidade', 'CX',
    'Cod. EAN-13', '7898914270489',
    'Cod. DUN-14', '789689459716',
    'quantidade', 20,
    'id_roteiro', 'TESTE-001',
    'id_viagem', 'TESTE-001',
    'identificador_rota', 'Rota Teste GRAMPEADOR',
    'importado_em', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );

-- Conferir: na aba Conferência do app, digite o ID: TESTE-001 e busque.
-- Deve aparecer 1 item: GRAMPEADOR, 20 unidades (CX).
--
-- =============================================================================
-- ALTERNATIVA: se der erro "relation excel_datasets does not exist", use a tabela
-- de datasets do seu projeto (ex.: conjuntos_de_dados_excel) ou informe um dataset_id
-- fixo substituindo as subqueries por um UUID, por exemplo:
--   dataset_id: '05980ff3-c6a8-45e8-bb2b-774580fe9418'  (troque pelo seu dataset_id ativo)
--   e em MAX(row_index) use o mesmo UUID em: WHERE r.dataset_id = '05980ff3-c6a8-45e8-bb2b-774580fe9418'
-- =============================================================================
