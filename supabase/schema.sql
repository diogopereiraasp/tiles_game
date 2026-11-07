-- Azul — schema Supabase (Auth + Histórico + Ranking)
-- Rode este arquivo inteiro no SQL Editor do painel do Supabase.
-- Pode ser executado mais de uma vez sem quebrar.

-- ───────────────────────── Perfis ─────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  elo int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists elo int not null default 0;
alter table public.profiles alter column elo set default 0;
-- Avatar foi removido do jogo: só existe o nome de usuário.
alter table public.profiles drop column if exists avatar;

-- ───────── Nome de usuário: único (sem diferenciar maiúsculas), 3 a 15 letras/números/_ ─────────
alter table public.profiles add column if not exists email_norm text;

create or replace function public.reserved_username(p text)
returns boolean language sql immutable as $$
  select lower(p) in ('admin', 'administrador', 'azul', 'bot', 'suporte', 'moderador', 'sistema', 'jogador', 'voce');
$$;

-- Usuário gerado automaticamente para contas novas (jogador + 8 dígitos, cabe em 15 caracteres)
create or replace function public.gen_username()
returns text language plpgsql as $$
declare u text;
begin
  loop
    u := 'jogador' || lpad(floor(random() * 100000000)::bigint::text, 8, '0');
    exit when not exists (select 1 from public.profiles p where lower(p.display_name) = u);
  end loop;
  return u;
end;
$$;

alter table public.profiles alter column display_name set default public.gen_username();

-- Migração: nomes antigos viram usuários válidos e únicos
update public.profiles set display_name =
  case when length(regexp_replace(display_name, '[^A-Za-z0-9_]', '', 'g')) >= 3
            and not public.reserved_username(regexp_replace(display_name, '[^A-Za-z0-9_]', '', 'g'))
       then left(regexp_replace(display_name, '[^A-Za-z0-9_]', '', 'g'), 15)
       else public.gen_username() end
where display_name !~ '^[A-Za-z0-9_]{3,15}$' or public.reserved_username(display_name);

do $$
declare i int := 0;
begin
  -- duplicados (ignorando maiúsculas): o mais antigo fica com o nome, os outros ganham um novo
  while i < 5 and exists (select 1 from public.profiles group by lower(display_name) having count(*) > 1) loop
    update public.profiles p set display_name = public.gen_username()
    from (select id, row_number() over (partition by lower(display_name) order by created_at, id) rn from public.profiles) d
    where d.id = p.id and d.rn > 1;
    i := i + 1;
  end loop;
end $$;

alter table public.profiles drop constraint if exists profiles_name_len;
alter table public.profiles drop constraint if exists profiles_username_fmt;
alter table public.profiles add constraint profiles_username_fmt
  check (display_name ~ '^[A-Za-z0-9_]{3,15}$' and not public.reserved_username(display_name));
create unique index if not exists profiles_username_key on public.profiles (lower(display_name));

-- ───────── 1 e-mail = 1 conta ─────────
-- O Supabase já impede o mesmo e-mail em duas contas. Aqui impedimos também apelidos do mesmo e-mail:
-- fulano+teste@x.com == fulano@x.com, e no Gmail os pontos não contam (f.ulano@gmail.com == fulano@gmail.com).
create or replace function public.normalize_email(p text)
returns text language sql immutable as $$
  select case
    when p is null or position('@' in p) = 0 then null
    when split_part(lower(trim(p)), '@', 2) in ('gmail.com', 'googlemail.com')
      then replace(split_part(split_part(lower(trim(p)), '@', 1), '+', 1), '.', '') || '@gmail.com'
    else split_part(split_part(lower(trim(p)), '@', 1), '+', 1) || '@' || split_part(lower(trim(p)), '@', 2)
  end;
$$;

update public.profiles p set email_norm = public.normalize_email(u.email)
from auth.users u
where u.id = p.id and u.email is not null and p.email_norm is distinct from public.normalize_email(u.email);

create unique index if not exists profiles_email_norm_key on public.profiles (email_norm) where email_norm is not null;

create or replace function public.sync_email_norm()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.profiles set email_norm = public.normalize_email(new.email) where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (new.email is distinct from old.email)
  execute function public.sync_email_norm();

