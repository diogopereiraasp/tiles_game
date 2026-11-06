-- Azul — schema Supabase (Auth + Histórico + Ranking)
-- Rode este arquivo inteiro no SQL Editor do painel do Supabase.
-- Pode ser executado mais de uma vez sem quebrar.

-- ───────────────────────── Perfis ─────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Jogador',
  elo int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists elo int not null default 0;
alter table public.profiles alter column elo set default 0;

-- Migração: Elo agora começa em 0. Quem ainda não jogou nenhuma partida valendo Elo volta para 0.
update public.profiles p set elo = 0
where p.elo = 1000
  and not exists (select 1 from public.matches m where m.user_id = p.id and m.elo_after is not null);

alter table public.profiles enable row level security;

-- O cliente só pode alterar o próprio nome. Elo é alterado apenas pela função record_match.
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
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      left(new.raw_user_meta_data ->> 'full_name', 15),
      left(new.raw_user_meta_data ->> 'name', 15),
      'Jogador'
    )
  )
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

create index if not exists matches_user_created_idx on public.matches (user_id, created_at desc);
create index if not exists matches_mode_idx on public.matches (mode);

alter table public.matches enable row level security;

drop policy if exists "matches_select_own" on public.matches;
create policy "matches_select_own" on public.matches
  for select using (auth.uid() = user_id);

-- Inserção só pela função record_match (calcula o Elo no servidor)
drop policy if exists "matches_insert_own" on public.matches;
revoke insert, update, delete on public.matches from anon, authenticated;

-- ───────────────────────── Registro de partida + Elo ─────────────────────────
-- p_opponents: [{ "uid": "<uuid ou null>", "name": "...", "score": 0, "placement": 1 }]
-- Elo só muda em partidas online contra contas reais. K = 32, dividido entre os oponentes.
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
  v_delta numeric := 0;
  v_rated int := 0;
  v_k numeric := 32;
  v_opp jsonb;
  v_opp_uid uuid;
  v_opp_elo int;
  v_opp_place int;
  v_s numeric;
  v_e numeric;
  v_new int;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  insert into public.profiles (id) values (v_uid) on conflict (id) do nothing;
  select p.elo into v_elo from public.profiles p where p.id = v_uid for update;

  if p_mode = 'online' then
    for v_opp in select * from jsonb_array_elements(coalesce(p_opponents, '[]'::jsonb)) loop
      begin
        v_opp_uid := nullif(v_opp ->> 'uid', '')::uuid;
      exception when others then
        v_opp_uid := null;
      end;
      continue when v_opp_uid is null or v_opp_uid = v_uid;
      select p.elo into v_opp_elo from public.profiles p where p.id = v_opp_uid;
      continue when v_opp_elo is null;

      v_opp_place := coalesce((v_opp ->> 'placement')::int, p_player_count);
      v_s := case when p_placement < v_opp_place then 1
                  when p_placement = v_opp_place then 0.5
                  else 0 end;
      v_e := 1 / (1 + power(10, (v_opp_elo - v_elo) / 400.0));
      v_delta := v_delta + (v_s - v_e);
      v_rated := v_rated + 1;
    end loop;
  end if;

  if v_rated > 0 then
    v_new := greatest(0, round(v_elo + v_k * v_delta / v_rated)::int);
    update public.profiles set elo = v_new where id = v_uid;
  else
    v_new := v_elo;
  end if;

  insert into public.matches (
    user_id, mode, player_count, score, placement, won, end_reason,
    bot_difficulty, opponents, elo_before, elo_after
  ) values (
    v_uid, p_mode, p_player_count, p_score, p_placement, p_won, p_end_reason,
    p_bot_difficulty, coalesce(p_opponents, '[]'::jsonb),
    case when v_rated > 0 then v_elo end,
    case when v_rated > 0 then v_new end
  );

  return query select v_elo, v_new;
end;
$$;

revoke execute on function public.record_match(text, int, int, int, boolean, text, text, jsonb) from public, anon;
grant execute on function public.record_match(text, int, int, int, boolean, text, text, jsonb) to authenticated;

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
