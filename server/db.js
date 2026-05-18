const { Pool } = require("pg");

const ENERGY_MAX = 50;
const BATTLE_MODES = new Set(["ai", "online", "friend"]);
const BATTLE_OUTCOMES = new Set(["win", "loss"]);
const ENERGY_SPENDING_MODES = new Set(["online", "friend"]);

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

    await query(`
      create table if not exists battle_results (
        id uuid primary key default gen_random_uuid(),
        player_id uuid not null references players(id) on delete cascade,
        result_id text not null,
        mode text not null,
        outcome text not null,
        score_delta integer not null default 0,
        combo integer not null default 0 check (combo >= 0),
        words_completed integer not null default 0 check (words_completed >= 0),
        duration_ms integer not null default 0 check (duration_ms >= 0),
        wpm integer not null default 0 check (wpm >= 0),
        finished_at timestamptz not null default now(),
        created_at timestamptz not null default now()
      )
    `);

    await query(`
      create table if not exists duel_invites (
        duel_id text primary key,
        creator_id uuid not null references players(id) on delete cascade,
        guest_id uuid references players(id) on delete set null,
        battle_id text,
        status text not null default 'waiting',
        expires_at timestamptz not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `);

    await query(`
      create table if not exists active_battles (
        battle_id text primary key,
        mode text not null default 'friend',
        status text not null default 'active',
        state jsonb not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `);

    await query("create index if not exists idx_players_telegram_id on players(telegram_id)");
    await query("create index if not exists idx_player_stats_score on player_stats(score desc)");
    await query("create index if not exists idx_battle_results_player_id on battle_results(player_id)");
    await query("create index if not exists idx_battle_results_created_at on battle_results(created_at desc)");
    await query("alter table battle_results add column if not exists result_id text");
    await query("update battle_results set result_id = id::text where result_id is null");
    await query("alter table battle_results alter column result_id set not null");
    await query("create unique index if not exists idx_battle_results_player_result on battle_results(player_id, result_id)");
    await query("create index if not exists idx_duel_invites_expires_at on duel_invites(expires_at)");
    await query("create index if not exists idx_duel_invites_battle_id on duel_invites(battle_id)");
    await query("create index if not exists idx_active_battles_status on active_battles(status)");

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

function clampInteger(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function estimateWpm(result) {
  const wordsCompleted = clampInteger(result.wordsCompleted, 0, 1000);
  const durationMs = clampInteger(result.durationMs, 1000, 60 * 60 * 1000);
  return Math.min(500, Math.round(wordsCompleted / (durationMs / 60000)));
}

function scoreDeltaFor(result) {
  const comboBonus = Math.min(15, Math.floor(clampInteger(result.combo, 0, 1000) / 3));
  if (result.outcome === "win") {
    return (result.mode === "ai" ? 10 : 25) + comboBonus;
  }
  return result.mode === "ai" ? 2 : 5;
}

async function selectPlayerState(playerId) {
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
    [playerId]
  );

  const row = stateResult.rows[0];
  return {
    player: mapPlayer(row),
    energy: mapEnergy(row),
  };
}

async function ensureTelegramPlayer(user) {
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

  return playerRow;
}

async function upsertTelegramPlayer(user) {
  const playerRow = await ensureTelegramPlayer(user);
  if (!playerRow) return null;
  return selectPlayerState(playerRow.id);
}

async function createDuelInvite(user, duelId, expiresAt) {
  if (!hasDatabase()) return null;
  const playerRow = await ensureTelegramPlayer(user);
  if (!playerRow) return null;

  await query(
    `
      insert into duel_invites (duel_id, creator_id, expires_at)
      values ($1, $2, $3)
      on conflict (duel_id) do nothing
    `,
    [duelId, playerRow.id, expiresAt]
  );

  return {
    duelId,
    startParam: duelId,
    expiresAt: expiresAt.toISOString(),
  };
}

