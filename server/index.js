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
  getPushCandidates,
  getPushStats,
  hasDatabase,
  initDb,
  joinDuelInvite,
  recordAnalyticsEvent,
  recordBattleResult,
  recordPushFailed,
  recordPushOpen,
  recordPushSent,
  recordSystemEvent,
  markTelegramPushBlocked,
  saveActiveBattle,
  upsertTelegramPlayer,
} = require("./db");
const {
  PUSH_LABELS,
  PUSH_SCHEDULER_INTERVAL_MS,
  PUSH_START_PARAMS,
  PUSH_TYPES,
  getPushMessages,
} = require("./pushConfig");

const PORT = Number(process.env.PORT || 3001);
const MAX_INIT_DATA_AGE_SECONDS = 3 * 60 * 60;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const MATCHMAKING_TIMEOUT_MS = 20 * 1000;
const MIN_SERVER_WORD_MS_PER_LETTER = 80;
const ADMIN_ALERT_COOLDOWN_MS = 10 * 60 * 1000;
const TELEGRAM_POLLING_RETRY_MS = 5000;
const MAX_REQUEST_BODY_BYTES = 256 * 1024;
const MAX_AI_BATTLE_WPM = 260;
const MAX_AI_BATTLE_WORDS_PER_MINUTE = 75;
const DEFAULT_TELEGRAM_APP_URL = "https://typefight.shop";
const DEFAULT_TELEGRAM_VPN_URL = "https://t.me/ScroogeVPNRobot?start=partner_2102945039";
const ALLOWED_ORIGINS = new Set([
  "https://typefight.shop",
  "https://www.typefight.shop",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5174",
]);
const ANALYTICS_EVENT_NAMES = new Set([
  "duel_created",
  "duel_copied",
  "duel_shared",
  "duel_join_opened",
  "ref_opened",
  "ref_link_created",
  "ref_link_copied",
  "ref_link_shared",
]);
const rateLimitBuckets = new Map();

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
const matchmakingQueue = new Map();
const adminAlertCooldowns = new Map();

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  });
  res.end(JSON.stringify(body));
}

function logSystemEvent(req, event) {
  void recordSystemEvent({
    ...event,
    method: event.method || req?.method || null,
    path: event.path || req?.url || null,
  }).catch((error) => {
    console.error("Failed to record system event:", error);
  });
}

function shouldSendAdminAlert(eventName) {
  if (process.env.TELEGRAM_ALERTS_ENABLED === "false") return false;

  const now = Date.now();
  const lastSentAt = adminAlertCooldowns.get(eventName) || 0;
  if (now - lastSentAt < ADMIN_ALERT_COOLDOWN_MS) return false;

  adminAlertCooldowns.set(eventName, now);
  return true;
}

function getPublicAppUrl() {
  return String(process.env.TELEGRAM_APP_URL || process.env.PUBLIC_APP_URL || DEFAULT_TELEGRAM_APP_URL).trim();
}

function getVpnReferralUrl() {
  return String(process.env.TELEGRAM_VPN_URL || DEFAULT_TELEGRAM_VPN_URL).trim();
}

