const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const {
  applyReferral,
  cleanupExpiredGameRows,
  createDuelInvite,
  getActiveBattle,
  getAdminStats,
  getDuelInviteStatus,
  getLeaderboard,
  hasDatabase,
  initDb,
  joinDuelInvite,
  recordAnalyticsEvent,
  recordBattleResult,
  saveActiveBattle,
  upsertTelegramPlayer,
} = require("./db");

const PORT = Number(process.env.PORT || 3001);
const MAX_INIT_DATA_AGE_SECONDS = 24 * 60 * 60;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

function loadEnvFile() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;

    const [key, ...valueParts] = trimmed.split("=");
    if (!process.env[key]) {
      process.env[key] = valueParts.join("=").replace(/^["']|["']$/g, "");
    }
  }
}

loadEnvFile();

const LEADERS = [
  { rank: 1, name: "SHADOW", league: "MYTHIC", wpm: 412, wins: "98%", streak: 12, color: "#a855f7" },
  { rank: 2, name: "BLADE", league: "DIAMOND", wpm: 399, wins: "94%", streak: 9, color: "#38bdf8" },
  { rank: 3, name: "SPEEDY", league: "DIAMOND", wpm: 378, wins: "92%", streak: 7, color: "#fb923c" },
  { rank: 4, name: "NINJA", league: "DIAMOND", wpm: 356, wins: "90%", streak: 6, color: "#84cc16" },
  { rank: 5, name: "TYPERX", league: "PLATINUM", wpm: 334, wins: "87%", streak: 5, color: "#22d3ee" },
  { rank: 999, name: "YOU", league: "NOVICE", wpm: 0, wins: "0%", streak: 0, color: "#fde047", me: true },
];
const SERVER_WORDS = ["арена", "рывок", "пламя", "фокус", "мечта", "удар", "щит", "раунд", "искра", "темп"];
const activeBattles = new Map();

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("request_body_too_large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function verifyTelegramInitData(initData, botToken) {
  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  const authDate = Number(params.get("auth_date") || 0);

  if (!receivedHash || !authDate) return null;

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds - authDate > MAX_INIT_DATA_AGE_SECONDS) return null;

  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculatedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  const received = Buffer.from(receivedHash, "hex");
  const calculated = Buffer.from(calculatedHash, "hex");

  if (received.length !== calculated.length || !crypto.timingSafeEqual(received, calculated)) {
    return null;
  }

  const rawUser = params.get("user");
  if (!rawUser) return null;

  try {
    return JSON.parse(rawUser);
  } catch {
    return null;
  }
}

function createPlayer(user) {
  const displayName =
    user?.username || [user?.first_name, user?.last_name].filter(Boolean).join(" ") || "Player";

  return {
    name: displayName,
    rank: 999,
    score: 0,
    nextScore: 100,
    league: "Novice",
    leagueCode: "BRONZE",
    nextLeague: "Student",
    wins: 0,
    losses: 0,
    winRate: "0%",
    bestCombo: 0,
    wpm: 0,
    streak: 0,
    invited: 0,
  };
}

function createEnergy() {
  return {
    value: 50,
    date: new Date().toISOString().slice(0, 10),
  };
}

function createSession(user) {
  return {
    player: createPlayer(user),
    energy: createEnergy(),
    serverTime: new Date().toISOString(),
  };
}

async function getPlayerSession(user) {
  const storedState = await upsertTelegramPlayer(user);
  if (!storedState) return createSession(user);

  return {
    ...storedState,
    serverTime: new Date().toISOString(),
  };
}

