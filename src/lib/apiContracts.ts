import type { PlayerProfile } from "./playerProfile";
import type { StoredBattleResult, StoredEnergy, StoredSettings } from "./progressStorage";

export type LeaderboardEntry = {
  rank: number;
  name: string;
  league: string;
  wpm: number;
  wins: string;
  streak: number;
  color: string;
  me?: boolean;
};

export type TelegramSessionResponse = {
  player: PlayerProfile;
  energy: StoredEnergy;
  settings?: StoredSettings;
  serverTime: string;
};

export type PlayerStateResponse = {
  player: PlayerProfile;
  energy: StoredEnergy;
};

export type LeaderboardResponse = {
  period: "today" | "week";
  leaders: LeaderboardEntry[];
  playerRank: number;
};

export type DuelInviteResponse = {
  duelId: string;
  startParam: string;
  expiresAt?: string;
};

export type JoinDuelResponse = {
  status: "joined" | "expired" | "not_found" | "full";
  battleId?: string;
  opponent?: {
    id: string;
    name: string;
    league: string;
    wpm?: number;
  };
  message?: string;
};

export type ReferralResponse = {
  accepted: boolean;
  invitedBy?: string;
  message?: string;
};

export type MatchmakingOpponent = {
  id: string;
  name: string;
  league: string;
  wpm?: number;
};

export type MatchmakingResponse =
  | {
      status: "matched";
      battleId: string;
      opponent?: MatchmakingOpponent;
      message?: string;
    }
  | {
      status: "queued";
      estimatedWaitMs?: number;
      message?: string;
    }
  | {
      status: "unavailable";
      message?: string;
    };

export type BattlePlayerState = {
  id: string;
  name: string;
  hp: number;
  word: string;
  typedCount: number;
};

export type BattleStateResponse = {
  battleId: string;
  status: "waiting" | "active" | "finished" | "cancelled";
  maxHp: number;
  round: number;
  wordLength: number;
  availableLetters?: string[];
  player: BattlePlayerState;
  opponent: BattlePlayerState;
  serverTime: string;
  winnerId?: string;
};

export type SubmitBattleWordResponse = {
  accepted: boolean;
  state: BattleStateResponse;
  damage?: number;
  combo?: number;
  outcome?: "hit" | "rejected" | "finished";
  rejectionReason?: "wrong_word" | "too_fast" | "stale_round" | "battle_finished";
  nextWord?: string;
  message?: string;
};

export type BattleTypingProgressResponse = {
  accepted: boolean;
  state?: BattleStateResponse;
};

export type BattleResultResponse = {
  accepted: boolean;
  player: PlayerProfile;
  energy: StoredEnergy;
  energySpent?: number;
};

export type BattleResultPayload = StoredBattleResult;
