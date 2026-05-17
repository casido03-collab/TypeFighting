const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const {
  createDuelInvite,
  getLeaderboard,
  hasDatabase,
  initDb,
  joinDuelInvite,
  recordBattleResult,
  upsertTelegramPlayer,
} = require("./db");

const PORT = Number(process.env.PORT || 3001);
const MAX_INIT_DATA_AGE_SECONDS = 24 * 60 * 60;

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
  const state = {
    battleId,
    status: "active",
    maxHp: 120,
    round: 1,
    wordLength: word.length,
    player: {
      id: String(user.id),
      name: displayNameFromUser(user),
      hp: 120,
      word,
      typedCount: 0,
    },
    opponent: {
      id: opponent?.id || "friend",
      name: opponent?.name || "PLAYER",
      hp: 120,
      word,
      typedCount: 0,
    },
    serverTime: new Date().toISOString(),
  };

  activeBattles.set(battleId, state);
  return state;
}

function serializeBattleState(state) {
  return {
    ...state,
    serverTime: new Date().toISOString(),
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

    if (req.method === "GET" && /^\/api\/battles\/[^/]+$/.test(pathname)) {
      const user = getTelegramUser(req, res);
      if (!user) return;

      const battleId = decodeURIComponent(pathname.split("/")[3] || "");
      const state = activeBattles.get(battleId);
      if (!state) {
        sendJson(res, 404, { error: "battle_not_found" });
        return;
      }

      sendJson(res, 200, serializeBattleState(state));
      return;
    }

    if (req.method === "POST" && /^\/api\/battles\/[^/]+\/typing$/.test(pathname)) {
      const user = getTelegramUser(req, res);
      if (!user) return;

      const battleId = decodeURIComponent(pathname.split("/")[3] || "");
      const state = activeBattles.get(battleId);
      if (!state) {
        sendJson(res, 404, { error: "battle_not_found" });
        return;
      }

      const body = JSON.parse((await readBody(req)) || "{}");
      state.player.typedCount = Math.max(0, Math.min(state.player.word.length, Number(body.typedCount) || 0));
      sendJson(res, 200, { accepted: true, state: serializeBattleState(state) });
      return;
    }

    if (req.method === "POST" && /^\/api\/battles\/[^/]+\/words$/.test(pathname)) {
      const user = getTelegramUser(req, res);
      if (!user) return;

      const battleId = decodeURIComponent(pathname.split("/")[3] || "");
      const state = activeBattles.get(battleId);
      if (!state) {
        sendJson(res, 404, { error: "battle_not_found" });
        return;
      }

      const body = JSON.parse((await readBody(req)) || "{}");
      if (state.status === "finished") {
        sendJson(res, 200, {
          accepted: false,
          state: serializeBattleState(state),
          outcome: "finished",
          rejectionReason: "battle_finished",
        });
        return;
      }

      if (String(body.word || "").toLowerCase() !== state.player.word) {
        sendJson(res, 200, {
          accepted: false,
          state: serializeBattleState(state),
          outcome: "rejected",
          rejectionReason: "wrong_word",
        });
        return;
      }

      state.opponent.hp = Math.max(0, state.opponent.hp - 15);
      state.round += 1;
      const nextWord = pickServerWord(state.round);
      state.player.word = nextWord;
      state.opponent.word = nextWord;
      state.wordLength = nextWord.length;
      state.player.typedCount = 0;
      state.opponent.typedCount = 0;

      if (state.opponent.hp <= 0) {
        state.status = "finished";
        state.winnerId = String(user.id);
      }

      sendJson(res, 200, {
        accepted: true,
        state: serializeBattleState(state),
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
      const state = activeBattles.get(battleId);
      if (state) state.status = "cancelled";

      sendJson(res, 200, { accepted: true });
      return;
    }

    if (req.method === "POST" && pathname === "/api/referrals") {
      await readBody(req);
      sendJson(res, 200, {
        accepted: false,
        message: "Реферальную систему подключим после базы.",
      });
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
    server.listen(PORT, "127.0.0.1", () => {
      console.log(`Type Fight API listening on 127.0.0.1:${PORT}`);
    });
  });
