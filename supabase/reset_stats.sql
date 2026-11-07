-- ⚠ ZERA O HISTÓRICO E O ELO — IRREVERSÍVEL (o plano gratuito do Supabase não tem backup)
-- Apaga: histórico de partidas (matches), partidas ranqueadas (ranked_matches) e a fila de busca (queue).
-- Zera: o Elo de todos os perfis (volta a 0 = Bronze).
-- Mantém: contas (auth.users), perfis e nomes de usuário, tabelas, funções, regras (RLS) e triggers.
-- Rode no SQL Editor do Supabase. Quem estiver jogando agora pode ver erro numa partida em andamento; é só recarregar.

begin;

-- 1) histórico e partidas ranqueadas
truncate table public.queue, public.ranked_matches, public.matches restart identity;

-- 2) Elo de todos volta a 0 (os usuários continuam)
update public.profiles set elo = 0;

commit;

-- Conferência (usuarios = perfis = o que você tinha; o resto 0):
select
  (select count(*) from auth.users)            as usuarios,
  (select count(*) from public.profiles)       as perfis,
  (select count(*) from public.profiles where elo <> 0) as com_elo,
  (select count(*) from public.matches)        as partidas,
  (select count(*) from public.ranked_matches) as ranqueadas,
  (select count(*) from public.queue)          as fila;
