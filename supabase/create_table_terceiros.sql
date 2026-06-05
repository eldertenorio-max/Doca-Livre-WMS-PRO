-- Tabelas do módulo Terceiros (NF-e XML)
-- Execute no Sistema WMS ANTES de migrate_terceiros_rls.sql

create table if not exists public.terceiros_documentos (
  id bigserial primary key,
  area text not null check (area in ('recebimento', 'expedicao', 'carreta')),
  chave_nfe text,
  numero_nf text,
  serie_nf text,
  data_emissao text,
  remetente_nome text,
  remetente_cnpj text,
  destinatario_nome text,
  destinatario_cnpj text,
  destinatario_uf text,
  previsao_chegada text,
  arquivo_nome text,
  xml_conteudo text,
  recebimento_concluido boolean not null default false,
  recebimento_concluido_em timestamptz,
  recebimento_concluido_por text,
  nota_lancada text,
  nota_lancada_em timestamptz,
  nota_lancada_por text,
  enviar_para_mg text,
  enviar_para_mg_em timestamptz,
  enviar_para_mg_por text,
  motorista_carreta text,
  motorista_carreta_em timestamptz,
  placa_carreta text,
  motorista_saida_mg text,
  motorista_saida_mg_em timestamptz,
  placa_saida_mg text,
  carga_recebida_mg text,
  carga_recebida_mg_em timestamptz,
  carga_recebida_mg_por text,
  recebedor_mg text,
  numero_pedido text,
  consumivel_sp text,
  recebedor_consumivel_sp text,
  consumivel_sp_historico text,
  consumivel_sp_historico_em timestamptz,
  consumivel_sp_historico_por text,
  motivo_nao_lancada text,
  motivo_nao_enviar_mg text,
  motivo_nao_recebida_mg text,
  criado_em timestamptz not null default now(),
  criado_por text,
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);

create table if not exists public.terceiros_documento_itens (
  id bigserial primary key,
  documento_id bigint not null references public.terceiros_documentos(id) on delete cascade,
  n_item integer,
  codigo_ean text,
  codigo_produto_xml text,
  descricao_xml text,
  unidade_xml text,
  quantidade_xml numeric(14,3) not null default 0,
  codigo_produto_base text,
  codigo_barras_base text,
  descricao_base text,
  quantidade_bipada numeric(14,3) not null default 0,
  status_bipagem text not null default 'PENDENTE',
  ultimo_ean_bipado text,
  motivo text,
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);

create table if not exists public.terceiros_documento_eventos (
  id bigserial primary key,
  documento_id bigint not null references public.terceiros_documentos(id) on delete cascade,
  evento text not null,
  valor_anterior text,
  valor_novo text,
  usuario text,
  criado_em timestamptz not null default now(),
  detalhes text
);

create index if not exists idx_terceiros_documentos_area
  on public.terceiros_documentos (area, criado_em desc);
create index if not exists idx_terceiros_documentos_chave
  on public.terceiros_documentos (chave_nfe);
create index if not exists idx_terceiros_documento_itens_documento
  on public.terceiros_documento_itens (documento_id);
create index if not exists idx_terceiros_documento_itens_ean
  on public.terceiros_documento_itens (codigo_ean);
create index if not exists idx_terceiros_documento_eventos_documento
  on public.terceiros_documento_eventos (documento_id, criado_em desc);
