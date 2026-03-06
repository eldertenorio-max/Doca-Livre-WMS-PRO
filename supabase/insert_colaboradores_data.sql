-- ============================================================
-- DADOS: Colaboradores (da planilha Excel)
-- ============================================================
-- Total: 16 colaboradores
-- Execute no SQL Editor do Supabase
-- ============================================================

-- AJUDANTE (11 colaboradores)
insert into public.colaboradores (nome, funcao, centro_custo, tipo, ativo) values
  ('BRUNO BARROS DE OLIVEIRA', 'Auxiliar de Logística', 'Armazenagem GRU', 'AJUDANTE', true),
  ('Igor Gomes Dos Santos Rosa', 'aux de estoque', 'Armazenagem GRU', 'AJUDANTE', true),
  ('ITALO MATHEUS PEREIRA LIMA CRUZ', 'Auxiliar de Logística', 'Armazenagem GRU', 'AJUDANTE', true),
  ('Jorge Eduardo Rezende', 'aux de estoque', 'Armazenagem GRU', 'AJUDANTE', true),
  ('Leandro M Ferreira Dos Santos', 'aux de estoque', 'Armazenagem GRU', 'AJUDANTE', true),
  ('Marcelo Silva De Medeiros', 'aux de estoque', 'Armazenagem GRU', 'AJUDANTE', true),
  ('Marcone Gomes Do Nascimento', 'aux de estoque', 'Armazenagem GRU', 'AJUDANTE', true),
  ('VALTER FERREIRA DOS SANTOS', 'Auxiliar de Logística', 'Armazenagem GRU', 'AJUDANTE', true),
  ('GISNALDO ALMEIDA ALENCAR', 'Auxiliar de Logística', 'Armazenagem GRU', 'AJUDANTE', true),
  ('JOAO VICTOR MONTEIRO GONCALVES', 'Auxiliar de Logística', 'Armazenagem GRU', 'AJUDANTE', true),
  ('KAWAN APARECIDO PEDROSO DA SILVA', 'Auxiliar de Logística', 'Armazenagem GRU', 'AJUDANTE', true)
on conflict do nothing;

-- CONFERENTE (2 colaboradores)
insert into public.colaboradores (nome, funcao, centro_custo, tipo, ativo) values
  ('ALEXANDRO BISPO SANTANA', 'Conferente', 'Armazenagem GRU', 'CONFERENTE', true),
  ('PEDRO MARCOS ALVARENGA DAS NEVES RODRIGUES', 'Conferente', 'Armazenagem GRU', 'CONFERENTE', true)
on conflict do nothing;

-- COORDENADOR (2 colaboradores)
insert into public.colaboradores (nome, funcao, centro_custo, tipo, ativo) values
  ('Astrogildo Rodrigues Dos S', 'coordenadora', 'Armazenagem GRU', 'COORDENADOR', true),
  ('Joyce Cabral Do Nascimento', 'coordenadora', 'Armazenagem GRU', 'COORDENADOR', true)
on conflict do nothing;

-- OUTRO (1 colaboradores)
insert into public.colaboradores (nome, funcao, centro_custo, tipo, ativo) values
  ('EDI CARLOS ROSENDE BORGES', 'Operador de Empilhadeira', 'Armazenagem GRU', 'OUTRO', true)
on conflict do nothing;

