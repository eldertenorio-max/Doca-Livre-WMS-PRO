-- ============================================================
-- DADOS: Placas (da planilha Excel)
-- ============================================================
-- Total: 38 placas
-- Execute no SQL Editor do Supabase
-- ============================================================

insert into public.placas (placa, descricao, ativo) values
  ('SWY3E25', '4200', true),
  ('EZO8E62', '4200', true),
  ('FED2A32', '4200', true),
  ('STS8F92', '4200', true),
  ('SVZ2D07', '4200', true),
  ('SSV3J72', '4200', true),
  ('ENI7G21', '4200', true),
  ('SWB3F77', '4200', true),
  ('SVZ3G77', '4200', true),
  ('SWI6E54', '4200', true),
  ('EOF7G31', '4200', true),
  ('SXN4A56', '4500/ 3 Palet', true),
  ('SXN5F36', '4500/ 8 Palet', true),
  ('SXM5I76', '4500/ 8 Palet', true),
  ('RFS3I44', '1500 / 2 Palet', true),
  ('SEG0001', null, true),
  ('SEG0002', null, true),
  ('IXM3E88', '8000', true),
  ('FSS4C66', '2700', true),
  ('FUO2I21', '2700', true),
  ('FTF2H12', '2500', true),
  ('SVA5J31', '2500', true),
  ('EWJ3E57', '2500', true),
  ('ELQ2549', '2500', true),
  ('EMU1F41', '2500', true),
  ('DTD1C82', '1500', true),
  ('FBV9B83', '700', true),
  ('EFW3195', '1500', true),
  ('FSS4C65', '1500', true),
  ('HBN8E36', '1500', true),
  ('FUO8F70', '500', true),
  ('EUG6C39', '1500', true),
  ('FQQ1H88', '500', true),
  ('ONL6155', '1500', true),
  ('QOP3C00', '500', true),
  ('RMZ8E94', '500', true),
  ('RTV5C90', '500', true),
  ('GAF9F72', '4500/ 8 Palet', true)
on conflict (placa) do nothing;