-- Disponibilidade de nome de usuário (usado pela tela de perfil enquanto a pessoa digita)
create or replace function public.is_username_available(p_name text)
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select coalesce(p_name ~ '^[A-Za-z0-9_]{3,15}$', false)
    and not public.reserved_username(p_name)
    and not exists (select 1 from public.profiles p where lower(p.display_name) = lower(p_name) and p.id is distinct from auth.uid());
$$;
grant execute on function public.is_username_available(text) to anon, authenticated;

-- Login por usuário + senha: o Supabase exige um e-mail por trás, então cada conta usa um endereço INTERNO
-- (<uuid aleatório>@users.azul.invalid; nada é enviado para ele). Esta função devolve esse endereço a partir do
-- nome de usuário (só para endereços internos; nunca expõe e-mail real). Para usuário inexistente devolve um
-- endereço falso, então não revela quem tem conta.
create or replace function public.login_email_for(p_username text)
returns text
language sql
stable
security definer set search_path = public
as $$
  select coalesce(
    (select u.email from auth.users u join public.profiles p on p.id = u.id
      where lower(p.display_name) = lower(p_username) and u.email like '%@users.azul.invalid'),
    '00000000-0000-0000-0000-000000000000@users.azul.invalid');
$$;
grant execute on function public.login_email_for(text) to anon, authenticated;

alter table public.profiles enable row level security;

-- O cliente só pode alterar o próprio nome de usuário. Elo é alterado apenas pela função record_match.
revoke insert, update on public.profiles from anon, authenticated;
grant update (display_name) on public.profiles to authenticated;

drop policy if exists "profiles_select_all" on public.profiles;
create policy "profiles_select_all" on public.profiles
  for select using (true);

drop policy if exists "profiles_insert_own" on public.profiles;

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Cria o perfil automaticamente quando um usuário (anônimo ou Google) é criado
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_name text;
  v_req text := nullif(trim(new.raw_user_meta_data ->> 'username'), '');
