-- Remove excel_romaneio_por_item (legado Excel — antigo não usa; app usa romaneio_por_item).
-- Execute no SQL Editor do Sistema WMS.

drop view if exists public.v_divergencias;

drop table if exists public.excel_romaneio_por_item cascade;

create view public.v_divergencias
with (security_invoker = true)
as
select
  coalesce(nullif(trim(r.id_viagem), ''), nullif(trim(r.id_roteiro), '')) as id_viagem,
  r.codigo_produto,
  r.descricao as produto,
  sum(r.quantidade) as quantidade_esperada,
  coalesce(sum(b.quantidade), 0) as quantidade_bipada,
  sum(r.quantidade) - coalesce(sum(b.quantidade), 0) as divergencia,
  dm.motivo
from public.romaneio_por_item r
left join public.produtos_bipados b
  on coalesce(nullif(trim(r.id_viagem), ''), nullif(trim(r.id_roteiro), '')) = b.id_viagem
  and r.codigo_produto = b.codigo_interno
left join public.divergencia_motivo dm
  on coalesce(nullif(trim(r.id_viagem), ''), nullif(trim(r.id_roteiro), '')) = dm.id_viagem
  and r.codigo_produto = dm.codigo_produto
where r.dataset_id = (
  select dataset_id
  from public.excel_datasets
  where ativo = true
  order by importado_em desc
  limit 1
)
group by
  coalesce(nullif(trim(r.id_viagem), ''), nullif(trim(r.id_roteiro), '')),
  r.codigo_produto,
  r.descricao,
  dm.motivo
having sum(r.quantidade) - coalesce(sum(b.quantidade), 0) != 0;

comment on view public.v_divergencias is 'Itens com divergência entre romaneio e bipagem (falta/sobra)';
