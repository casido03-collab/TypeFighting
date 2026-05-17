import { createHmac, timingSafeEqual } from "node:crypto";

type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
};

const MAX_INIT_DATA_AGE_SECONDS = 24 * 60 * 60;

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function verifyTelegramInitData(initData: string, botToken: string) {
  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  const authDate = Number(params.get("auth_date") || 0);

  if (!receivedHash || !authDate) {
    return null;
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds - authDate > MAX_INIT_DATA_AGE_SECONDS) {
    return null;
  }

  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculatedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const received = Buffer.from(receivedHash, "hex");
  const calculated = Buffer.from(calculatedHash, "hex");

  if (received.length !== calculated.length || !timingSafeEqual(received, calculated)) {
    return null;
  }

  const rawUser = params.get("user");
  if (!rawUser) {
    return null;
  }

  try {
    return JSON.parse(rawUser) as TelegramUser;
  } catch {
    return null;
  }
}

function createDefaultSession(user: TelegramUser) {
  const displayName =
    user.username || [user.first_name, user.last_name].filter(Boolean).join(" ") || "Player";

  return {
    player: {
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
    },
    energy: {
      value: 50,
      date: new Date().toISOString().slice(0, 10),
    },
    serverTime: new Date().toISOString(),
  };
}

export default async function handler(request: Request) {
  if (request.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return json(503, { error: "telegram_bot_token_not_configured" });
  }

  const initData = request.headers.get("x-telegram-init-data") || "";
  const user = verifyTelegramInitData(initData, botToken);

  if (!user) {
    return json(401, { error: "invalid_telegram_init_data" });
  }

  return json(200, createDefaultSession(user));
}
