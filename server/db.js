const { Pool } = require("pg");

const ENERGY_MAX = 50;

let pool = null;
let initPromise = null;

function hasDatabase() {
  return Boolean(process.env.DATABASE_URL);
}

function getPool() {
  if (!hasDatabase()) return null;
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }
  return pool;
}

async function query(text, params = []) {
  const currentPool = getPool();
  if (!currentPool) return null;
  return currentPool.query(text, params);
}

async function initDb() {
  if (!hasDatabase()) return false;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await query("create extension if not exists pgcrypto");

    await query(`
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
      )
    `);

    await query(`
      create table if not exists player_stats (
        player_id uuid primary key references players(id) on delete cascade,
        league text not null default 'Novice',
        league_code text not null default 'BRONZE',
        score integer not null default 0 check (score >= 0),
        wins integer not null default 0 check (wins >= 0),
        losses integer not null default 0 check (losses >= 0),
        best_combo integer not null default 0 check (best_combo >= 0),
        best_wpm integer not null default 0 check (best_wpm >= 0),
        current_streak integer not null default 0 check (current_streak >= 0),
        invited_count integer not null default 0 check (invited_count >= 0),
        updated_at timestamptz not null default now()
      )
    `);

    await query(`
      create table if not exists player_energy (
        player_id uuid primary key references players(id) on delete cascade,
        value integer not null default 50 check (value >= 0 and value <= 50),
        refill_date date not null default current_date,
        updated_at timestamptz not null default now()
      )
    `);

    await query("create index if not exists idx_players_telegram_id on players(telegram_id)");
    await query("create index if not exists idx_player_stats_score on player_stats(score desc)");

    return true;
  })();

  return initPromise;
}

function displayNameFromTelegram(user) {
  return user?.username || [user?.first_name, user?.last_name].filter(Boolean).join(" ") || "Player";
}

function mapPlayer(row, rank = 999) {
  const wins = Number(row.wins || 0);
  const losses = Number(row.losses || 0);
  const total = wins + losses;
  const winRate = total > 0 ? `${Math.round((wins / total) * 100)}%` : "0%";
  const score = Number(row.score || 0);

  return {
    name: row.display_name || "Player",
    rank,
    score,
    nextScore: Math.max(100, Math.ceil((score + 1) / 100) * 100),
    league: row.league || "Novice",
    leagueCode: row.league_code || "BRONZE",
    nextLeague: "Student",
    wins,
    losses,
    winRate,
    bestCombo: Number(row.best_combo || 0),
    wpm: Number(row.best_wpm || 0),
    streak: Number(row.current_streak || 0),
    invited: Number(row.invited_count || 0),
  };
}

function mapEnergy(row) {
  return {
    value: Number(row.value ?? ENERGY_MAX),
    date:
      row.refill_date instanceof Date
        ? row.refill_date.toISOString().slice(0, 10)
        : String(row.refill_date || new Date().toISOString().slice(0, 10)),
  };
}

async function upsertTelegramPlayer(user) {
  if (!hasDatabase()) return null;
  await initDb();

  const displayName = displayNameFromTelegram(user);
  const telegramId = String(user.id);

  const playerResult = await query(
    `
      insert into players (
        telegram_id,
        username,
        first_name,
        last_name,
        photo_url,
        language_code,
        display_name
      )
      values ($1, $2, $3, $4, $5, $6, $7)
      on conflict (telegram_id) do update set
        username = excluded.username,
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        photo_url = excluded.photo_url,
        language_code = excluded.language_code,
        display_name = excluded.display_name,
        updated_at = now()
      returning *
    `,
    [
      telegramId,
      user.username || null,
      user.first_name || null,
      user.last_name || null,
      user.photo_url || null,
      user.language_code || null,
      displayName,
    ]
  );

  const playerRow = playerResult.rows[0];

  await query("insert into player_stats (player_id) values ($1) on conflict (player_id) do nothing", [
    playerRow.id,
  ]);
  await query("insert into player_energy (player_id) values ($1) on conflict (player_id) do nothing", [
    playerRow.id,
  ]);
  await query(
    `
      update player_energy
      set
        value = $2,
        refill_date = current_date,
        updated_at = now()
      where player_id = $1
        and refill_date < current_date
    `,
    [playerRow.id, ENERGY_MAX]
  );

  const stateResult = await query(
    `
      select
        p.display_name,
        s.league,
        s.league_code,
        s.score,
        s.wins,
        s.losses,
        s.best_combo,
        s.best_wpm,
        s.current_streak,
        s.invited_count,
        e.value,
        e.refill_date
      from players p
      join player_stats s on s.player_id = p.id
      join player_energy e on e.player_id = p.id
      where p.id = $1
    `,
    [playerRow.id]
  );

  const row = stateResult.rows[0];
  return {
    player: mapPlayer(row),
    energy: mapEnergy(row),
  };
}

async function getLeaderboard(period) {
  if (!hasDatabase()) return null;
  await initDb();

  const result = await query(`
    select
      p.display_name,
      s.league,
      s.best_wpm,
      s.wins,
      s.losses,
      s.current_streak,
      s.score,
      row_number() over (order by s.score desc, s.best_wpm desc, p.created_at asc) as rank
    from players p
    join player_stats s on s.player_id = p.id
    order by s.score desc, s.best_wpm desc, p.created_at asc
    limit 20
  `);

  return {
    period,
    leaders: result.rows.map((row) => {
      const wins = Number(row.wins || 0);
      const losses = Number(row.losses || 0);
      const total = wins + losses;
      return {
        rank: Number(row.rank),
        name: row.display_name,
        league: row.league,
        wpm: Number(row.best_wpm || 0),
        wins: total > 0 ? `${Math.round((wins / total) * 100)}%` : "0%",
        streak: Number(row.current_streak || 0),
        color: "#fde047",
      };
    }),
    playerRank: 999,
  };
}

module.exports = {
  getLeaderboard,
  hasDatabase,
  initDb,
  upsertTelegramPlayer,
};
