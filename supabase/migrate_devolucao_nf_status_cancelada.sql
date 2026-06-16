-- Permite cancelar NF em andamento (parar bipagem / zerar conferência)
alter table public.devolucao_nota_fiscal
  drop constraint if exists devolucao_nota_fiscal_status_check;

alter table public.devolucao_nota_fiscal
  add constraint devolucao_nota_fiscal_status_check
  check (status in ('em_andamento', 'concluida', 'cancelada'));
