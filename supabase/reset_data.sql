-- ⚠ LIMPEZA TOTAL DOS DADOS — IRREVERSÍVEL (o plano gratuito do Supabase não tem backup)
-- Apaga: todas as contas (auth), perfis, Elo, partidas, partidas ranqueadas e a fila.
-- Mantém: tabelas, funções, regras (RLS) e triggers. O jogo continua funcionando; todos começam do zero.
-- Rode no SQL Editor do Supabase. Quem estiver com o jogo aberto será deslogado e vira convidado novo.

begin;

-- 1) dados do jogo
truncate table public.queue, public.ranked_matches, public.matches restart identity;

-- 2) contas: apagar de auth.users remove em cascata perfis, identidades, sessões e tokens
delete from auth.users;

-- 3) garantia: nenhum perfil sobrando
delete from public.profiles;

commit;

-- Conferência (tudo deve ser 0):
select
  (select count(*) from auth.users)            as usuarios,
  (select count(*) from public.profiles)       as perfis,
  (select count(*) from public.matches)        as partidas,
  (select count(*) from public.ranked_matches) as ranqueadas,
  (select count(*) from public.queue)          as fila;
