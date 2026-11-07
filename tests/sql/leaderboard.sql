-- Ranking de Elo: inclui quem jogou bot/amigos/ranqueada (mesmo com 1 partida) e a paginação (top 10 + minha posição).
set role tester;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000e1', 'e1@users.azul.invalid', '{"username":"soBot"}'),
  ('00000000-0000-0000-0000-0000000000e2', 'e2@users.azul.invalid', '{"username":"soAmigos"}'),
  ('00000000-0000-0000-0000-0000000000e3', 'e3@users.azul.invalid', '{"username":"semPartidas"}');
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000e1';
select count(*) from (select * from public.record_match('bot', 2, 60, 1, true, 'normal', 'hard', '[]')) x;
set test.uid = '00000000-0000-0000-0000-0000000000e2';
select count(*) from (select * from public.record_match('friends', 2, 60, 1, true, 'normal', null, '[]')) x;
do $$
declare lb record; has_bot boolean := false; has_fr boolean := false; has_none boolean := false; prev int := 1000000;
begin
  for lb in select * from public.get_leaderboard('online', 100) loop
    if lb.elo > prev then raise exception 'FALHOU: ordem por Elo quebrada'; end if;
    prev := lb.elo;
    if lb.display_name = 'soBot' then has_bot := true; if lb.games <> 1 or lb.elo <= 0 then raise exception 'FALHOU: soBot games=% elo=%', lb.games, lb.elo; end if; end if;
    if lb.display_name = 'soAmigos' then has_fr := true; if lb.games <> 1 or lb.elo <> 8 then raise exception 'FALHOU: soAmigos games=% elo=%', lb.games, lb.elo; end if; end if;
    if lb.display_name = 'semPartidas' then has_none := true; end if;
  end loop;
  if not has_bot then raise exception 'FALHOU: quem jogou so contra o bot nao aparece no ranking'; end if;
  if not has_fr then raise exception 'FALHOU: quem jogou so com amigos nao aparece no ranking'; end if;
  if has_none then raise exception 'FALHOU: quem nunca jogou apareceu no ranking'; end if;
  if not exists (select 1 from public.get_leaderboard('bot', 100) where display_name = 'soBot') then raise exception 'FALHOU: get_leaderboard(bot) deveria listar soBot'; end if;
  if exists (select 1 from public.get_leaderboard('bot', 100) where display_name = 'soAmigos') then raise exception 'FALHOU: get_leaderboard(bot) nao deveria listar quem so jogou amigos'; end if;
end $$;
reset role;
select 'leaderboard (inclusão): OK';

-- ───── paginação: 12 jogadores fortes (Elo 2000+) acima de todos; o 'baixo' (Elo 3) fica fora do top 10 ─────
set role tester;
do $$ declare i int; u uuid; begin
  for i in 1..12 loop
    u := ('00000000-0000-0000-0000-00000000f0' || lpad(i::text, 2, '0'))::uuid;
    insert into auth.users (id, email, raw_user_meta_data) values (u, 'f'||i||'@users.azul.invalid', jsonb_build_object('username', 'forte'||i));
    update public.profiles set elo = 2000 + i where id = u;
    insert into public.matches (user_id, mode, player_count, score, placement, won, end_reason) values (u, 'online', 2, 50, 1, true, 'normal');
  end loop;
  insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000b0', 'b0@users.azul.invalid', '{"username":"baixo"}');
  update public.profiles set elo = 3 where id = '00000000-0000-0000-0000-0000000000b0';
  insert into public.matches (user_id, mode, player_count, score, placement, won, end_reason) values ('00000000-0000-0000-0000-0000000000b0', 'bot', 2, 10, 2, false, 'normal');
end $$;
set role authenticated;

-- logado ABAIXO do top 10: 10 linhas = 9 primeiros + eu (no lugar do 10o, com a posição real)
set test.uid = '00000000-0000-0000-0000-0000000000b0';
do $$ declare r record; n int := 0; last_is_me boolean; last_pos bigint; tot bigint; prev bigint := 0; begin
  for r in select * from public.get_elo_ranking(0, 10) loop
    n := n + 1; last_is_me := r.is_me; last_pos := r.pos; tot := r.total;
    if r.pos <= prev then raise exception 'FALHOU: posicoes fora de ordem'; end if;
    prev := r.pos;
    if n < 10 and r.pos <> n then raise exception 'FALHOU: linha % deveria ser a posicao %', n, n; end if;
  end loop;
  if n <> 10 then raise exception 'FALHOU: esperava 10 linhas, vieram %', n; end if;
  if not last_is_me then raise exception 'FALHOU: a 10a linha deveria ser eu'; end if;
  if last_pos <= 10 then raise exception 'FALHOU: minha posicao real deveria ser > 10 (veio %)', last_pos; end if;
  if last_pos <> tot then raise exception 'FALHOU: sou o ultimo do ranking (pos % de %)', last_pos, tot; end if;
end $$;

-- logado DENTRO do top 10: 10 linhas, sem substituição, eu destacado
set test.uid = '00000000-0000-0000-0000-00000000f003';
do $$ declare r record; n int := 0; me_pos bigint; begin
  for r in select * from public.get_elo_ranking(0, 10) loop n := n + 1; if r.is_me then me_pos := r.pos; end if; if r.pos <> n then raise exception 'FALHOU: sem substituicao as posicoes devem ser 1..10'; end if; end loop;
  if n <> 10 then raise exception 'FALHOU: esperava 10 linhas (top 10), vieram %', n; end if;
  if me_pos is null then raise exception 'FALHOU: eu estou no top 10 e nao fui marcado'; end if;
end $$;

-- sem login (anon): top 10 puro
set test.uid = '';
do $$ declare n int; begin
  select count(*) into n from public.get_elo_ranking(0, 10);
  if n <> 10 then raise exception 'FALHOU: anon deveria ver 10 linhas (vieram %)', n; end if;
  if exists (select 1 from public.get_elo_ranking(0, 10) where is_me) then raise exception 'FALHOU: anon nao tem linha propria'; end if;
end $$;

-- próxima página: posições 11..20, sem repetir
set test.uid = '00000000-0000-0000-0000-0000000000b0';
do $$ declare mn bigint; mx bigint; n int; begin
  select min(pos), max(pos), count(*) into mn, mx, n from public.get_elo_ranking(10, 10);
  if mn <> 11 or mx > 20 or n < 1 then raise exception 'FALHOU: pagina 2 deveria ser 11..20 (veio % a %, % linhas)', mn, mx, n; end if;
end $$;
reset role;
select 'leaderboard.sql: OK';
