-- Elo em partidas de amigos (record_match modo 'friends'): K=16 pela colocação, teto 300, 10 partidas/h, independente do limite do bot.
set role tester;
create or replace function pg_temp.assert_eq(label text, got anyelement, want anyelement) returns void language plpgsql as $$
begin if got is distinct from want then raise exception 'FALHOU %: obtido % esperado %', label, got, want; end if; end $$;
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000d1', 'd@users.azul.invalid', '{"username":"tester4"}');
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000d1';

-- 2 jogadores: +8 / -8 (piso 0)
do $$ declare r record; begin
  select * into r from public.record_match('friends', 2, 60, 1, true, 'normal', null, '[]');
  perform pg_temp.assert_eq('2p vitoria de 0', r.elo_after, 8);
  select * into r from public.record_match('friends', 2, 20, 2, false, 'normal', null, '[]');
  perform pg_temp.assert_eq('2p derrota de 8', r.elo_after, 0);
  select * into r from public.record_match('friends', 2, 10, 2, false, 'abandon', null, '[]');
  perform pg_temp.assert_eq('piso 0 (abandono)', r.elo_after, 0);
end $$;

-- 3 e 4 jogadores por colocação (partindo de 100)
reset role; update public.profiles set elo = 100 where id = '00000000-0000-0000-0000-0000000000d1'; set role authenticated; set test.uid = '00000000-0000-0000-0000-0000000000d1';
do $$ declare r record; begin
  select * into r from public.record_match('friends', 3, 60, 1, true, 'normal', null, '[]'); perform pg_temp.assert_eq('3p 1o', r.elo_after - r.elo_before, 11);
  select * into r from public.record_match('friends', 3, 50, 2, false, 'normal', null, '[]'); perform pg_temp.assert_eq('3p 2o', r.elo_after - r.elo_before, 3);
  select * into r from public.record_match('friends', 3, 30, 3, false, 'normal', null, '[]'); perform pg_temp.assert_eq('3p 3o', r.elo_after - r.elo_before, -5);
  select * into r from public.record_match('friends', 4, 60, 1, true, 'normal', null, '[]'); perform pg_temp.assert_eq('4p 1o', r.elo_after - r.elo_before, 12);
  select * into r from public.record_match('friends', 4, 50, 2, false, 'normal', null, '[]'); perform pg_temp.assert_eq('4p 2o', r.elo_after - r.elo_before, 7);
  select * into r from public.record_match('friends', 4, 40, 3, false, 'normal', null, '[]'); perform pg_temp.assert_eq('4p 3o', r.elo_after - r.elo_before, 1);
  select * into r from public.record_match('friends', 4, 20, 4, false, 'normal', null, '[]'); perform pg_temp.assert_eq('4p 4o', r.elo_after - r.elo_before, -4);
end $$;

-- teto 300: 295 sobe só até 300; em 300 ou mais não muda (limpa o histórico do usuário para não cair no limite de 10/h)
reset role; delete from public.matches where user_id = '00000000-0000-0000-0000-0000000000d1'; update public.profiles set elo = 295 where id = '00000000-0000-0000-0000-0000000000d1'; set role authenticated; set test.uid = '00000000-0000-0000-0000-0000000000d1';
do $$ declare r record; begin
  select * into r from public.record_match('friends', 2, 60, 1, true, 'normal', null, '[]'); perform pg_temp.assert_eq('teto 300', r.elo_after, 300);
  select * into r from public.record_match('friends', 2, 60, 1, true, 'normal', null, '[]'); perform pg_temp.assert_eq('em 300 nao muda (vitoria)', r.elo_after, 300);
  select * into r from public.record_match('friends', 2, 10, 2, false, 'normal', null, '[]'); perform pg_temp.assert_eq('em 300 nao muda (derrota)', r.elo_after, 300);
end $$;
reset role; delete from public.matches where user_id = '00000000-0000-0000-0000-0000000000d1'; update public.profiles set elo = 700 where id = '00000000-0000-0000-0000-0000000000d1'; set role authenticated; set test.uid = '00000000-0000-0000-0000-0000000000d1';
do $$ declare r record; begin
  select * into r from public.record_match('friends', 2, 60, 1, true, 'normal', null, '[]'); perform pg_temp.assert_eq('acima do teto (700) intacto', r.elo_after, 700);
end $$;

-- colocação inválida é recusada
do $$ begin
  begin perform * from public.record_match('friends', 2, 60, 3, false, 'normal', null, '[]'); raise exception 'FALHOU: aceitou colocacao 3 em sala de 2';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; end;
end $$;
reset role;
select 'friends_elo.sql (parte 1): OK';

-- limite de 10 partidas/h com Elo (usuário novo); o bot tem o seu próprio contador
set role tester;
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000d2', 'd2@users.azul.invalid', '{"username":"tester5"}');
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000d2';
do $$ declare i int; r record; e10 int; begin
  for i in 1..13 loop
    select * into r from public.record_match('friends', 2, 60, 1, true, 'normal', null, '[]');
    if i = 10 then e10 := r.elo_after; end if;
    if i > 10 and r.elo_after <> e10 then raise exception 'FALHOU: partida % de amigos mexeu no Elo acima do limite de 10/h', i; end if;
  end loop;
  perform pg_temp.assert_eq('10 vitorias = 80', e10, 80);
  select * into r from public.record_match('bot', 2, 60, 1, true, 'normal', 'hard', '[]');
  if r.elo_after = r.elo_before then raise exception 'FALHOU: o limite de amigos nao pode bloquear o Elo do bot'; end if;
end $$;
reset role;
select 'friends_elo.sql: OK';