async function joinDuelInvite(user, duelId, battleId) {
  if (!hasDatabase()) return null;
  const playerRow = await ensureTelegramPlayer(user);
  if (!playerRow) return null;

  const inviteResult = await query(
    `
      select
        d.duel_id,
        d.creator_id,
        d.guest_id,
        d.battle_id,
        d.status,
        d.expires_at,
        p.telegram_id as creator_telegram_id,
        p.display_name as creator_name,
        s.league as creator_league,
        s.best_wpm as creator_wpm
      from duel_invites d
      join players p on p.id = d.creator_id
      join player_stats s on s.player_id = d.creator_id
      where d.duel_id = $1
    `,
    [duelId]
  );

  const invite = inviteResult.rows[0];
  if (!invite) return { status: "not_found" };
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    await query("update duel_invites set status = 'expired', updated_at = now() where duel_id = $1", [duelId]);
    return { status: "expired" };
  }

  if (invite.creator_id === playerRow.id) {
    return {
      status: "joined",
      battleId: invite.battle_id || battleId,
      opponent: {
        id: String(invite.creator_telegram_id),
        name: "Ожидаем друга",
        league: "Novice",
        wpm: 0,
      },
    };
  }

  if (invite.status === "joined" && invite.guest_id && invite.guest_id !== playerRow.id) {
    return { status: "full" };
  }

  const nextBattleId = invite.battle_id || battleId;
  const joinedResult = await query(
    `
      update duel_invites
      set
        guest_id = $2,
        battle_id = $3,
        status = 'joined',
        updated_at = now()
      where duel_id = $1
      returning *
    `,
    [duelId, playerRow.id, nextBattleId]
  );

  if (joinedResult.rows.length === 0) return { status: "not_found" };

  return {
    status: "joined",
    battleId: nextBattleId,
    opponent: {
      id: String(invite.creator_telegram_id),
      name: invite.creator_name,
      league: invite.creator_league,
      wpm: Number(invite.creator_wpm || 0),
    },
  };
}

async function getDuelInviteStatus(user, duelId) {
  if (!hasDatabase()) return null;
  const playerRow = await ensureTelegramPlayer(user);
  if (!playerRow) return null;

  const inviteResult = await query(
    `
      select
        d.duel_id,
        d.creator_id,
        d.guest_id,
        d.battle_id,
        d.status,
        d.expires_at,
        p.telegram_id as guest_telegram_id,
        p.display_name as guest_name,
        s.league as guest_league,
        s.best_wpm as guest_wpm
      from duel_invites d
      left join players p on p.id = d.guest_id
      left join player_stats s on s.player_id = d.guest_id
      where d.duel_id = $1
    `,
    [duelId]
  );

  const invite = inviteResult.rows[0];
  if (!invite) return { status: "not_found" };
  if (invite.creator_id !== playerRow.id && invite.guest_id !== playerRow.id) return { status: "not_found" };
  if (new Date(invite.expires_at).getTime() < Date.now() && invite.status !== "joined") {
    await query("update duel_invites set status = 'expired', updated_at = now() where duel_id = $1", [duelId]);
    return { status: "expired" };
  }

  if (invite.status !== "joined" || !invite.battle_id) {
    return { status: invite.status || "waiting" };
  }

  return {
    status: "joined",
    battleId: invite.battle_id,
    opponent: {
      id: String(invite.guest_telegram_id || ""),
      name: invite.guest_name || "PLAYER",
      league: invite.guest_league || "Novice",
      wpm: Number(invite.guest_wpm || 0),
    },
  };
}

async function saveActiveBattle(state) {
  if (!hasDatabase() || !state?.battleId) return null;
  await initDb();

  await query(
    `
      insert into active_battles (battle_id, mode, status, state)
      values ($1, $2, $3, $4::jsonb)
      on conflict (battle_id) do update set
        status = excluded.status,
        state = excluded.state,
        updated_at = now()
    `,
    [state.battleId, state.mode || "friend", state.status || "active", JSON.stringify(state)]
  );

  return state;
}

async function getActiveBattle(battleId) {
  if (!hasDatabase()) return null;
  await initDb();

  const result = await query(
    "select state from active_battles where battle_id = $1 limit 1",
    [battleId]
  );

  return result.rows[0]?.state || null;
}

