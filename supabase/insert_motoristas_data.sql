-- ============================================================
-- DADOS: Motoristas (da planilha Excel)
-- ============================================================
-- Total: 44 motoristas
-- Execute no SQL Editor do Supabase
-- ============================================================

insert into public.motoristas (nome, centro_custo, ativo) values
  ('ABDUL KARIM PEREIRA SHARIFY', 'Transporte GRU', true),
  ('ABNER VAES DA SILVA', 'Transporte GRU', true),
  ('AFONSO DOS SANTOS SILVA', 'Transporte GRU', true),
  ('ALVIN FELIX DOS SANTOS JUNIOR', 'Transporte GRU', true),
  ('ANTONIO VERTANO DA SILVA FILHO', 'Transporte GRU', true),
  ('Augusto Jorge De Souza', 'Transporte GRU', true),
  ('DANIEL GAVINHO DA SILVA', 'Transporte GRU', true),
  ('Danilo Braga Da Silva', 'Transporte GRU', true),
  ('Danilo Dos Santos P Da Silva', 'Transporte GRU', true),
  ('DIEGO VIRGINO ADRIANI ISIDORO', 'Transporte GRU', true),
  ('Djalma Santino Da Silva', 'Transporte GRU', true),
  ('DOUGLAS RAPHAEL MARQUES DE QUEIROZ', 'Transporte GRU', true),
  ('EDEVALDO DONIZETE NEGRAO', 'Transporte PPY', true),
  ('EDUARDO FERREIRA DOS SANTOS', 'Transporte GRU', true),
  ('Eduardo Silva De Sousa', 'Transporte GRU', true),
  ('EDVAR PEREIRA SOARES', 'Transporte GRU', true),
  ('Fabricio Pereira Da Silva', 'Transporte GRU', true),
  ('Felipe Aparecido Carneiro', 'Transporte GRU', true),
  ('GABRIEL HENRIQUE DOS SANTOS', 'Transporte GRU', true),
  ('Gabriel Yuri Lazarin De Sousa', 'Transporte GRU', true),
  ('ISABELA CONCEIÇÃO DA Silva SANTOS', 'Transporte GRU', true),
  ('ISRAEL CAMILO BARBOSA', 'Transporte GRU', true),
  ('Joao Vitor Bispo Da Silva', 'Transporte GRU', true),
  ('JOAQUIM MARTINS DOS SANTOS', 'Transporte GRU', true),
  ('Kauan Guilherme Dos Santos Lib', 'Transporte GRU', true),
  ('LUCIANO DOMENICES', 'Transporte GRU', true),
  ('LUCIANO MACHADO DE FREITAS', 'Transporte PPY', true),
  ('MAIFRANIO GOMES XAVIER', 'Transporte PPY', true),
  ('MARCELO DE MOURA RICAACCACIO', 'Transporte GRU', true),
  ('MARCIO APARECIDO DOS SANTOS', 'Transporte GRU', true),
  ('Marcos Manoel Dos Santos', 'Transporte GRU', true),
  ('Paulo Cesar Jesus Da Costa', 'Transporte GRU', true),
  ('REINALDO ALVES FURTADO', 'Transporte GRU', true),
  ('ROBSON DE SOUZA SILVEIRA', 'Transporte PPY', true),
  ('RODRIGO DOS SANTOS SILVA', 'Transporte GRU', true),
  ('Rogerio Vieira Barbosa', 'Transporte GRU', true),
  ('FABIO IAN COUTINHO ASSIS', 'Transporte GRU', true),
  ('JOSÉ MARCOS CORREA', 'Transporte GRU', true),
  ('KAIQUE ESTEVÃO DA SILVA SANTOS', 'Transporte GRU', true),
  ('MARCOS MANOEL DOS SANTOS', 'Transporte GRU', true),
  ('REINALDO SENA SODRE JUNIOR', 'Transporte GRU', true),
  ('THIAGO DA SILVA RICAACCACIO', 'Transporte GRU', true),
  ('Welberty Duylhem Ribeiro Olive', 'Transporte GRU', true),
  ('YURI RAVELL FEITOZA DO NASCIMENTO', 'Transporte GRU', true)
on conflict (nome) do nothing;
