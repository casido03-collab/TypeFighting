import { appConfig } from "../config/appConfig";
import type {
  BattleResultPayload,
  BattleResultResponse,
  BattleStateResponse,
  BattleTypingProgressResponse,
  DuelInviteResponse,
  JoinDuelResponse,
  LeaderboardResponse,
  MatchmakingResponse,
  PlayerStateResponse,
  ReferralResponse,
  SubmitBattleWordResponse,
  TelegramSessionResponse,
} from "./apiContracts";
import { telegram } from "./telegram";

type ApiRequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  timeoutMs?: number;
  keepalive?: boolean;
};

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string) {
    super(`API request failed: ${status} ${code}`);
    this.status = status;
    this.code = code;
  }
}

const BATTLE_STATUSES = new Set(["waiting", "active", "finished", "cancelled"]);
const DUEL_JOIN_STATUSES = new Set(["waiting", "joined", "expired", "not_found", "full"]);
const MATCHMAKING_STATUSES = new Set(["matched", "queued", "unavailable"]);
const LEADERBOARD_PERIODS = new Set(["today", "week"]);

function createLocalDuelInvite(): DuelInviteResponse {
  const duelId = `duel_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  return {
    duelId,
    startParam: duelId,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function assertBattleState(value: unknown): BattleStateResponse {
  if (!isRecord(value) || !isRecord(value.player) || !isRecord(value.opponent)) {
    throw new Error("Invalid battle state response");
  }

  const playerWord = value.player.word;
  const opponentWord = value.opponent.word;
  const wordLength = value.wordLength;

  if (
    typeof value.battleId !== "string" ||
    !BATTLE_STATUSES.has(String(value.status)) ||
    typeof value.maxHp !== "number" ||
    typeof value.round !== "number" ||
    typeof wordLength !== "number" ||
    typeof value.serverTime !== "string" ||
    typeof value.player.id !== "string" ||
    typeof value.player.name !== "string" ||
    typeof value.player.hp !== "number" ||
    typeof playerWord !== "string" ||
    typeof value.player.typedCount !== "number" ||
    typeof value.opponent.id !== "string" ||
    typeof value.opponent.name !== "string" ||
    typeof value.opponent.hp !== "number" ||
    typeof opponentWord !== "string" ||
    typeof value.opponent.typedCount !== "number" ||
    playerWord.length !== opponentWord.length ||
    playerWord.length !== wordLength
  ) {
    throw new Error("Invalid battle state response");
  }

  return value as BattleStateResponse;
}

function assertPlayer(value: unknown) {
  if (!isRecord(value)) {
    throw new Error("Invalid player response");
  }

  const requiredStrings = ["name", "league", "leagueCode", "nextLeague", "winRate"];
  const requiredNumbers = [
    "rank",
    "score",
    "nextScore",
    "wins",
    "losses",
    "bestCombo",
    "wpm",
    "streak",
    "invited",
  ];

  if (
    !requiredStrings.every((key) => typeof value[key] === "string") ||
    !requiredNumbers.every((key) => typeof value[key] === "number")
  ) {
    throw new Error("Invalid player response");
  }
}

function assertEnergy(value: unknown) {
  if (!isRecord(value) || typeof value.value !== "number" || typeof value.date !== "string") {
    throw new Error("Invalid energy response");
  }
}

function assertLeaderboardEntry(value: unknown) {
  if (
    !isRecord(value) ||
    typeof value.rank !== "number" ||
    typeof value.name !== "string" ||
    typeof value.league !== "string" ||
    typeof value.wpm !== "number" ||
    typeof value.wins !== "string" ||
    typeof value.streak !== "number" ||
    typeof value.color !== "string"
  ) {
    throw new Error("Invalid leaderboard response");
  }
}

function assertSession(value: unknown): TelegramSessionResponse {
  if (!isRecord(value)) {
    throw new Error("Invalid session response");
  }

  assertPlayer(value.player);
  assertEnergy(value.energy);

  if (typeof value.serverTime !== "string") {
    throw new Error("Invalid session response");
  }

  return value as TelegramSessionResponse;
}

function assertPlayerState(value: unknown): PlayerStateResponse {
  if (!isRecord(value)) {
    throw new Error("Invalid player state response");
  }

  assertPlayer(value.player);
  assertEnergy(value.energy);

  return value as PlayerStateResponse;
}

function assertLeaderboard(value: unknown): LeaderboardResponse {
  if (
    !isRecord(value) ||
    !LEADERBOARD_PERIODS.has(String(value.period)) ||
    !Array.isArray(value.leaders) ||
    typeof value.playerRank !== "number"
  ) {
    throw new Error("Invalid leaderboard response");
  }

  value.leaders.forEach(assertLeaderboardEntry);

  return value as LeaderboardResponse;
}

function assertBattleResult(value: unknown): BattleResultResponse {
  if (!isRecord(value) || typeof value.accepted !== "boolean") {
    throw new Error("Invalid battle result response");
  }

  assertPlayer(value.player);
  assertEnergy(value.energy);

  if (value.energySpent !== undefined && typeof value.energySpent !== "number") {
    throw new Error("Invalid battle result response");
  }

  return value as BattleResultResponse;
}

function assertJoinDuel(value: unknown): JoinDuelResponse {
  if (!isRecord(value) || !DUEL_JOIN_STATUSES.has(String(value.status))) {
    throw new Error("Invalid duel join response");
  }

  if (value.status === "joined" && typeof value.battleId !== "string") {
    throw new Error("Invalid duel join response");
  }

  return value as JoinDuelResponse;
}

function assertMatchmaking(value: unknown): MatchmakingResponse {
  if (!isRecord(value) || !MATCHMAKING_STATUSES.has(String(value.status))) {
    throw new Error("Invalid matchmaking response");
  }

  if (value.status === "matched" && typeof value.battleId !== "string") {
    throw new Error("Invalid matchmaking response");
  }

  return value as MatchmakingResponse;
}

function canUseApi() {
  return Boolean(appConfig.apiBaseUrl && (telegram.initData || appConfig.allowBrowserApiMock));
}

async function request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  if (!appConfig.apiBaseUrl) {
    throw new Error("API base URL is not configured");
  }

  const controller = options.timeoutMs ? new AbortController() : null;
  const timeoutId = options.timeoutMs
    ? window.setTimeout(() => controller?.abort(), options.timeoutMs)
    : null;

  let response: Response;

  try {
    response = await fetch(`${appConfig.apiBaseUrl}${path}`, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Telegram-Init-Data": telegram.initData,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller?.signal,
      keepalive: options.keepalive,
    });
  } finally {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
  }

  if (!response.ok) {
    let code = "request_failed";

    try {
      const errorBody = (await response.json()) as unknown;
      if (isRecord(errorBody) && typeof errorBody.error === "string") {
        code = errorBody.error;
      }
    } catch {
      code = response.statusText || code;
    }

    throw new ApiError(response.status, code);
  }

  return response.json() as Promise<T>;
}

export const api = {
  get isConfigured() {
    return canUseApi();
  },

  async createDuelInvite(): Promise<DuelInviteResponse> {
    if (!canUseApi()) {
      return createLocalDuelInvite();
    }

    return request<DuelInviteResponse>("/duels", { method: "POST" });
  },

  async joinDuel(duelId: string): Promise<JoinDuelResponse | null> {
    if (!canUseApi()) {
      return null;
    }

    return assertJoinDuel(
      await request<unknown>(`/duels/${encodeURIComponent(duelId)}/join`, {
        method: "POST",
      })
    );
  },

  async getDuelStatus(duelId: string): Promise<JoinDuelResponse | null> {
    if (!canUseApi()) {
      return null;
    }

    return assertJoinDuel(await request<unknown>(`/duels/${encodeURIComponent(duelId)}`));
  },

  async applyReferral(referralCode: string): Promise<ReferralResponse | null> {
    if (!canUseApi()) {
      return null;
    }

    return request<ReferralResponse>("/referrals", {
      method: "POST",
      body: { referralCode },
    });
  },

  async syncSession(): Promise<TelegramSessionResponse | null> {
    if (!canUseApi()) {
      return null;
    }

    return assertSession(await request<unknown>("/telegram/session", { method: "POST" }));
  },

  async getPlayerState(): Promise<PlayerStateResponse | null> {
    if (!canUseApi()) {
      return null;
    }

    return assertPlayerState(await request<unknown>("/player"));
  },

  async getLeaderboard(period: "today" | "week"): Promise<LeaderboardResponse | null> {
    if (!canUseApi()) {
      return null;
    }

    return assertLeaderboard(await request<unknown>(`/leaderboard?period=${period}`));
  },

  async findOpponent(): Promise<MatchmakingResponse | null> {
    if (!canUseApi()) {
      return null;
    }

    return assertMatchmaking(
      await request<unknown>("/matchmaking", { method: "POST", timeoutMs: 22000 })
    );
  },

  async recordBattleResult(result: BattleResultPayload): Promise<BattleResultResponse | null> {
    if (!canUseApi()) {
      return null;
    }

    return assertBattleResult(
      await request<unknown>("/battles", { method: "POST", body: result })
    );
  },

  async getBattleState(battleId: string): Promise<BattleStateResponse | null> {
    if (!canUseApi()) {
      return null;
    }

    return assertBattleState(await request<unknown>(`/battles/${encodeURIComponent(battleId)}`));
  },

  async submitBattleWord(
    battleId: string,
    word: string,
    round?: number
  ): Promise<SubmitBattleWordResponse | null> {
    if (!canUseApi()) {
      return null;
    }

    const result = await request<SubmitBattleWordResponse>(
      `/battles/${encodeURIComponent(battleId)}/words`,
      {
        method: "POST",
        body: { word, round },
      }
    );

    assertBattleState(result.state);
    return result;
  },

  async updateBattleTyping(
    battleId: string,
    typedCount: number
  ): Promise<BattleTypingProgressResponse | null> {
    if (!canUseApi()) {
      return null;
    }

    const result = await request<BattleTypingProgressResponse>(
      `/battles/${encodeURIComponent(battleId)}/typing`,
      {
        method: "POST",
        body: { typedCount },
      }
    );

    if (result.state) {
      assertBattleState(result.state);
    }

    return result;
  },

  async leaveBattle(battleId: string) {
    if (!canUseApi()) {
      return null;
    }

    return request(`/battles/${encodeURIComponent(battleId)}/leave`, {
      method: "POST",
      keepalive: true,
    });
  },
};
