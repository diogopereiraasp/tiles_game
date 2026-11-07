-- Limites de taxa do record_match: 20 partidas/h contra o bot mexem no Elo; 100 resultados/h (bot+amigos) e recusa.
set role tester;
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000c1', 'c@users.azul.invalid', '{"username":"tester3"}');
set role authenticated;
set test.uid = '00000000-0000-0000-0000-0000000000c1';

do $$
declare i int; r record; elo_after_20 int;
begin
  for i in 1..24 loop
    select * into r from public.record_match('bot', 2, 60, 1, true, 'normal', 'hard', '[]');
    if i = 20 then elo_after_20 := r.elo_after; end if;
    if i > 20 and r.elo_after <> elo_after_20 then raise exception 'FALHOU: partida % mexeu no Elo acima do limite de 20/h', i; end if;
  end loop;
  -- inundação: ao chegar em 100/h, recusa
  for i in 1..76 loop perform * from public.record_match('friends', 2, 50, 1, true, 'normal', null, '[]'); end loop;
  begin
    perform * from public.record_match('friends', 2, 50, 1, true, 'normal', null, '[]');
    raise exception 'FALHOU: aceitou o resultado 101 na mesma hora';
  exception when others then if sqlerrm like 'FALHOU%' then raise; end if; end;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.matches where user_id = '00000000-0000-0000-0000-0000000000c1' and mode = 'bot' and elo_before <> elo_after) <> 20 then
    raise exception 'FALHOU: esperava 20 partidas de bot com Elo alterado'; end if;
  if (select count(*) from public.matches where user_id = '00000000-0000-0000-0000-0000000000c1' and mode = 'bot') <> 24 then
    raise exception 'FALHOU: as 24 partidas de bot deveriam estar no historico'; end if;
end $$;
select 'rate_limit.sql: OK';
