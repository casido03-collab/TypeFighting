-- Type Fight backend database schema draft.
-- Target: PostgreSQL. Keep server state authoritative for Telegram identity,
-- PvP battles, rating, energy, referrals, and duel invites.

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null unique,
  username text,
  first_name text,
  last_name text,
  photo_url text,
  language_code text,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists player_stats (
  player_id uuid primary key references players(id) on delete cascade,
  league text not null default 'Bronze League',
  league_code text not null default 'BRONZE I',
  score integer not null default 0 check (score >= 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  best_combo integer not null default 0 check (best_combo >= 0),
  best_wpm integer not null default 0 check (best_wpm >= 0),
  current_streak integer not null default 0 check (current_streak >= 0),
  invited_count integer not null default 0 check (invited_count >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists player_energy (
  player_id uuid primary key references players(id) on delete cascade,
  value integer not null default 50 check (value >= 0 and value <= 50),
  refill_date date not null default current_date,
  updated_at timestamptz not null default now()
);

create table if not exists referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references players(id) on delete cascade,
  referred_id uuid not null references players(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (referred_id),
  check (referrer_id <> referred_id)
);

create table if not exists duel_invites (
  id text primary key,
  creator_id uuid not null references players(id) on delete cascade,
  joined_id uuid references players(id) on delete set null,
  battle_id uuid,
  status text not null default 'open' check (status in ('open', 'joined', 'expired', 'cancelled')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists matchmaking_queue (
  player_id uuid primary key references players(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'matched', 'cancelled', 'expired')),
  battle_id uuid,
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists battles (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('online', 'friend')),
  status text not null default 'waiting' check (status in ('waiting', 'active', 'finished', 'cancelled')),
  max_hp integer not null default 120 check (max_hp > 0),
  round integer not null default 1 check (round > 0),
  winner_id uuid references players(id) on delete set null,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists battle_players (
  battle_id uuid not null references battles(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  slot smallint not null check (slot in (1, 2)),
  hp integer not null default 120 check (hp >= 0),
  combo integer not null default 0 check (combo >= 0),
  words_completed integer not null default 0 check (words_completed >= 0),
  typed_count integer not null default 0 check (typed_count >= 0),
  last_input_at timestamptz,
  left_at timestamptz,
  primary key (battle_id, player_id),
  unique (battle_id, slot)
);

create table if not exists battle_rounds (
  battle_id uuid not null references battles(id) on delete cascade,
  round integer not null check (round > 0),
  player_one_word text not null,
  player_two_word text not null,
  created_at timestamptz not null default now(),
  primary key (battle_id, round),
  check (char_length(player_one_word) = char_length(player_two_word))
);

create table if not exists battle_events (
  id uuid primary key default gen_random_uuid(),
  battle_id uuid not null references battles(id) on delete cascade,
  player_id uuid references players(id) on delete set null,
  event_type text not null check (
    event_type in ('typing', 'word_hit', 'word_rejected', 'leave', 'finish', 'energy_spent')
  ),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_players_telegram_id on players(telegram_id);
create index if not exists idx_player_stats_score on player_stats(score desc);
create index if not exists idx_duel_invites_expires_at on duel_invites(expires_at);
create index if not exists idx_matchmaking_queue_joined_at on matchmaking_queue(status, joined_at);
create index if not exists idx_battles_status on battles(status);
create index if not exists idx_battle_events_battle_created on battle_events(battle_id, created_at);
