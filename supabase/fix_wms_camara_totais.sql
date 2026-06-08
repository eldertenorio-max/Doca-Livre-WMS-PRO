-- Corrige capacidade de referência das câmaras e remove endereços vazios fora do layout oficial.
-- Executar no Supabase SQL Editor se o painel ainda mostrar totais inflados (ex.: 510, 630, 720).

UPDATE public.wms_camara SET total_posicoes = 138 WHERE codigo = 11;
UPDATE public.wms_camara SET total_posicoes = 134 WHERE codigo = 12;
UPDATE public.wms_camara SET total_posicoes = 138 WHERE codigo = 13;
UPDATE public.wms_camara SET total_posicoes = 82 WHERE codigo = 21;

-- Endereços válidos do layout (138+134+138+82 = 492 posições)
DELETE FROM public.wms_localizacao l
WHERE l.status = 'vazia'
  AND NOT (
    (l.camara = 11 AND l.codigo_endereco ~ '^11-(U|V)-[0-9]{2}-[1-3]$')
    OR (l.camara = 12 AND l.codigo_endereco ~ '^12-(X|Y)-[0-9]{2}-[1-3]$')
    OR (l.camara = 13 AND l.codigo_endereco ~ '^13-(W|Z)-[0-9]{2}-[1-3]$')
    OR (l.camara = 21 AND l.codigo_endereco ~ '^21-R-[0-9]{2}-[1-3]$')
  );