function sendAdminAlert(eventName, text) {
  if (!shouldSendAdminAlert(eventName)) return;

  for (const adminId of getAdminIds()) {
    void sendTelegramMessage(adminId, text).catch((error) => {
      console.error("Failed to send admin alert:", error);
    });
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_REQUEST_BODY_BYTES) {
        reject(new Error("request_body_too_large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function getRequestIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.socket.remoteAddress || "unknown";
}

function getRateLimitKey(req, scope, user = null) {
  const userKey = user?.id ? `tg:${user.id}` : `ip:${getRequestIp(req)}`;
  return `${scope}:${userKey}`;
}

function isRateLimited(req, res, scope, options = {}, user = null) {
  const now = Date.now();
  const windowMs = options.windowMs || 60 * 1000;
  const limit = options.limit || 60;
  const key = getRateLimitKey(req, scope, user);
  const bucket = rateLimitBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  bucket.count += 1;
  if (bucket.count <= limit) return false;

  logSystemEvent(req, {
    eventName: "api_rate_limited",
    statusCode: 429,
    message: `Rate limit exceeded: ${scope}`,
    metadata: { scope, key },
  });
  sendJson(res, 429, { error: "rate_limited" });
  return true;
}

function cleanupRateLimits() {
  const now = Date.now();
  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (bucket.resetAt <= now) rateLimitBuckets.delete(key);
  }
}

function isAllowedOrigin(req) {
  const origin = String(req.headers.origin || "").trim();
  if (!origin) return true;
  return ALLOWED_ORIGINS.has(origin);
}

function enforceAllowedOrigin(req, res, pathname) {
  if (pathname === "/api/telegram/webhook") return true;
  if (isAllowedOrigin(req)) return true;

  logSystemEvent(req, {
    eventName: "api_origin_blocked",
    statusCode: 403,
    message: "Blocked request origin",
    metadata: { origin: req.headers.origin || null, pathname },
  });
  sendJson(res, 403, { error: "origin_not_allowed" });
  return false;
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
  return `duel_${crypto.randomBytes(12).toString("base64url").toUpperCase()}`;
}

function createBattleId() {
  return `battle_${crypto.randomBytes(12).toString("base64url").toUpperCase()}`;
}

function displayNameFromUser(user) {
  return user?.username || [user?.first_name, user?.last_name].filter(Boolean).join(" ") || "Player";
}

function pickServerWord(round = 0) {
  return SERVER_WORDS[Math.abs(round) % SERVER_WORDS.length];
}

function createFriendBattle(battleId, user, opponent, mode = "friend") {
  const word = pickServerWord(0);
  const playerId = String(user.id);
  const opponentId = opponent?.id || "friend";
  const state = {
    battleId,
    mode,
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

function clearMatchmakingEntry(playerId) {
  const entry = matchmakingQueue.get(playerId);
  if (!entry) return;

  clearTimeout(entry.timeout);
  matchmakingQueue.delete(playerId);
}

function serializeMatchmakingOpponent(user) {
  return {
    id: String(user.id),
    name: displayNameFromUser(user),
    league: "Novice",
    wpm: 0,
  };
}

function findWaitingMatch(userId) {
  for (const [waitingUserId, entry] of matchmakingQueue.entries()) {
    if (waitingUserId !== userId) return entry;
  }

  return null;
}

function runMatchmaking(user) {
  const userId = String(user.id);
  clearMatchmakingEntry(userId);

  const waitingEntry = findWaitingMatch(userId);
  if (waitingEntry) {
    clearMatchmakingEntry(waitingEntry.userId);

    const battleId = createBattleId();
    createFriendBattle(battleId, waitingEntry.user, serializeMatchmakingOpponent(user), "online");

    const currentOpponent = serializeMatchmakingOpponent(waitingEntry.user);
    const waitingOpponent = serializeMatchmakingOpponent(user);

    waitingEntry.resolve({
      status: "matched",
      battleId,
      opponent: waitingOpponent,
      message: "Соперник найден.",
    });

    return Promise.resolve({
      status: "matched",
      battleId,
      opponent: currentOpponent,
      message: "Соперник найден.",
    });
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      matchmakingQueue.delete(userId);
      resolve({
        status: "unavailable",
        message: "Соперник не найден за 20 секунд. Попробуйте еще раз.",
      });
    }, MATCHMAKING_TIMEOUT_MS);

    matchmakingQueue.set(userId, {
      userId,
      user,
      resolve,
      timeout,
      createdAt: Date.now(),
    });
  });
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

function isBattleParticipant(state, user) {
  return Boolean(state?.participants?.[String(user?.id)]);
}

function requireBattleParticipant(req, res, state, user) {
  if (isBattleParticipant(state, user)) return true;

  logSystemEvent(req, {
    eventName: "battle_participant_invalid",
    statusCode: 403,
    message: "User tried to access a battle without being a participant",
    metadata: { battleId: state?.battleId || null, telegramId: user?.id || null },
  });
  sendJson(res, 403, { error: "battle_participant_invalid" });
  return false;
}

function finishBattleByForfeit(state, user) {
  const userId = String(user.id);
  if (!state.participants[userId] || state.status === "finished") return state;

  const opponentId = state.participantIds.find((id) => id !== userId);
  if (!opponentId || !state.participants[opponentId]) {
    state.status = "cancelled";
    return state;
  }

  state.status = "finished";
  state.winnerId = opponentId;
  state.finishedReason = "forfeit";
  state.participants[userId].hp = 0;
  state.participants[opponentId].hp = Math.max(1, state.participants[opponentId].hp);
  return state;
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
    logSystemEvent(req, {
      eventName: "telegram_bot_token_missing",
      statusCode: 503,
      message: "TELEGRAM_BOT_TOKEN is not configured",
    });
    sendJson(res, 503, { error: "telegram_bot_token_not_configured" });
    return null;
  }

  const initData = req.headers["x-telegram-init-data"] || "";
  const user = verifyTelegramInitData(String(initData), botToken);
  if (!user) {
    logSystemEvent(req, {
      eventName: "telegram_init_data_invalid",
      statusCode: 401,
      message: "Invalid Telegram init data",
    });
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

function isTelegramWebhookSecretValid(req) {
  const expectedSecret = String(process.env.TELEGRAM_WEBHOOK_SECRET || "").trim();
  if (!expectedSecret) return true;

  const receivedSecret = String(req.headers["x-telegram-bot-api-secret-token"] || "").trim();
  if (!receivedSecret) return false;

  const expected = Buffer.from(expectedSecret);
  const received = Buffer.from(receivedSecret);
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

function formatPeriodStats(title, stats) {
  const events = stats.events || {};
  const battles = stats.battles || {};
  const system = stats.system || {};
  return [
    `${title}`,
    `Игроки`,
    `Новых: ${stats.newUsers}`,
    `Активных: ${stats.activeUsers}`,
    ``,
    `Бои`,
    `Всего: ${battles.battles || 0}`,
    `С ИИ: ${battles.ai_battles || 0}`,
    `С другом: ${battles.friend_battles || 0}`,
    `Онлайн: ${battles.online_battles || 0}`,
    ``,
    `Темп`,
    `Средний WPM: ${battles.avg_wpm || 0}`,
    `Средняя длительность: ${battles.avg_seconds || 0} сек`,
    `Максимальный WPM: ${battles.max_wpm || 0}`,
    `Максимальное комбо: ${battles.max_combo || 0}`,
    ``,
    `Дуэли`,
    `Создано: ${events.duel_created || 0}`,
    `Скопировано: ${events.duel_copied || 0}`,
    `Поделились: ${events.duel_shared || 0}`,
    `Открыто: ${events.duel_join_opened || 0}`,
    `Вошли: ${events.duel_joined || 0}`,
    `Истекло: ${events.duel_expired || 0}`,
    ``,
    `Рефералки`,
    `Создано ссылок: ${events.ref_link_created || 0}`,
    `Скопировано: ${events.ref_link_copied || 0}`,
    `Поделились: ${events.ref_link_shared || 0}`,
    `Открыто: ${events.ref_opened || 0}`,
    `Регистраций: ${events.ref_registered || 0}`,
    `Первых боев: ${events.ref_first_battle || 0}`,
    ``,
    `Топ пригласивших`,
    `${stats.topInviters}`,
    ``,
    `Техника`,
    `Ошибок всего: ${system.total || 0}`,
    `401: ${system.unauthorized || 0}`,
    `500+: ${system.server_errors || 0}`,
    `Ошибок отправки Telegram: ${system.telegram_send_failed || 0}`,
    `Ошибок webhook secret: ${system.webhook_secret_invalid || 0}`,
    `Топ ошибок: ${system.topEvents || "нет данных"}`,
  ].join("\n");
}

function formatAdminStats(stats) {
  return [
    "Статистика Type Fight",
    "",
    "Всего",
    `Игроков: ${stats.totals.players}`,
    `Боев: ${stats.totals.battleResults}`,
    `Событий: ${stats.totals.analyticsEvents}`,
    `Технических событий: ${stats.totals.systemEvents}`,
    "",
    "Сейчас",
    `Активных боев: ${stats.totals.activeBattles}`,
    `Дуэлей в ожидании: ${stats.totals.waitingDuels}`,
    `Игроков без энергии: ${stats.totals.zeroEnergyPlayers}`,
    "",
    formatPeriodStats("Сегодня", stats.byPeriod.today),
    "",
    formatPeriodStats("Вчера", stats.byPeriod.yesterday),
    "",
    formatPeriodStats("Последние 7 дней", stats.byPeriod.week),
  ].join("\n");
}

async function sendTelegramMessage(chatId, text, extra = {}) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
        ...extra,
      }),
      signal: controller.signal,
    });

    const result = await response.json().catch(() => null);
    if (!response.ok || result?.ok === false) {
      throw new Error(result?.description || `Telegram sendMessage failed with ${response.status}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

function getStartMessage() {
  return [
    "⚔️ Добро пожаловать в Type Fight — онлайн-дуэли на скорость печати прямо в Telegram.",
    "Побеждает тот, кто быстрее печатает слова и наносит удары сопернику.",
    "",
    "🌐 Для стабильной работы игры включи VPN перед запуском.",
    "После подключения нажми кнопку ниже и заходи в бой.",
  ].join("\n");
}

function getStartKeyboard(startParam = "") {
  const appUrl = new URL(getPublicAppUrl());
  if (startParam) {
    appUrl.searchParams.set("startapp", startParam);
  }

  return {
    inline_keyboard: [
      [
        {
          text: "⚔️ Играть",
          web_app: { url: appUrl.toString() },
        },
      ],
      [
        {
          text: "💻 Подключить VPN",
          url: getVpnReferralUrl(),
        },
      ],
    ],
  };
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function formatPushStats(stats) {
  if (!stats) return "Push stats недоступна.";

  const byType = new Map(stats.map((row) => [row.pushType, row]));
  const sections = [PUSH_TYPES.INACTIVE_24H, PUSH_TYPES.WIN_STREAK, PUSH_TYPES.FRIEND_DUEL].map((pushType) => {
    const row = byType.get(pushType) || { sent: 0, opened: 0, ctr: 0 };
    return [
      PUSH_LABELS[pushType],
      `Sent: ${row.sent}`,
      `Opened: ${row.opened}`,
      `CTR: ${formatPercent(row.ctr)}`,
    ].join("\n");
  });

  return ["📊 Push Stats", "", ...sections.flatMap((section) => [section, ""])].join("\n").trim();
}

function pickPushMessage(pushType, lastIndex) {
  const messages = getPushMessages(pushType);
  if (messages.length === 0) return { text: "Type Fight ждёт тебя на арене ⚔️", index: 0 };
  if (messages.length === 1) return { text: messages[0], index: 0 };

  let index = Math.floor(Math.random() * messages.length);
  if (Number.isInteger(lastIndex) && index === lastIndex) {
    index = (index + 1 + Math.floor(Math.random() * (messages.length - 1))) % messages.length;
  }

  return { text: messages[index], index };
}

function getPushKeyboard(pushType) {
  const startParam = PUSH_START_PARAMS[pushType] || PUSH_START_PARAMS[PUSH_TYPES.INACTIVE_24H];
  const appUrl = new URL(getPublicAppUrl());
  appUrl.searchParams.set("startapp", startParam);

  return {
    inline_keyboard: [
      [
        {
          text: "⚔️ Играть",
          web_app: { url: appUrl.toString() },
        },
      ],
    ],
  };
}

function isTelegramBlockedError(error) {
  const message = String(error?.message || error || "").toLowerCase();
  return (
    message.includes("bot was blocked") ||
    message.includes("user is deactivated") ||
    message.includes("chat not found") ||
    message.includes("forbidden")
  );
}

function isPushSchedulerEnabled() {
  return process.env.PUSH_SCHEDULER_ENABLED !== "false";
}

async function runPushScheduler() {
  if (!hasDatabase() || !process.env.TELEGRAM_BOT_TOKEN || !isPushSchedulerEnabled()) return;

  const candidates = await getPushCandidates();
  for (const candidate of candidates) {
    const pushType = candidate.pushType;
    const lastIndex = pushType === PUSH_TYPES.INACTIVE_24H ? Number(candidate.last_inactive_message_index) : null;
    const message = pickPushMessage(pushType, lastIndex);

    try {
      await sendTelegramMessage(String(candidate.telegram_id), message.text, {
        reply_markup: getPushKeyboard(pushType),
      });
      await recordPushSent(candidate.id, pushType, message.index, candidate.pushKey);
    } catch (error) {
      console.error("Failed to send push message:", error);
      await recordPushFailed(candidate.id, pushType, error.message || "telegram_send_failed");
      if (isTelegramBlockedError(error)) {
        await markTelegramPushBlocked(candidate.id, error.message || "telegram_blocked");
      }
    }
  }
}

function startPushScheduler() {
  if (!isPushSchedulerEnabled()) return;

  const firstRunDelay = setTimeout(() => {
    void runPushScheduler().catch((error) => {
      console.error("Push scheduler failed:", error);
    });
  }, 30 * 1000);
  firstRunDelay.unref?.();

  setInterval(() => {
    void runPushScheduler().catch((error) => {
      console.error("Push scheduler failed:", error);
    });
  }, PUSH_SCHEDULER_INTERVAL_MS).unref();
}

async function handleTelegramBotMessage(message, req = null) {
  const text = String(message?.text || "").trim();
  const fromId = message?.from?.id;
  const chatId = message?.chat?.id;
  const startPayload = text.startsWith("/start") ? text.split(/\s+/)[1] || "" : "";

  if (!text || !chatId) return false;

  if (text.startsWith("/start")) {
    try {
      await sendTelegramMessage(chatId, getStartMessage(), {
        reply_markup: getStartKeyboard(startPayload),
      });
    } catch (error) {
      console.error("Failed to send Telegram start message:", error);
      logSystemEvent(req, {
        eventName: "telegram_send_failed",
        message: error.message || "Failed to send start message",
        metadata: { chatId, command: "start" },
      });
    }

    return true;
  }

  if (text.startsWith("/pushstats")) {
    if (!isAdminTelegramId(fromId)) {
      try {
        await sendTelegramMessage(chatId, "Нет доступа к push-статистике.");
      } catch (error) {
        console.error("Failed to send Telegram access denied message:", error);
        logSystemEvent(req, {
          eventName: "telegram_send_failed",
          message: error.message || "Failed to send access denied message",
          metadata: { chatId, command: "pushstats_denied" },
        });
      }

      return true;
    }

    try {
      await sendTelegramMessage(chatId, formatPushStats(await getPushStats()));
    } catch (error) {
      console.error("Failed to send Telegram push stats message:", error);
      logSystemEvent(req, {
        eventName: "telegram_send_failed",
        message: error.message || "Failed to send push stats message",
        metadata: { chatId, command: "pushstats" },
      });
    }

    return true;
  }

  if (text.startsWith("/stats")) {
    if (!isAdminTelegramId(fromId)) {
      try {
        await sendTelegramMessage(chatId, "РќРµС‚ РґРѕСЃС‚СѓРїР° Рє СЃС‚Р°С‚РёСЃС‚РёРєРµ.");
      } catch (error) {
        console.error("Failed to send Telegram access denied message:", error);
        logSystemEvent(req, {
          eventName: "telegram_send_failed",
          message: error.message || "Failed to send access denied message",
          metadata: { chatId, command: "stats_denied" },
        });
      }

      return true;
    }

    try {
      const stats = await getAdminStats();
      const textMessage = stats ? formatAdminStats(stats) : "Р‘Р°Р·Р° СЃС‚Р°С‚РёСЃС‚РёРєРё РЅРµРґРѕСЃС‚СѓРїРЅР°.";
      await sendTelegramMessage(chatId, textMessage);
    } catch (error) {
      console.error("Failed to send Telegram stats message:", error);
      logSystemEvent(req, {
        eventName: "telegram_send_failed",
        message: error.message || "Failed to send stats message",
        metadata: { chatId, command: "stats" },
      });
    }

    return true;
  }

  return false;
}

function isTelegramPollingEnabled() {
  return process.env.TELEGRAM_POLLING_ENABLED !== "false";
}

function validateAnalyticsEventName(req, res, eventName) {
  if (ANALYTICS_EVENT_NAMES.has(String(eventName || ""))) return true;

  logSystemEvent(req, {
    eventName: "analytics_event_rejected",
    statusCode: 400,
    message: "Rejected unknown analytics event",
    metadata: { eventName },
  });
  sendJson(res, 400, { error: "invalid_analytics_event" });
  return false;
}

function validateBattleResultPayload(req, res, result) {
  const mode = String(result?.mode || "");
  const durationMs = Number(result?.durationMs || 0);
  const wordsCompleted = Number(result?.wordsCompleted || 0);
  const combo = Number(result?.combo || 0);

  if (!["ai", "online", "friend"].includes(mode)) {
    sendJson(res, 400, { error: "invalid_battle_mode" });
    return false;
  }

  if (!Number.isFinite(durationMs) || durationMs < 1000 || durationMs > 60 * 60 * 1000) {
    sendJson(res, 400, { error: "invalid_battle_duration" });
    return false;
  }

  if (!Number.isFinite(wordsCompleted) || wordsCompleted < 0 || wordsCompleted > 1000) {
    sendJson(res, 400, { error: "invalid_words_completed" });
    return false;
  }

  if (!Number.isFinite(combo) || combo < 0 || combo > 1000) {
    sendJson(res, 400, { error: "invalid_combo" });
    return false;
  }

  if (mode === "ai" && wordsCompleted > 0) {
    const minutes = durationMs / 60000;
    const wordsPerMinute = wordsCompleted / minutes;
    const wpm = Math.round(wordsCompleted / minutes);
    const suspicious = wordsPerMinute > MAX_AI_BATTLE_WORDS_PER_MINUTE || wpm > MAX_AI_BATTLE_WPM;

    if (suspicious) {
      logSystemEvent(req, {
        eventName: "battle_result_rejected",
        statusCode: 400,
        message: "Rejected suspicious AI battle result",
        metadata: { mode, durationMs, wordsCompleted, combo, wordsPerMinute, wpm },
      });
      sendJson(res, 400, { error: "suspicious_battle_result" });
      return false;
    }
  }

  return true;
}

function wait(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

async function startTelegramPolling() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken || !isTelegramPollingEnabled()) return;

  let offset = 0;
  let conflictLogged = false;

  while (true) {
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${botToken}/getUpdates?timeout=25&offset=${offset}&allowed_updates=${encodeURIComponent(
          JSON.stringify(["message", "edited_message"])
        )}`
      );
      const result = await response.json().catch(() => null);

      if (!response.ok || result?.ok === false) {
        if (response.status === 409) {
          if (!conflictLogged) {
            conflictLogged = true;
            console.warn("Telegram polling waits for webhook deletion.");
          }
          await wait(TELEGRAM_POLLING_RETRY_MS);
          continue;
        }

        throw new Error(result?.description || `Telegram getUpdates failed with ${response.status}`);
      }

      conflictLogged = false;
      for (const update of result.result || []) {
        offset = Math.max(offset, Number(update.update_id || 0) + 1);
        await handleTelegramBotMessage(update.message || update.edited_message);
      }
    } catch (error) {
      console.error("Telegram polling failed:", error);
      await wait(TELEGRAM_POLLING_RETRY_MS);
    }
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const pathname = url.pathname.replace(/\/$/, "") || "/";

  try {
    if (pathname.startsWith("/api/") && !enforceAllowedOrigin(req, res, pathname)) {
      return;
    }

    if (pathname.startsWith("/api/") && isRateLimited(req, res, "api", { limit: 180, windowMs: 60 * 1000 })) {
      return;
    }

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
      if (isRateLimited(req, res, "session", { limit: 30, windowMs: 60 * 1000 }, user)) return;

      sendJson(res, 200, await getPlayerSession(user));
      return;
    }

    if (req.method === "POST" && pathname === "/api/telegram/webhook") {
      if (isRateLimited(req, res, "telegram_webhook", { limit: 300, windowMs: 60 * 1000 })) return;

      if (!isTelegramWebhookSecretValid(req)) {
        logSystemEvent(req, {
          eventName: "telegram_webhook_secret_invalid",
          statusCode: 401,
          message: "Invalid Telegram webhook secret header",
        });
        sendAdminAlert(
          "telegram_webhook_secret_invalid",
          "Type Fight alert\nWebhook получил запрос с неверным secret token."
        );
        sendJson(res, 401, { error: "invalid_telegram_webhook_secret" });
        return;
      }

      const body = JSON.parse((await readBody(req)) || "{}");
      const message = body.message || body.edited_message;
      const text = String(message?.text || "").trim();
      const fromId = message?.from?.id;
      const chatId = message?.chat?.id;
      const startPayload = text.startsWith("/start") ? text.split(/\s+/)[1] || "" : "";

      if (text.startsWith("/start") && chatId) {
        sendJson(res, 200, { ok: true });

        void sendTelegramMessage(chatId, getStartMessage(), {
            reply_markup: getStartKeyboard(startPayload),
          }).catch((error) => {
          console.error("Failed to send Telegram start message:", error);
          logSystemEvent(req, {
            eventName: "telegram_send_failed",
            message: error.message || "Failed to send start message",
            metadata: { chatId, command: "start" },
          });
        });
        return;
      }

      if (text.startsWith("/pushstats") && chatId) {
        if (!isAdminTelegramId(fromId)) {
          void sendTelegramMessage(chatId, "Нет доступа к push-статистике.").catch((error) => {
            console.error("Failed to send Telegram access denied message:", error);
            logSystemEvent(req, {
              eventName: "telegram_send_failed",
              message: error.message || "Failed to send access denied message",
              metadata: { chatId, command: "pushstats_denied" },
            });
          });
          sendJson(res, 200, { ok: true });
          return;
        }

        const stats = await getPushStats();
        void sendTelegramMessage(chatId, formatPushStats(stats)).catch((error) => {
          console.error("Failed to send Telegram push stats message:", error);
          logSystemEvent(req, {
            eventName: "telegram_send_failed",
            message: error.message || "Failed to send push stats message",
            metadata: { chatId, command: "pushstats" },
          });
        });
        sendJson(res, 200, { ok: true });
        return;
      }

      if (text.startsWith("/stats") && chatId) {
        if (!isAdminTelegramId(fromId)) {
          void sendTelegramMessage(chatId, "Нет доступа к статистике.").catch((error) => {
            console.error("Failed to send Telegram access denied message:", error);
            logSystemEvent(req, {
              eventName: "telegram_send_failed",
              message: error.message || "Failed to send access denied message",
              metadata: { chatId, command: "stats_denied" },
            });
          });
          sendJson(res, 200, { ok: true });
          return;
        }

        const stats = await getAdminStats();
        const textMessage = stats ? formatAdminStats(stats) : "База статистики недоступна.";
        void sendTelegramMessage(chatId, textMessage).catch((error) => {
          console.error("Failed to send Telegram stats message:", error);
          logSystemEvent(req, {
            eventName: "telegram_send_failed",
            message: error.message || "Failed to send stats message",
            metadata: { chatId, command: "stats" },
          });
        });
      }

      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && pathname === "/api/player") {
      const user = getTelegramUser(req, res);
      if (!user) return;
      if (isRateLimited(req, res, "player", { limit: 90, windowMs: 60 * 1000 }, user)) return;

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
      if (isRateLimited(req, res, "duels_create", { limit: 12, windowMs: 60 * 1000 }, user)) return;

      const duelId = createDuelId();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      const dbInvite = await createDuelInvite(user, duelId, expiresAt);
      sendJson(res, 200, dbInvite || { duelId, startParam: duelId, expiresAt: expiresAt.toISOString() });
      return;
    }

    if (req.method === "POST" && /^\/api\/duels\/[^/]+\/join$/.test(pathname)) {
      const user = getTelegramUser(req, res);
      if (!user) return;
      if (isRateLimited(req, res, "duels_join", { limit: 20, windowMs: 60 * 1000 }, user)) return;

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
      if (isRateLimited(req, res, "duels_status", { limit: 80, windowMs: 60 * 1000 }, user)) return;

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
      if (isRateLimited(req, res, "battle_state", { limit: 180, windowMs: 60 * 1000 }, user)) return;

      const battleId = decodeURIComponent(pathname.split("/")[3] || "");
      const state = await getBattleState(battleId);
      if (!state) {
        sendJson(res, 404, { error: "battle_not_found" });
        return;
      }
      if (!requireBattleParticipant(req, res, state, user)) return;

      sendJson(res, 200, serializeBattleState(state, user));
      return;
    }

    if (req.method === "POST" && /^\/api\/battles\/[^/]+\/typing$/.test(pathname)) {
      const user = getTelegramUser(req, res);
      if (!user) return;
      if (isRateLimited(req, res, "battle_typing", { limit: 120, windowMs: 60 * 1000 }, user)) return;

      const battleId = decodeURIComponent(pathname.split("/")[3] || "");
      const state = await getBattleState(battleId);
      if (!state) {
        sendJson(res, 404, { error: "battle_not_found" });
        return;
      }
      if (!requireBattleParticipant(req, res, state, user)) return;

      const body = JSON.parse((await readBody(req)) || "{}");
      const { player } = getBattleSides(state, user);
      const nextTypedCount = Math.max(0, Math.min(player.word.length, Number(body.typedCount) || 0));
      player.typedCount = Math.max(Number(player.typedCount || 0), nextTypedCount);
      await persistBattleState(state);
      sendJson(res, 200, { accepted: true, state: serializeBattleState(state, user) });
      return;
    }

    if (req.method === "POST" && /^\/api\/battles\/[^/]+\/words$/.test(pathname)) {
      const user = getTelegramUser(req, res);
      if (!user) return;
      if (isRateLimited(req, res, "battle_words", { limit: 80, windowMs: 60 * 1000 }, user)) return;

      const battleId = decodeURIComponent(pathname.split("/")[3] || "");
      const state = await getBattleState(battleId);
      if (!state) {
        sendJson(res, 404, { error: "battle_not_found" });
        return;
      }
      if (!requireBattleParticipant(req, res, state, user)) return;

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

      const elapsedRoundMs = Date.now() - Number(state.roundStartedAt || 0);
      const minRoundMs = Math.max(320, player.word.length * MIN_SERVER_WORD_MS_PER_LETTER);
      if (elapsedRoundMs < minRoundMs) {
        sendJson(res, 200, {
          accepted: false,
          state: serializeBattleState(state, user),
          outcome: "rejected",
          rejectionReason: "too_fast",
          message: "Слово отправлено слишком быстро.",
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
      if (isRateLimited(req, res, "battle_leave", { limit: 30, windowMs: 60 * 1000 }, user)) return;

      const battleId = decodeURIComponent(pathname.split("/")[3] || "");
      const state = await getBattleState(battleId);
      if (state) {
        if (!requireBattleParticipant(req, res, state, user)) return;
        finishBattleByForfeit(state, user);
        await persistBattleState(state);
      }

      sendJson(res, 200, { accepted: true });
      return;
    }

    if (req.method === "POST" && pathname === "/api/referrals") {
      const user = getTelegramUser(req, res);
      if (!user) return;
      if (isRateLimited(req, res, "referrals", { limit: 12, windowMs: 60 * 1000 }, user)) return;

      const body = JSON.parse((await readBody(req)) || "{}");
      sendJson(res, 200, await applyReferral(user, body.referralCode));
      return;
    }

    if (req.method === "POST" && pathname === "/api/push/open") {
      const user = getTelegramUser(req, res);
      if (!user) return;
      if (isRateLimited(req, res, "push_open", { limit: 20, windowMs: 60 * 1000 }, user)) return;

      const body = JSON.parse((await readBody(req)) || "{}");
      sendJson(res, 200, await recordPushOpen(user, body.pushType || body.startParam));
      return;
    }

    if (req.method === "POST" && pathname === "/api/analytics/events") {
      const user = getOptionalTelegramUser(req);
      if (isRateLimited(req, res, "analytics", { limit: 60, windowMs: 60 * 1000 }, user)) return;
      const body = JSON.parse((await readBody(req)) || "{}");
      if (!validateAnalyticsEventName(req, res, body.eventName)) return;

      const result = await recordAnalyticsEvent(user, body);
      sendJson(res, 200, result || { accepted: false });
      return;
    }

    if (req.method === "POST" && pathname === "/api/matchmaking") {
      const user = getTelegramUser(req, res);
      if (!user) return;
      if (isRateLimited(req, res, "matchmaking", { limit: 8, windowMs: 60 * 1000 }, user)) return;

      const result = await runMatchmaking(user);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "POST" && pathname === "/api/battles") {
      const user = getTelegramUser(req, res);
      if (!user) return;
      if (isRateLimited(req, res, "battle_result", { limit: 30, windowMs: 60 * 1000 }, user)) return;

      const body = JSON.parse((await readBody(req)) || "{}");
      if (!validateBattleResultPayload(req, res, body)) return;

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
    logSystemEvent(req, {
      eventName: "api_server_error",
      statusCode: 500,
      message: error.message || "server_error",
      metadata: { pathname },
    });
    sendAdminAlert(
      "api_server_error",
      `Type Fight alert\nAPI ошибка 500\nPath: ${pathname}\nMessage: ${error.message || "server_error"}`
    );
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

    setInterval(cleanupRateLimits, 5 * 60 * 1000).unref();

    server.listen(PORT, "127.0.0.1", () => {
      console.log(`Type Fight API listening on 127.0.0.1:${PORT}`);
      void startTelegramPolling();
      startPushScheduler();
    });
  });
