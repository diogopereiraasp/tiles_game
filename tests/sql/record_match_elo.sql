-- Elo contra o bot (record_match): ganho, perda, piso, teto, nível inválido, modo proibido, amigos sem Elo.
-- Cada verificação usa assert_eq; qualquer divergência aborta com erro (o runner falha).
set role tester;
create or replace function pg_temp.assert_eq(label text, got anyelement, want anyelement) returns void language plpgsql as $$
begin if got is distinct from want then raise exception 'FALHOU %: obtido % esperado %', label, got, want; end if; end $$;
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000a1', 'a@users.azul.invalid', '{"username":"tester1"}');
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000a1';

do $$
declare r record;
begin
  select * into r from public.record_match('bot', 2, 60, 1, true, 'normal', 'easy', '[]');
  perform pg_temp.assert_eq('facil vitoria de 0', r.elo_after, 14);
  select * into r from public.record_match('bot', 2, 20, 2, false, 'normal', 'easy', '[]');
  perform pg_temp.assert_eq('facil derrota de 14', r.elo_after, 3);
end $$;

-- piso: derrota em 0 continua 0
reset role; update public.profiles set elo = 0 where id = '00000000-0000-0000-0000-0000000000a1'; set role authenticated; set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ declare r record; begin
  select * into r from public.record_match('bot', 2, 10, 2, false, 'normal', 'easy', '[]');
  perform pg_temp.assert_eq('piso 0', r.elo_after, 0);
end $$;

-- teto do fácil (100): 95 + vitória nunca passa de 100; acima do teto nada muda
reset role; update public.profiles set elo = 95 where id = '00000000-0000-0000-0000-0000000000a1'; set role authenticated; set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ declare r record; begin
  select * into r from public.record_match('bot', 2, 70, 1, true, 'normal', 'easy', '[]');
  perform pg_temp.assert_eq('teto facil', r.elo_after, 100);
end $$;
reset role; update public.profiles set elo = 500 where id = '00000000-0000-0000-0000-0000000000a1'; set role authenticated; set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ declare r record; begin
  select * into r from public.record_match('bot', 2, 70, 1, true, 'normal', 'easy', '[]');
  perform pg_temp.assert_eq('acima do teto: vitoria', r.elo_after, 500);
  select * into r from public.record_match('bot', 2, 10, 2, false, 'normal', 'easy', '[]');
  perform pg_temp.assert_eq('acima do teto: derrota', r.elo_after, 500);
  select * into r from public.record_match('bot', 2, 80, 1, true, 'normal', 'hard', '[]');
  perform pg_temp.assert_eq('dificil abaixo do teto sobe', r.elo_after, 512);
end $$;
reset role; update public.profiles set elo = 700 where id = '00000000-0000-0000-0000-0000000000a1'; set role authenticated; set test.uid = '00000000-0000-0000-0000-0000000000a1';
do $$ declare r record; begin
  select * into r from public.record_match('bot', 2, 80, 1, true, 'normal', 'hard', '[]');
  perform pg_temp.assert_eq('dificil acima do teto', r.elo_after, 700);
  -- amigos nunca mexe no Elo
  select * into r from public.record_match('friends', 3, 50, 1, true, 'normal', null, '[]');
  perform pg_temp.assert_eq('amigos sem Elo', r.elo_after, 700);
end $$;

-- recusas
do $$ begin
  begin perform * from public.record_match('bot', 2, 50, 1, true, 'normal', 'impossivel', '[]'); raise exception 'FALHOU: aceitou nivel invalido';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; end;
  begin perform * from public.record_match('online', 2, 50, 1, true, 'normal', null, '[]'); raise exception 'FALHOU: aceitou modo online';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; end;
end $$;

reset role;
do $$ begin
  if (select elo from public.profiles where id = '00000000-0000-0000-0000-0000000000a1') <> 700 then raise exception 'FALHOU: elo final no perfil'; end if;
  if (select count(*) from public.matches where mode = 'bot' and (elo_before is null or elo_after is null)) > 0 then raise exception 'FALHOU: partida de bot sem elo gravado'; end if;
end $$;
select 'record_match_elo.sql: OK';
