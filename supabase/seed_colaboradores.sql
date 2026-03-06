-- ============================================================
-- Dados iniciais: Colaboradores (exemplo)
-- ============================================================
-- Execute após criar o schema (schema.sql)
-- Ou importe direto da planilha: POST /api/colaboradores/importar-planilha
-- ============================================================

-- Colaboradores de exemplo (ajuste conforme sua equipe)
insert into public.colaboradores (nome, funcao, centro_custo, tipo, ativo) values
  ('ASTROGILDO RODRIGUES DOS SANTOS', 'Coordenador', 'LOGÍSTICA', 'COORDENADOR', true),
  ('João Silva', 'Motorista', 'TRANSPORTE GRU', 'MOTORISTA', true),
  ('Maria Oliveira', 'Motorista', 'TRANSPORTE PPY', 'MOTORISTA', true),
  ('Carlos Santos', 'Conferente', 'CONFERÊNCIA', 'CONFERENTE', true),
  ('Ana Costa', 'Conferente', 'CONFERÊNCIA', 'CONFERENTE', true),
  ('Pedro Alves', 'Auxiliar de Carregamento', 'LOGÍSTICA', 'AJUDANTE', true),
  ('Lucas Ferreira', 'Auxiliar de Carregamento', 'LOGÍSTICA', 'AJUDANTE', true)
on conflict do nothing;

-- ============================================================
-- OU: Use a rota de importação
-- ============================================================
-- POST http://127.0.0.1:5001/api/colaboradores/importar-planilha
-- (lê da aba COLABORADORES da planilha Excel e popula a tabela)
-- ============================================================