async function recordBattleResult(user, result) {
  if (!hasDatabase()) return null;
  if (!BATTLE_MODES.has(result?.mode) || !BATTLE_OUTCOMES.has(result?.outcome)) {
    throw new Error("invalid_battle_result");
  }

  const playerRow = await ensureTelegramPlayer(user);
  if (!playerRow) return null;

  const resultId =
    typeof result.resultId === "string" && result.resultId.trim()
      ? result.resultId.trim().slice(0, 120)
      : `${result.mode}:${result.outcome}:${result.finishedAt}:${result.durationMs}:${result.combo}`;

  const isWin = result.outcome === "win";
  const combo = clampInteger(result.combo, 0, 1000);
  const wordsCompleted = clampInteger(result.wordsCompleted, 0, 1000);
  const durationMs = clampInteger(result.durationMs, 1000, 60 * 60 * 1000);
  const wpm = estimateWpm(result);
  const scoreDelta = scoreDeltaFor(result);
  const finishedAt = Number.isNaN(Date.parse(result.finishedAt)) ? new Date() : new Date(result.finishedAt);

  const insertedResult = await query(
    `
      insert into battle_results (
        player_id,
        result_id,
        mode,
        outcome,
        score_delta,
        combo,
        words_completed,
        duration_ms,
        wpm,
        finished_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      on conflict (player_id, result_id) do nothing
      returning id
    `,
    [playerRow.id, resultId, result.mode, result.outcome, scoreDelta, combo, wordsCompleted, durationMs, wpm, finishedAt]
  );

  if (insertedResult.rows.length === 0) {
    return {
      ...(await selectPlayerState(playerRow.id)),
      energySpent: 0,
      duplicate: true,
    };
  }

  await query(
    `
      update player_stats
      set
        score = score + $2,
        wins = wins + $3,
        losses = losses + $4,
        best_combo = greatest(best_combo, $5),
        best_wpm = greatest(best_wpm, $6),
        current_streak = case when $3 = 1 then current_streak + 1 else 0 end,
        updated_at = now()
      where player_id = $1
    `,
    [playerRow.id, scoreDelta, isWin ? 1 : 0, isWin ? 0 : 1, combo, wpm]
  );

  let energySpent = 0;
  if (ENERGY_SPENDING_MODES.has(result.mode)) {
    const energyResult = await query(
      `
        with previous as (
          select value
          from player_energy
          where player_id = $1
        ),
        updated as (
          update player_energy
          set
            value = greatest(value - 1, 0),
            updated_at = now()
          where player_id = $1
          returning value
        )
        select greatest(previous.value - updated.value, 0)::integer as energy_spent
        from previous, updated
      `,
      [playerRow.id]
    );

    energySpent = Number(energyResult.rows[0]?.energy_spent || 0);
  }

  return {
    ...(await selectPlayerState(playerRow.id)),
    energySpent,
  };
}

function periodStartSql(period) {
  return period === "today" ? "date_trunc('day', now())" : "date_trunc('week', now())";
}

async function getLeaderboard(period, user = null) {
  if (!hasDatabase()) return null;
  await initDb();

  const currentPlayerRow = user ? await ensureTelegramPlayer(user) : null;
  const periodStart = periodStartSql(period);

  const result = await query(`
    with leaderboard as (
      select
        p.id,
        p.display_name,
        s.league,
        coalesce(sum(br.score_delta), 0)::integer as score,
        coalesce(max(br.wpm), 0)::integer as best_wpm,
        coalesce(sum(case when br.outcome = 'win' then 1 else 0 end), 0)::integer as wins,
        coalesce(sum(case when br.outcome = 'loss' then 1 else 0 end), 0)::integer as losses,
        s.current_streak,
        p.created_at
      from players p
      join player_stats s on s.player_id = p.id
      left join battle_results br on br.player_id = p.id and br.created_at >= ${periodStart}
      group by p.id, p.display_name, s.league, s.current_streak, p.created_at
    ),
    ranked as (
      select
        *,
        row_number() over (order by score desc, best_wpm desc, created_at asc) as rank
      from leaderboard
    )
    select *
    from ranked
    where score > 0
    order by rank asc
    limit 20
  `);

  let playerRank = 999;
  if (currentPlayerRow) {
    const rankResult = await query(`
      with leaderboard as (
        select
          p.id,
          coalesce(sum(br.score_delta), 0)::integer as score,
          coalesce(max(br.wpm), 0)::integer as best_wpm,
          p.created_at
        from players p
        join player_stats s on s.player_id = p.id
        left join battle_results br on br.player_id = p.id and br.created_at >= ${periodStart}
        group by p.id, p.created_at
      ),
      ranked as (
        select
          id,
          row_number() over (order by score desc, best_wpm desc, created_at asc) as rank
        from leaderboard
      )
      select rank
      from ranked
      where id = $1
    `, [currentPlayerRow.id]);

    playerRank = Number(rankResult.rows[0]?.rank || 999);
  }

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
        me: currentPlayerRow ? row.id === currentPlayerRow.id : false,
      };
    }),
    playerRank,
  };
}

module.exports = {
  createDuelInvite,
  getActiveBattle,
  getDuelInviteStatus,
  getLeaderboard,
  hasDatabase,
  initDb,
  joinDuelInvite,
  recordBattleResult,
  saveActiveBattle,
  upsertTelegramPlayer,
};