begin
  if v_req is not null then
    -- cadastro com usuário escolhido: se o nome for inválido ou já existir, o cadastro inteiro é recusado
    if v_req !~ '^[A-Za-z0-9_]{3,15}$' or public.reserved_username(v_req)
       or exists (select 1 from public.profiles p where lower(p.display_name) = lower(v_req)) then
      raise exception 'username_unavailable';
    end if;
    v_name := v_req;
  else
    v_name := left(regexp_replace(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), '[^A-Za-z0-9_]', '', 'g'), 15);
    if length(v_name) < 3 or public.reserved_username(v_name)
       or exists (select 1 from public.profiles p where lower(p.display_name) = lower(v_name)) then
      v_name := public.gen_username();
    end if;
  end if;

  insert into public.profiles (id, display_name, email_norm)
  values (new.id, v_name, public.normalize_email(new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ───────────────────────── Partidas ─────────────────────────
-- Uma linha por jogador por partida (cada dispositivo grava apenas o próprio resultado)
create table if not exists public.matches (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  mode text not null check (mode in ('online', 'bot', 'local')),
  player_count int not null check (player_count between 2 and 4),
  score int not null check (score between 0 and 300),
  placement int not null check (placement between 1 and 4),
  won boolean not null,
  end_reason text not null check (end_reason in ('normal', 'timeout', 'abandon')),
  bot_difficulty text,
  opponents jsonb not null default '[]'::jsonb,
  elo_before int,
  elo_after int,
  created_at timestamptz not null default now()
);

alter table public.matches add column if not exists elo_before int;
alter table public.matches add column if not exists elo_after int;

-- Migração: Elo agora começa em 0. Quem ainda não jogou nenhuma partida valendo Elo volta para 0.
update public.profiles p set elo = 0
where p.elo = 1000
  and not exists (select 1 from public.matches m where m.user_id = p.id and m.elo_after is not null);

create index if not exists matches_user_created_idx on public.matches (user_id, created_at desc);
create index if not exists matches_mode_idx on public.matches (mode);

alter table public.matches enable row level security;

drop policy if exists "matches_select_own" on public.matches;
create policy "matches_select_own" on public.matches
  for select using (auth.uid() = user_id);

-- Inserção só por funções do servidor (record_match para bot/amigos; _settle_ranked para ranqueadas)
drop policy if exists "matches_insert_own" on public.matches;
revoke insert, update, delete on public.matches from anon, authenticated;

-- 'friends' = sala com código entre amigos (histórico, sem Elo)
alter table public.matches drop constraint if exists matches_mode_check;
alter table public.matches add constraint matches_mode_check
  check (mode in ('online', 'bot', 'local', 'friends'));

-- Exige conta com login (não anônima). Convidados anônimos não jogam online nem gravam partidas.
create or replace function public.require_real_user()
returns void
language plpgsql
stable
as $$
begin
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'login required' using errcode = '28000';
  end if;
end;
$$;

-- ───────────────────────── Registro de partida: amigos (sem Elo) e bot (Elo limitado) ─────────────────────────
-- Partidas contra pessoas valendo Elo ('online') NÃO passam por aqui: só por report_ranked_result.
-- Contra o bot o resultado vem do cliente (não dá para conferir), então o Elo é LIMITADO:
--   cada nível tem um rating virtual e um TETO; o Elo só se move enquanto estiver abaixo do teto
--   (Fácil: rating 50, teto 100 | Médio: 250, teto 300 | Difícil: 500, teto 600). Acima do teto não muda.
--   Isso impede forjar vitórias para chegar ao topo: acima disso só a Partida Ranqueada vale.
drop function if exists public.record_match(text, int, int, int, boolean, text, text, jsonb);
create or replace function public.record_match(
  p_mode text,
  p_player_count int,
  p_score int,
  p_placement int,
  p_won boolean,
  p_end_reason text,
  p_bot_difficulty text default null,
  p_opponents jsonb default '[]'::jsonb
)
returns table (elo_before int, elo_after int)
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_elo int;
  v_new int;
  v_rating numeric;
  v_cap int;
  v_exp numeric;
  v_s numeric;
  v_k constant numeric := 24;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  perform public.require_real_user();
  if p_mode not in ('bot', 'friends') then
    raise exception 'mode not allowed (ranked results go through report_ranked_result)';
  end if;

  insert into public.profiles (id) values (v_uid) on conflict (id) do nothing;
  select p.elo into v_elo from public.profiles p where p.id = v_uid;
  v_new := v_elo;

  if p_mode = 'bot' then
    select x.rating, x.cap into v_rating, v_cap
    from (values ('easy', 50, 100), ('medium', 250, 300), ('hard', 500, 600)) as x(d, rating, cap)
    where x.d = p_bot_difficulty;
    if not found then raise exception 'invalid bot difficulty'; end if;
    if v_elo < v_cap then
      v_exp := 1 / (1 + power(10, (v_rating - v_elo) / 400.0));
      v_s := case when p_won then 1 else 0 end;
      v_new := least(v_cap, greatest(0, round(v_elo + v_k * (v_s - v_exp))::int));
      update public.profiles set elo = v_new where id = v_uid;
    end if;
  end if;

  insert into public.matches (
    user_id, mode, player_count, score, placement, won, end_reason, bot_difficulty, opponents, elo_before, elo_after
  ) values (
    v_uid, p_mode, p_player_count, p_score, p_placement, p_won, p_end_reason,
    p_bot_difficulty, coalesce(p_opponents, '[]'::jsonb),
    case when p_mode = 'bot' then v_elo end, case when p_mode = 'bot' then v_new end
  );

  return query select v_elo, v_new;
end;
$$;

revoke execute on function public.record_match(text, int, int, int, boolean, text, text, jsonb) from public, anon;
grant execute on function public.record_match(text, int, int, int, boolean, text, text, jsonb) to authenticated;

-- ───────────────────────── Fila e partidas ranqueadas ─────────────────────────
create table if not exists public.queue (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  elo int not null,
  match_id uuid,
  room_code text,
  role text,
  created_at timestamptz not null default now(),
  seen_at timestamptz not null default now()
);

create table if not exists public.ranked_matches (
  id uuid primary key default gen_random_uuid(),
  room_code text not null,
  host_id uuid not null references public.profiles (id) on delete cascade,
  guest_id uuid not null references public.profiles (id) on delete cascade,
  host_report jsonb,
  guest_report jsonb,
  host_reported_at timestamptz,
  guest_reported_at timestamptz,
  status text not null default 'pending' check (status in ('pending', 'done', 'disputed', 'void')),
  host_elo_before int,
  host_elo_after int,
  guest_elo_before int,
  guest_elo_after int,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

-- Última vez que cada jogador avisou que está na partida (ping_ranked_match). Serve para saber se o
-- adversário realmente sumiu, sem depender de ele confirmar o resultado.
alter table public.ranked_matches add column if not exists host_seen_at timestamptz;
alter table public.ranked_matches add column if not exists guest_seen_at timestamptz;

create index if not exists ranked_matches_host_idx on public.ranked_matches (host_id, created_at desc);
create index if not exists ranked_matches_guest_idx on public.ranked_matches (guest_id, created_at desc);

-- Sem policies: ninguém acessa estas tabelas direto; só as funções abaixo (security definer)
alter table public.queue enable row level security;
alter table public.ranked_matches enable row level security;
revoke all on public.queue from anon, authenticated;
revoke all on public.ranked_matches from anon, authenticated;

-- Procura oponente. O cliente chama a cada ~2s: serve de "heartbeat" e de consulta do resultado.
-- Janela de Elo: ±100 e cresce 50 a cada 10s de espera.
drop function if exists public.find_ranked_match();
create or replace function public.find_ranked_match()
returns table (r_status text, r_room_code text, r_role text, r_match_id uuid, r_wait int)
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_me public.queue;
  v_opp public.queue;
  v_elo int;
  v_host uuid;
  v_guest uuid;
  v_code text;
  v_mid uuid;
  v_chars constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  i int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  perform public.require_real_user();

  perform pg_advisory_xact_lock(hashtext('azul_ranked_queue'));
  delete from public.queue q where q.match_id is null and q.seen_at < now() - interval '12 seconds';
  delete from public.queue q where q.match_id is not null and q.seen_at < now() - interval '3 minutes';

  select * into v_me from public.queue q where q.user_id = v_uid;
  if found and v_me.match_id is not null then
    return query select 'matched'::text, v_me.room_code, v_me.role, v_me.match_id, 0;
    return;
  end if;

  if not found then
    insert into public.profiles (id) values (v_uid) on conflict (id) do nothing;
    select p.elo into v_elo from public.profiles p where p.id = v_uid;
    insert into public.queue (user_id, elo) values (v_uid, coalesce(v_elo, 0)) returning * into v_me;
  else
    update public.queue q set seen_at = now() where q.user_id = v_uid returning * into v_me;
  end if;

  select * into v_opp from public.queue q
  where q.user_id <> v_uid
    and q.match_id is null
    and abs(q.elo - v_me.elo) <= 100 + 50 * floor(
      greatest(extract(epoch from (now() - q.created_at)), extract(epoch from (now() - v_me.created_at))) / 10)
  order by abs(q.elo - v_me.elo), q.created_at
  limit 1;

  if found then
    if v_opp.created_at <= v_me.created_at then
      v_host := v_opp.user_id; v_guest := v_uid;
    else
      v_host := v_uid; v_guest := v_opp.user_id;
    end if;

    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_chars, 1 + floor(random() * 32)::int, 1);
    end loop;

    insert into public.ranked_matches (room_code, host_id, guest_id)
    values (v_code, v_host, v_guest) returning id into v_mid;

    update public.queue q
    set match_id = v_mid, room_code = v_code,
        role = case when q.user_id = v_host then 'host' else 'guest' end,
        seen_at = now()
    where q.user_id in (v_host, v_guest);

    return query select 'matched'::text, v_code,
      (case when v_uid = v_host then 'host' else 'guest' end)::text, v_mid, 0;
    return;
  end if;

  return query select 'waiting'::text, null::text, null::text, null::uuid,
    floor(extract(epoch from (now() - v_me.created_at)))::int;
end;
$$;

create or replace function public.cancel_ranked_search()
returns void
language sql
security definer set search_path = public
as $$
  delete from public.queue q where q.user_id = auth.uid() and q.match_id is null;
$$;

-- Liquida uma partida ranqueada. Regras anti-fraude:
--  * Os DOIS jogadores enviam o resultado; só vale Elo se os relatos baterem (placar / quem perdeu).
--  * Relatos que divergem => 'disputed' (ninguém muda de Elo).
--  * Se só UM relatou: saída/tempo esgotado vale na hora se o adversário está sem sinal de vida há 40s
--    (>= 4 jogadas); fim normal espera 60s pelo outro lado (>= 10 jogadas).
--  * Máximo de 5 partidas valendo Elo entre o mesmo par de jogadores por 24h.
create or replace function public._settle_ranked(p_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  m public.ranked_matches;
  hr jsonb; gr jsonb;
  v_ok boolean := true;
  v_status text := 'done';
  v_s numeric;              -- resultado do ANFITRIÃO: 1 vitória, 0.5 empate, 0 derrota
  v_reason text;
  v_hs int; v_gs int;       -- placares (visão do anfitrião)
  v_he int; v_ge int;       -- Elo atual
  v_ne_h int; v_ne_g int;
  v_exp numeric;
  v_k constant numeric := 32;
  v_pair int;
  v_age interval;
  v_moves int;
  v_apply boolean := true;
  v_names text[];
begin
  select * into m from public.ranked_matches r where r.id = p_id for update;
  if not found or m.status <> 'pending' then return; end if;

  hr := m.host_report; gr := m.guest_report;
  if hr is null and gr is null then return; end if;

  if hr is not null and gr is not null then
    v_reason := hr ->> 'end_reason';
    if v_reason is distinct from (gr ->> 'end_reason') then
      v_ok := false;
    elsif v_reason = 'normal' then
      v_ok := (hr ->> 'my_score')::int = (gr ->> 'opp_score')::int
          and (hr ->> 'opp_score')::int = (gr ->> 'my_score')::int
          and coalesce((hr ->> 'my_rows')::int, 0) = coalesce((gr ->> 'opp_rows')::int, 0)
          and coalesce((hr ->> 'opp_rows')::int, 0) = coalesce((gr ->> 'my_rows')::int, 0);
    else
      v_ok := (hr ->> 'loser' = 'me' and gr ->> 'loser' = 'opp')
           or (hr ->> 'loser' = 'opp' and gr ->> 'loser' = 'me');
    end if;
    v_moves := least((hr ->> 'moves')::int, (gr ->> 'moves')::int);
    v_hs := (hr ->> 'my_score')::int; v_gs := (hr ->> 'opp_score')::int;
    if v_ok then
      if v_reason = 'normal' then
        v_s := case when v_hs > v_gs then 1 when v_hs < v_gs then 0
                    else case when coalesce((hr ->> 'my_rows')::int, 0) > coalesce((hr ->> 'opp_rows')::int, 0) then 1
                              when coalesce((hr ->> 'my_rows')::int, 0) < coalesce((hr ->> 'opp_rows')::int, 0) then 0
                              else 0.5 end end;
      else
        v_s := case when hr ->> 'loser' = 'me' then 0 else 1 end;
      end if;
    end if;
  else
    -- Só um relatório (o outro lado não relatou).
    v_age := now() - coalesce(m.host_reported_at, m.guest_reported_at);
    v_reason := coalesce(hr, gr) ->> 'end_reason';
    declare other_seen timestamptz := case when hr is not null then m.guest_seen_at else m.host_seen_at end;
    begin
      if v_reason in ('abandon', 'timeout') then
        -- Saída/tempo esgotado: se o adversário sumiu (sem sinal de vida há 40s) a vitória vale AGORA.
        -- Se ele ainda manda sinal de vida, espera ele relatar. Sem nenhum sinal registrado: espera 60s.
        if other_seen is not null then
          if now() - other_seen < interval '40 seconds' then return; end if;
        elsif v_age < interval '60 seconds' then
          return;
        end if;
      elsif v_age < interval '60 seconds' then
        return;  -- fim normal: o outro lado costuma relatar em segundos
      end if;
    end;
    declare r jsonb := coalesce(hr, gr); host_side boolean := hr is not null; begin
      v_reason := r ->> 'end_reason';
      v_moves := (r ->> 'moves')::int;
      v_hs := case when host_side then (r ->> 'my_score')::int else (r ->> 'opp_score')::int end;
      v_gs := case when host_side then (r ->> 'opp_score')::int else (r ->> 'my_score')::int end;
      if v_reason = 'normal' then
        declare rh int := case when host_side then coalesce((r ->> 'my_rows')::int, 0) else coalesce((r ->> 'opp_rows')::int, 0) end;
                rg int := case when host_side then coalesce((r ->> 'opp_rows')::int, 0) else coalesce((r ->> 'my_rows')::int, 0) end;
        begin
          v_s := case when v_hs > v_gs then 1 when v_hs < v_gs then 0
                      else case when rh > rg then 1 when rh < rg then 0 else 0.5 end end;
        end;
      else
        -- Relato de quem reportou: 'me' perdeu / 'opp' perdeu
        v_s := case when (r ->> 'loser' = 'me') = host_side then 0 else 1 end;
      end if;
    end;
  end if;

  if not v_ok then
    v_status := 'disputed'; v_apply := false;
  elsif coalesce(v_moves, 0) < (case when v_reason = 'normal' then 10 else 4 end) then
    v_status := 'void'; v_apply := false;
  else
    select count(*) into v_pair from public.ranked_matches r
    where r.status = 'done' and r.settled_at > now() - interval '24 hours'
      and ((r.host_id = m.host_id and r.guest_id = m.guest_id) or (r.host_id = m.guest_id and r.guest_id = m.host_id));
    if v_pair >= 5 then v_status := 'void'; v_apply := false; end if;
  end if;

  select p.elo into v_he from public.profiles p where p.id = m.host_id for update;
  select p.elo into v_ge from public.profiles p where p.id = m.guest_id for update;
  v_ne_h := v_he; v_ne_g := v_ge;

  if v_apply then
    v_exp := 1 / (1 + power(10, (v_ge - v_he) / 400.0));
    v_ne_h := greatest(0, round(v_he + v_k * (v_s - v_exp))::int);
    v_ne_g := greatest(0, round(v_ge + v_k * ((1 - v_s) - (1 - v_exp)))::int);
    update public.profiles set elo = v_ne_h where id = m.host_id;
    update public.profiles set elo = v_ne_g where id = m.guest_id;
  end if;

  select array[(select p.display_name from public.profiles p where p.id = m.host_id),
               (select p.display_name from public.profiles p where p.id = m.guest_id)] into v_names;

  insert into public.matches (user_id, mode, player_count, score, placement, won, end_reason, opponents, elo_before, elo_after)
  values (m.host_id, 'online', 2, least(greatest(coalesce(v_hs, 0), 0), 300),
          case when v_s is null or v_s >= 0.5 then 1 else 2 end,
          coalesce(v_s = 1, false), coalesce(v_reason, 'normal'),
          jsonb_build_array(jsonb_build_object('name', v_names[2], 'score', coalesce(v_gs, 0))),
          case when v_apply then v_he end, case when v_apply then v_ne_h end),
         (m.guest_id, 'online', 2, least(greatest(coalesce(v_gs, 0), 0), 300),
          case when v_s is null or v_s <= 0.5 then 1 else 2 end,
          coalesce(v_s = 0, false), coalesce(v_reason, 'normal'),
          jsonb_build_array(jsonb_build_object('name', v_names[1], 'score', coalesce(v_hs, 0))),
          case when v_apply then v_ge end, case when v_apply then v_ne_g end);

  update public.ranked_matches r set
    status = v_status, settled_at = now(),
    host_elo_before = case when v_apply then v_he end, host_elo_after = case when v_apply then v_ne_h end,
    guest_elo_before = case when v_apply then v_ge end, guest_elo_after = case when v_apply then v_ne_g end
  where r.id = p_id;
end;
$$;

revoke execute on function public._settle_ranked(uuid) from public, anon, authenticated;

drop function if exists public.report_ranked_result(uuid, jsonb);
-- p_report: { my_score, opp_score, my_rows, opp_rows (linhas completas: desempate), end_reason: normal|timeout|abandon, loser: me|opp|null, moves }
create or replace function public.report_ranked_result(p_match_id uuid, p_report jsonb)
returns table (r_status text, r_elo_before int, r_elo_after int)
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  m public.ranked_matches;
  v_is_host boolean;
  v_rep jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  perform public.require_real_user();
  select * into m from public.ranked_matches r where r.id = p_match_id;
  if not found or (v_uid <> m.host_id and v_uid <> m.guest_id) then raise exception 'not your match'; end if;
  v_is_host := (v_uid = m.host_id);

  v_rep := jsonb_build_object(
    'my_score', least(greatest(coalesce((p_report ->> 'my_score')::int, 0), 0), 400),
    'opp_score', least(greatest(coalesce((p_report ->> 'opp_score')::int, 0), 0), 400),
    'end_reason', case when p_report ->> 'end_reason' in ('normal', 'timeout', 'abandon') then p_report ->> 'end_reason' else 'normal' end,
    'loser', case when p_report ->> 'loser' in ('me', 'opp') then p_report ->> 'loser' end,
    'moves', least(greatest(coalesce((p_report ->> 'moves')::int, 0), 0), 1000),
    'my_rows', least(greatest(coalesce((p_report ->> 'my_rows')::int, 0), 0), 5),
    'opp_rows', least(greatest(coalesce((p_report ->> 'opp_rows')::int, 0), 0), 5)
  );

  if v_is_host and m.host_report is null then
    update public.ranked_matches r set host_report = v_rep, host_reported_at = now() where r.id = p_match_id;
  elsif not v_is_host and m.guest_report is null then
    update public.ranked_matches r set guest_report = v_rep, guest_reported_at = now() where r.id = p_match_id;
  end if;

  perform public._settle_ranked(p_match_id);
  return query select * from public.get_ranked_result(p_match_id);
end;
$$;

-- Sinal de vida: o cliente chama a cada ~20s durante a partida ranqueada
create or replace function public.ping_ranked_match(p_match_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  perform public.require_real_user();
  update public.ranked_matches r set
    host_seen_at = case when r.host_id = v_uid then now() else r.host_seen_at end,
    guest_seen_at = case when r.guest_id = v_uid then now() else r.guest_seen_at end
  where r.id = p_match_id and r.status = 'pending' and (r.host_id = v_uid or r.guest_id = v_uid);
end;
$$;

drop function if exists public.get_ranked_result(uuid);
create or replace function public.get_ranked_result(p_match_id uuid)
returns table (r_status text, r_elo_before int, r_elo_after int)
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  m public.ranked_matches;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into m from public.ranked_matches r where r.id = p_match_id;
  if not found or (v_uid <> m.host_id and v_uid <> m.guest_id) then raise exception 'not your match'; end if;
  perform public._settle_ranked(p_match_id);
  select * into m from public.ranked_matches r where r.id = p_match_id;
  return query select m.status,
    case when v_uid = m.host_id then m.host_elo_before else m.guest_elo_before end,
    case when v_uid = m.host_id then m.host_elo_after else m.guest_elo_after end;
end;
$$;

-- Liquida partidas pendentes do usuário (ex.: o adversário sumiu e quem ganhou fechou a página)
create or replace function public.settle_my_ranked_matches()
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  r record;
  n int := 0;
begin
  if v_uid is null then return 0; end if;
  for r in select id from public.ranked_matches
           where status = 'pending' and (host_id = v_uid or guest_id = v_uid)
             and created_at > now() - interval '2 days' loop
    perform public._settle_ranked(r.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

grant execute on function public.find_ranked_match() to authenticated;
grant execute on function public.cancel_ranked_search() to authenticated;
grant execute on function public.report_ranked_result(uuid, jsonb) to authenticated;
grant execute on function public.get_ranked_result(uuid) to authenticated;
grant execute on function public.ping_ranked_match(uuid) to authenticated;
revoke execute on function public.ping_ranked_match(uuid) from public, anon;
grant execute on function public.settle_my_ranked_matches() to authenticated;
revoke execute on function public.find_ranked_match() from public, anon;
revoke execute on function public.cancel_ranked_search() from public, anon;
revoke execute on function public.report_ranked_result(uuid, jsonb) from public, anon;
revoke execute on function public.get_ranked_result(uuid) from public, anon;
revoke execute on function public.settle_my_ranked_matches() from public, anon;

-- ───────────────────────── Ranking ─────────────────────────
drop function if exists public.get_leaderboard(text, int);

-- Ranking Elo (online): apenas quem já jogou ao menos 1 partida online valendo Elo
create or replace function public.get_leaderboard(p_mode text default 'online', p_limit int default 50)
returns table (
  user_id uuid,
  display_name text,
  elo int,
  games bigint,
  wins bigint,
  win_rate numeric,
  best_score int
)
language sql
stable
security definer set search_path = public
as $$
  select
    m.user_id,
    p.display_name,
    p.elo,
    count(*) as games,
    count(*) filter (where m.won) as wins,
    round(100.0 * count(*) filter (where m.won) / count(*), 0) as win_rate,
    max(m.score) as best_score
  from public.matches m
  join public.profiles p on p.id = m.user_id
  where m.mode = p_mode
    and (p_mode <> 'online' or m.elo_after is not null)
  group by m.user_id, p.display_name, p.elo
  order by
    case when p_mode = 'online' then p.elo end desc nulls last,
    count(*) filter (where m.won) desc,
    max(m.score) desc
  limit least(greatest(p_limit, 1), 100);
$$;

grant execute on function public.get_leaderboard(text, int) to anon, authenticated;
