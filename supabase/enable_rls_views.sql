-- ============================================================
-- REMOVER "UNRESTRICTED" das VIEWS
-- ============================================================
-- Execute no SQL Editor do Supabase APÓS enable_rls_policies.sql
-- ============================================================

-- Para views, precisamos recriar com SECURITY INVOKER ou SECURITY DEFINER
-- e garantir que as tabelas base já têm RLS configurado

-- ============================================================
-- 1. Recriar v_resumo_viagem com segurança
-- ============================================================

drop view if exists public.v_resumo_viagem;

create view public.v_resumo_viagem
with (security_invoker = true)
as
select
  id_viagem,
  count(*) as total_registros,
  sum(quantidade) as total_quantidade,
  count(distinct codigo_barras) as produtos_unicos,
  min(data_hora) as inicio_carregamento,
  max(data_hora) as fim_carregamento,
  extract(epoch from (max(data_hora) - min(data_hora))) / 60 as duracao_minutos,
  count(*) filter (where status = 'CARREGADO') as itens_carregados,
  count(*) filter (where status = 'PENDENTE') as itens_pendentes
from public.produtos_bipados
group by id_viagem;

comment on view public.v_resumo_viagem is 'Resumo estatístico de bipagem por viagem';

-- ============================================================
-- 2. Recriar v_divergencias com segurança
-- ============================================================

drop view if exists public.v_divergencias;

create view public.v_divergencias
with (security_invoker = true)
as
select
  r.id_roteiro as id_viagem,
  r.codigo_produto,
  r.descricao as produto,
  sum(r.quantidade) as quantidade_esperada,
  coalesce(sum(b.quantidade), 0) as quantidade_bipada,
  sum(r.quantidade) - coalesce(sum(b.quantidade), 0) as divergencia,
  dm.motivo
from public.excel_romaneio_por_item r
left join public.produtos_bipados b
  on r.id_roteiro = b.id_viagem
  and r.codigo_produto = b.codigo_interno
left join public.divergencia_motivo dm
  on r.id_roteiro = dm.id_viagem
  and r.codigo_produto = dm.codigo_produto
where r.dataset_id = (
  select dataset_id
  from public.excel_datasets
  where ativo = true
  order by importado_em desc
  limit 1
)
group by r.id_roteiro, r.codigo_produto, r.descricao, dm.motivo
having sum(r.quantidade) - coalesce(sum(b.quantidade), 0) != 0;

comment on view public.v_divergencias is 'Itens com divergência entre romaneio e bipagem (falta/sobra)';

-- ============================================================
-- PRONTO! Views recriadas com security_invoker
-- ============================================================
-- UNRESTRICTED removido das views ✅
-- ============================================================