function createDuelId() {
  return `duel_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function createBattleId() {
  return `battle_${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}

function displayNameFromUser(user) {
  return user?.username || [user?.first_name, user?.last_name].filter(Boolean).join(" ") || "Player";
}

function pickServerWord(round = 0) {
  return SERVER_WORDS[Math.abs(round) % SERVER_WORDS.length];
}

function createFriendBattle(battleId, user, opponent) {
  const word = pickServerWord(0);
  const playerId = String(user.id);
  const opponentId = opponent?.id || "friend";
  const state = {
    battleId,
    status: "active",
    maxHp: 120,
    round: 1,
    roundStartedAt: Date.now(),
    wordLength: word.length,
    participantIds: [playerId, opponentId],
    participants: {
      [playerId]: {
        id: playerId,
        name: displayNameFromUser(user),
        hp: 120,
        word,
        typedCount: 0,
      },
      [opponentId]: {
        id: opponentId,
        name: opponent?.name || "PLAYER",
        hp: 120,
        word,
        typedCount: 0,
      },
    },
    serverTime: new Date().toISOString(),
  };

  activeBattles.set(battleId, state);
  void saveActiveBattle(state).catch((error) => {
    console.error("Failed to save active battle:", error);
  });
  return state;
}

async function getBattleState(battleId) {
  const memoryState = activeBattles.get(battleId);
  if (memoryState) return memoryState;

  const storedState = await getActiveBattle(battleId);
  if (!storedState) return null;

  activeBattles.set(battleId, storedState);
  return storedState;
}

async function persistBattleState(state) {
  activeBattles.set(state.battleId, state);
  await saveActiveBattle(state);
}

function getBattleSides(state, user) {
  const userId = String(user.id);
  const playerId = state.participants[userId] ? userId : state.participantIds[0];
  const opponentId = state.participantIds.find((id) => id !== playerId) || playerId;

  return {
    player: state.participants[playerId],
    opponent: state.participants[opponentId],
  };
}

function serializeBattleState(state, user) {
  const sides = getBattleSides(state, user);
  return {
    battleId: state.battleId,
    status: state.status,
    maxHp: state.maxHp,
    round: state.round,
    wordLength: state.wordLength,
    player: sides.player,
    opponent: sides.opponent,
    serverTime: new Date().toISOString(),
    winnerId: state.winnerId,
  };
}

function getTelegramUser(req, res) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    sendJson(res, 503, { error: "telegram_bot_token_not_configured" });
    return null;
  }

  const initData = req.headers["x-telegram-init-data"] || "";
  const user = verifyTelegramInitData(String(initData), botToken);
  if (!user) {
    sendJson(res, 401, { error: "invalid_telegram_init_data" });
    return null;
  }

  return user;
}

function getOptionalTelegramUser(req) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const initData = req.headers["x-telegram-init-data"] || "";
  if (!botToken || !initData) return null;

  return verifyTelegramInitData(String(initData), botToken);
}

