-- ============================================================
-- PREENCHER TODAS AS TABELAS DE UMA VEZ
-- ============================================================
-- Execute este arquivo COMPLETO no SQL Editor do Supabase
-- ============================================================

-- ============================================================
-- 1. USUÁRIOS (4 usuários)
-- ============================================================

insert into public.usuarios (usuario, senha_hash, ativo) values
  ('admin', 'pbkdf2:sha256:600000$MAs5sYc3mahiYRev$607873b64666514b4471a206716d99e9635573c90f18558d8e49d5e747a1ee9c', true),
  ('Diego', 'pbkdf2:sha256:600000$H5nrIPug0nF9pvLJ$b399ab8dab812997e2fdee83177ddcd070af3b0ac2d688358f8124aae0998397', true),
  ('Elder', 'pbkdf2:sha256:600000$C7kWWN8uTjdBJ1Cg$966471b39fbddb8e917b9511aabd41a85a56791f165c44b7b1aeb43af51d7de7', true),
  ('astro', 'pbkdf2:sha256:600000$97RFFVykqfahGsEG$9d097d4c7ef5e4af8f77172101dd742354cc18c5ec7337f6ab57359fe48ce9cf', true)
on conflict (usuario) do nothing;

-- ============================================================
-- 2. COLABORADORES (16 colaboradores)
-- ============================================================

-- AJUDANTE (11)
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

-- CONFERENTE (2)
insert into public.colaboradores (nome, funcao, centro_custo, tipo, ativo) values
  ('ALEXANDRO BISPO SANTANA', 'Conferente', 'Armazenagem GRU', 'CONFERENTE', true),
  ('PEDRO MARCOS ALVARENGA DAS NEVES RODRIGUES', 'Conferente', 'Armazenagem GRU', 'CONFERENTE', true)
on conflict do nothing;

-- COORDENADOR (2)
insert into public.colaboradores (nome, funcao, centro_custo, tipo, ativo) values
  ('Astrogildo Rodrigues Dos S', 'coordenadora', 'Armazenagem GRU', 'COORDENADOR', true),
  ('Joyce Cabral Do Nascimento', 'coordenadora', 'Armazenagem GRU', 'COORDENADOR', true)
on conflict do nothing;

-- OUTRO (1)
insert into public.colaboradores (nome, funcao, centro_custo, tipo, ativo) values
  ('EDI CARLOS ROSENDE BORGES', 'Operador de Empilhadeira', 'Armazenagem GRU', 'OUTRO', true)
on conflict do nothing;

-- ============================================================
-- PRONTO! Usuários e Colaboradores inseridos
-- ============================================================
-- Continue no próximo arquivo para Motoristas e Placas
-- (ou use INSERT_TUDO_PARTE2.sql)
-- ============================================================
