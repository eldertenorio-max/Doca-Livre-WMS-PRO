-- ============================================================
-- DADOS: Usuários (do config_usuarios.py)
-- ============================================================
-- Total: 4 usuários
-- Senhas em hash (pbkdf2:sha256)
-- Execute no SQL Editor do Supabase
-- ============================================================

insert into public.usuarios (usuario, senha_hash, ativo) values
  ('admin', 'pbkdf2:sha256:600000$MAs5sYc3mahiYRev$607873b64666514b4471a206716d99e9635573c90f18558d8e49d5e747a1ee9c', true),
  ('Diego', 'pbkdf2:sha256:600000$H5nrIPug0nF9pvLJ$b399ab8dab812997e2fdee83177ddcd070af3b0ac2d688358f8124aae0998397', true),
  ('Elder', 'pbkdf2:sha256:600000$C7kWWN8uTjdBJ1Cg$966471b39fbddb8e917b9511aabd41a85a56791f165c44b7b1aeb43af51d7de7', true),
  ('astro', 'pbkdf2:sha256:600000$97RFFVykqfahGsEG$9d097d4c7ef5e4af8f77172101dd742354cc18c5ec7337f6ab57359fe48ce9cf', true)
on conflict (usuario) do nothing;
