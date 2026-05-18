export type StoredLanguage = "RU" | "EN";

export type StoredSettings = {
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  language: StoredLanguage;
};

export type StoredEnergy = {
  value: number;
  date: string;
};

export type BattleOutcome = "win" | "loss";

export type StoredBattleResult = {
  resultId: string;
  battleId?: string | null;
  mode: "ai" | "online" | "friend";
  outcome: BattleOutcome;
  combo: number;
  playerHp: number;
  enemyHp: number;
  wordsCompleted: number;
  durationMs: number;
  finishedAt: string;
};

const ENERGY_KEY = "typing-kombat-energy";
const ENERGY_DATE_KEY = "typing-kombat-energy-date";
const SOUND_KEY = "typing-kombat-sound";
const VIBRATION_KEY = "typing-kombat-vibration";
const LANGUAGE_KEY = "typing-kombat-language";
const BATTLE_HISTORY_KEY = "typing-kombat-battle-history";
const PENDING_BATTLE_RESULTS_KEY = "typing-kombat-pending-battle-results";

const memoryStorage = new Map<string, string>();

function readValue(key: string) {
  try {
    return window.localStorage.getItem(key) ?? memoryStorage.get(key) ?? null;
  } catch {
    return memoryStorage.get(key) ?? null;
  }
}

function writeValue(key: string, value: string) {
  memoryStorage.set(key, value);

  try {
    window.localStorage.setItem(key, value);
  } catch {
    // LocalStorage may be unavailable in private mode or embedded previews.
  }
}

function removeValue(key: string) {
  memoryStorage.delete(key);

  try {
    window.localStorage.removeItem(key);
  } catch {
    // LocalStorage may be unavailable in private mode or embedded previews.
  }
}

export function getTodayKey() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function readStoredNumber(key: string, fallback: number) {
  const value = readValue(key);
  if (!value) return fallback;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function isBattleResult(value: unknown): value is StoredBattleResult {
  if (!value || typeof value !== "object") return false;

  const result = value as Partial<StoredBattleResult>;

  return (
    (result.mode === "ai" || result.mode === "online" || result.mode === "friend") &&
    typeof result.resultId === "string" &&
    (result.battleId === undefined || result.battleId === null || typeof result.battleId === "string") &&
    (result.outcome === "win" || result.outcome === "loss") &&
    typeof result.combo === "number" &&
    typeof result.playerHp === "number" &&
    typeof result.enemyHp === "number" &&
    typeof result.wordsCompleted === "number" &&
    typeof result.durationMs === "number" &&
    typeof result.finishedAt === "string"
  );
}

function parseBattleResults(value: string | null) {
  if (!value) return [];

  try {
    const results = JSON.parse(value);
    return Array.isArray(results) ? results.filter(isBattleResult) : [];
  } catch {
    return [];
  }
}

export function loadEnergy(maxEnergy: number): StoredEnergy {
  const today = getTodayKey();
  const storedDate = readValue(ENERGY_DATE_KEY);

  if (storedDate !== today) {
    saveEnergy({ value: maxEnergy, date: today });
    return { value: maxEnergy, date: today };
  }

  return {
    value: Math.min(maxEnergy, Math.max(0, readStoredNumber(ENERGY_KEY, maxEnergy))),
    date: today,
  };
}

export function saveEnergy(energy: StoredEnergy) {
  writeValue(ENERGY_KEY, String(energy.value));
  writeValue(ENERGY_DATE_KEY, energy.date);
}

export function loadSettings(): StoredSettings {
  return {
    soundEnabled: readValue(SOUND_KEY) !== "off",
    vibrationEnabled: readValue(VIBRATION_KEY) !== "off",
    language: readValue(LANGUAGE_KEY) === "EN" ? "EN" : "RU",
  };
}

export function saveSettings(settings: StoredSettings) {
  writeValue(SOUND_KEY, settings.soundEnabled ? "on" : "off");
  writeValue(VIBRATION_KEY, settings.vibrationEnabled ? "on" : "off");
  writeValue(LANGUAGE_KEY, settings.language);
}

export function loadBattleHistory(): StoredBattleResult[] {
  return parseBattleResults(readValue(BATTLE_HISTORY_KEY));
}

export function saveBattleResult(result: StoredBattleResult) {
  const nextHistory = [result, ...loadBattleHistory()].slice(0, 50);
  writeValue(BATTLE_HISTORY_KEY, JSON.stringify(nextHistory));
}

export function loadPendingBattleResults(): StoredBattleResult[] {
  return parseBattleResults(readValue(PENDING_BATTLE_RESULTS_KEY));
}

export function savePendingBattleResult(result: StoredBattleResult) {
  const nextResults = [...loadPendingBattleResults(), result].slice(-25);
  writeValue(PENDING_BATTLE_RESULTS_KEY, JSON.stringify(nextResults));
}

export function clearPendingBattleResults() {
  removeValue(PENDING_BATTLE_RESULTS_KEY);
}