function getAdminIds() {
  return new Set(
    String(process.env.TELEGRAM_ADMIN_IDS || "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  );
}

function isAdminTelegramId(id) {
  return getAdminIds().has(String(id));
}

function formatPeriodStats(title, stats) {
  const events = stats.events || {};
  const battles = stats.battles || {};
  return [
    `${title}`,
    `Игроки: новых ${stats.newUsers}, активных ${stats.activeUsers}`,
    `Бои: ${battles.battles || 0} (ИИ ${battles.ai_battles || 0}, друг ${battles.friend_battles || 0}, онлайн ${battles.online_battles || 0})`,
    `Темп: средний ${battles.avg_wpm || 0} WPM, ${battles.avg_seconds || 0} сек, максимум ${battles.max_wpm || 0} WPM, комбо ${battles.max_combo || 0}`,
    `Дуэли: создано ${events.duel_created || 0}, скопировано ${events.duel_copied || 0}, поделились ${events.duel_shared || 0}, открыто ${events.duel_join_opened || 0}, вошли ${events.duel_joined || 0}, истекло ${events.duel_expired || 0}`,
    `Рефералки: создано ${events.ref_link_created || 0}, скопировано ${events.ref_link_copied || 0}, поделились ${events.ref_link_shared || 0}, открыто ${events.ref_opened || 0}, регистраций ${events.ref_registered || 0}, первых боев ${events.ref_first_battle || 0}`,
    `Топ пригласивших: ${stats.topInviters}`,
  ].join("\n");
}

function formatAdminStats(stats) {
  return [
    "Статистика Type Fight",
    `Всего: игроков ${stats.totals.players}, боев ${stats.totals.battleResults}, событий ${stats.totals.analyticsEvents}`,
    `Сейчас: активных боев ${stats.totals.activeBattles}, дуэлей в ожидании ${stats.totals.waitingDuels}, игроков без энергии ${stats.totals.zeroEnergyPlayers}`,
    "",
    formatPeriodStats("Сегодня", stats.byPeriod.today),
    "",
    formatPeriodStats("Вчера", stats.byPeriod.yesterday),
    "",
    formatPeriodStats("Последние 7 дней", stats.byPeriod.week),
  ].join("\n");
}

async function sendTelegramMessage(chatId, text) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return;

  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const pathname = url.pathname.replace(/\/$/, "") || "/";

  try {
    if (req.method === "GET" && pathname === "/api/health") {
      sendJson(res, 200, {
        ok: true,
        service: "typefight-api",
        runtime: "vps-auto",
        database: hasDatabase() ? "configured" : "not_configured",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (req.method === "POST" && pathname === "/api/telegram/session") {
      const user = getTelegramUser(req, res);
      if (!user) return;
      sendJson(res, 200, await getPlayerSession(user));
      return;
    }

    if (req.method === "POST" && pathname === "/api/telegram/webhook") {
      const body = JSON.parse((await readBody(req)) || "{}");
      const message = body.message || body.edited_message;
      const text = String(message?.text || "").trim();
      const fromId = message?.from?.id;
      const chatId = message?.chat?.id;

      if (text.startsWith("/stats") && chatId) {
        if (!isAdminTelegramId(fromId)) {
          await sendTelegramMessage(chatId, "Нет доступа к статистике.");
          sendJson(res, 200, { ok: true });
          return;
        }

        const stats = await getAdminStats();
        await sendTelegramMessage(chatId, stats ? formatAdminStats(stats) : "База статистики недоступна.");
      }

      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && pathname === "/api/player") {
      const user = getTelegramUser(req, res);
      if (!user) return;
      const session = await getPlayerSession(user);
      sendJson(res, 200, {
        player: session.player,
        energy: session.energy,
      });
      return;
    }

    if (req.method === "GET" && pathname === "/api/leaderboard") {
      const period = url.searchParams.get("period") === "today" ? "today" : "week";
      const dbLeaderboard = await getLeaderboard(period, getOptionalTelegramUser(req));
      if (dbLeaderboard) {
        sendJson(res, 200, dbLeaderboard);
        return;
      }

      sendJson(res, 200, {
        period,
        leaders: LEADERS,
        playerRank: 999,
      });
      return;
    }

    if (req.method === "POST" && pathname === "/api/duels") {
      const user = getTelegramUser(req, res);
      if (!user) return;

      const duelId = createDuelId();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      const dbInvite = await createDuelInvite(user, duelId, expiresAt);
      sendJson(res, 200, dbInvite || { duelId, startParam: duelId, expiresAt: expiresAt.toISOString() });
      return;
    }

    if (req.method === "POST" && /^\/api\/duels\/[^/]+\/join$/.test(pathname)) {
      const user = getTelegramUser(req, res);
      if (!user) return;

      const duelId = decodeURIComponent(pathname.split("/")[3] || "");
      const joined = await joinDuelInvite(user, duelId, createBattleId());
      if (joined?.status === "joined" && joined.battleId && !activeBattles.has(joined.battleId)) {
        createFriendBattle(joined.battleId, user, joined.opponent);
      }

      sendJson(res, 200, joined || { status: "not_found" });
      return;
    }

    if (req.method === "GET" && /^\/api\/duels\/[^/]+$/.test(pathname)) {
      const user = getTelegramUser(req, res);
      if (!user) return;

      const duelId = decodeURIComponent(pathname.split("/")[3] || "");
      const status = await getDuelInviteStatus(user, duelId);
      if (status?.status === "joined" && status.battleId && !activeBattles.has(status.battleId)) {
        createFriendBattle(status.battleId, user, status.opponent);
      }

      sendJson(res, 200, status || { status: "not_found" });
      return;
    }

    if (req.method === "GET" && /^\/api\/battles\/[^/]+$/.test(pathname)) {
      const user = getTelegramUser(req, res);
      if (!user) return;

      const battleId = decodeURIComponent(pathname.split("/")[3] || "");
      const state = await getBattleState(battleId);
      if (!state) {
        sendJson(res, 404, { error: "battle_not_found" });
        return;
      }

      sendJson(res, 200, serializeBattleState(state, user));
      return;
    }

    if (req.method === "POST" && /^\/api\/battles\/[^/]+\/typing$/.test(pathname)) {
      const user = getTelegramUser(req, res);
      if (!user) return;

      const battleId = decodeURIComponent(pathname.split("/")[3] || "");
      const state = await getBattleState(battleId);
      if (!state) {
        sendJson(res, 404, { error: "battle_not_found" });
        return;
      }

      const body = JSON.parse((await readBody(req)) || "{}");
      const { player } = getBattleSides(state, user);
      player.typedCount = Math.max(0, Math.min(player.word.length, Number(body.typedCount) || 0));
      await persistBattleState(state);
      sendJson(res, 200, { accepted: true, state: serializeBattleState(state, user) });
      return;
    }

    if (req.method === "POST" && /^\/api\/battles\/[^/]+\/words$/.test(pathname)) {
      const user = getTelegramUser(req, res);
      if (!user) return;

      const battleId = decodeURIComponent(pathname.split("/")[3] || "");
      const state = await getBattleState(battleId);
      if (!state) {
        sendJson(res, 404, { error: "battle_not_found" });
        return;
      }

      const body = JSON.parse((await readBody(req)) || "{}");
      if (state.status === "finished") {
        sendJson(res, 200, {
          accepted: false,
          state: serializeBattleState(state, user),
          outcome: "finished",
          rejectionReason: "battle_finished",
        });
        return;
      }

      const { player, opponent } = getBattleSides(state, user);
      if (Number(body.round) !== state.round) {
        sendJson(res, 200, {
          accepted: false,
          state: serializeBattleState(state, user),
          outcome: "rejected",
          rejectionReason: "stale_round",
        });
        return;
      }

      if (String(body.word || "").toLowerCase() !== player.word) {
        sendJson(res, 200, {
          accepted: false,
          state: serializeBattleState(state, user),
          outcome: "rejected",
          rejectionReason: "wrong_word",
        });
        return;
      }

      opponent.hp = Math.max(0, opponent.hp - 15);
      state.round += 1;
      state.roundStartedAt = Date.now();
      const nextWord = pickServerWord(state.round);
      for (const participant of Object.values(state.participants)) {
        participant.word = nextWord;
        participant.typedCount = 0;
      }
      state.wordLength = nextWord.length;

      if (opponent.hp <= 0) {
        state.status = "finished";
        state.winnerId = String(user.id);
      }

      await persistBattleState(state);
      sendJson(res, 200, {
        accepted: true,
        state: serializeBattleState(state, user),
        damage: 15,
        outcome: state.status === "finished" ? "finished" : "hit",
        nextWord,
      });
      return;
    }

    if (req.method === "POST" && /^\/api\/battles\/[^/]+\/leave$/.test(pathname)) {
      const user = getTelegramUser(req, res);
      if (!user) return;

      const battleId = decodeURIComponent(pathname.split("/")[3] || "");
      const state = await getBattleState(battleId);
      if (state) {
        state.status = "cancelled";
        await persistBattleState(state);
      }

      sendJson(res, 200, { accepted: true });
      return;
    }

    if (req.method === "POST" && pathname === "/api/referrals") {
      const user = getTelegramUser(req, res);
      if (!user) return;

      const body = JSON.parse((await readBody(req)) || "{}");
      sendJson(res, 200, await applyReferral(user, body.referralCode));
      return;
    }

    if (req.method === "POST" && pathname === "/api/analytics/events") {
      const user = getOptionalTelegramUser(req);
      const body = JSON.parse((await readBody(req)) || "{}");
      const result = await recordAnalyticsEvent(user, body);
      sendJson(res, 200, result || { accepted: false });
      return;
    }

    if (req.method === "POST" && pathname === "/api/matchmaking") {
      sendJson(res, 200, {
        status: "unavailable",
        message: "Онлайн-поиск подключим после серверных комнат.",
      });
      return;
    }

    if (req.method === "POST" && pathname === "/api/battles") {
      const user = getTelegramUser(req, res);
      if (!user) return;

      const body = JSON.parse((await readBody(req)) || "{}");
      const storedState = await recordBattleResult(user, body);
      if (!storedState) {
        sendJson(res, 200, {
          accepted: true,
          player: createPlayer(user),
          energy: createEnergy(),
          energySpent: 0,
        });
        return;
      }

      sendJson(res, 200, {
        accepted: true,
        player: storedState.player,
        energy: storedState.energy,
        energySpent: storedState.energySpent || 0,
      });
      return;
    }

    sendJson(res, 404, { error: "not_found" });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "server_error" });
  }
});

initDb()
  .catch((error) => {
    console.error("Database init failed:", error);
  })
  .finally(() => {
    cleanupExpiredGameRows().catch((error) => {
      console.error("Initial cleanup failed:", error);
    });

    setInterval(() => {
      cleanupExpiredGameRows().catch((error) => {
        console.error("Scheduled cleanup failed:", error);
      });
    }, CLEANUP_INTERVAL_MS).unref();

    server.listen(PORT, "127.0.0.1", () => {
      console.log(`Type Fight API listening on 127.0.0.1:${PORT}`);
    });
  });
