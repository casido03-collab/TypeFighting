import { useEffect, useRef, useState } from "react";
import {
  ATTACK_MS,
  HIT_DAMAGE,
  MAX_HP,
  TOTAL_HURT_MS,
} from "../data/gameData";
import { BattleCharacter } from "../components/HeroCharacter";
import { api } from "../lib/api";
import type { BattleStateResponse } from "../lib/apiContracts";
import type { StoredBattleResult } from "../lib/progressStorage";
import { telegram } from "../lib/telegram";
import { styles } from "../styles/styles";

type BattlePageProps = {
  mode?: "ai" | "online" | "friend";
  words: string[];
  maxHp?: number;
  battleId?: string | null;
  onMenu: () => void;
  onBattleComplete?: (result: StoredBattleResult) => void;
};

type AiMood = "confused" | "steady" | "focused" | "aggressive";

const AI_MOOD_LABELS: Record<AiMood, string> = {
  confused: "ошибка",
  steady: "ровно",
  focused: "фокус",
  aggressive: "давит",
};

const AI_MIN_WORD_MS = 980;
const AI_MAX_WORD_MS = 4600;
const AI_HIT_COOLDOWN_MS = 420;
const BATTLE_POLL_MS = 900;
const TYPING_PROGRESS_MS = 120;

function createBattleResultId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `result_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export default function BattlePage({
  mode = "ai",
  words,
  maxHp = MAX_HP,
  battleId,
  onMenu,
  onBattleComplete,
}: BattlePageProps) {
  const [playerHp, setPlayerHp] = useState(maxHp);
  const [enemyHp, setEnemyHp] = useState(maxHp);
  const [combo, setCombo] = useState(0);
  const [playerWordIndex, setPlayerWordIndex] = useState(0);
  const [enemyWordIndex, setEnemyWordIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [action, setAction] = useState("idle");
  const [aiMood, setAiMood] = useState<AiMood>("steady");
  const [aiTypedCount, setAiTypedCount] = useState(0);
  const [serverBattle, setServerBattle] = useState<BattleStateResponse | null>(null);
  const [serverError, setServerError] = useState("");
  const [serverWordsCompleted, setServerWordsCompleted] = useState(0);
  const [isTypingFocused, setIsTypingFocused] = useState(false);

  const resetTimer = useRef<number | null>(null);
  const aiTimer = useRef<number | null>(null);
  const aiTypingTimer = useRef<number | null>(null);
  const typingProgressTimer = useRef<number | null>(null);
  const typingInputRef = useRef<HTMLInputElement | null>(null);
  const lastPlayerHitAt = useRef<number | null>(null);
  const playerWordIntervals = useRef<number[]>([]);
  const aiMoodRef = useRef<AiMood>("steady");
  const playerHitsInRow = useRef(0);
  const botHitsInRow = useRef(0);
  const actionRef = useRef(action);
  const playerHpRef = useRef(playerHp);
  const enemyHpRef = useRef(enemyHp);
  const lastBotHitAt = useRef(0);
  const roundStartedAt = useRef(Date.now());
  const roundLetterTimes = useRef<number[]>([]);
  const calibratedRoundTempo = useRef<number | null>(null);
  const battleStartedAt = useRef(Date.now());
  const resultReported = useRef(false);
  const leaveReported = useRef(false);
  const battleIdRef = useRef<string | null>(battleId || null);
  const isServerBattleRef = useRef(false);
  const gameOverRef = useRef(false);
  const lastServerWordRef = useRef("");

  const isServerBattle = Boolean(battleId && mode !== "ai");
  const currentWord = serverBattle?.player.word || getPlayerWord(words, playerWordIndex);
  const enemyWord = serverBattle?.opponent.word || getMatchingEnemyWord(words, currentWord, enemyWordIndex);
  const displayedPlayerHp = serverBattle?.player.hp ?? playerHp;
  const displayedEnemyHp = serverBattle?.opponent.hp ?? enemyHp;
  const displayedMaxHp = serverBattle?.maxHp ?? maxHp;
  const displayedPlayerTypedCount = serverBattle?.player.typedCount ?? typed.length;
  const displayedEnemyTypedCount = serverBattle?.opponent.typedCount ?? aiTypedCount;
  const serverFinished = serverBattle?.status === "finished" || serverBattle?.status === "cancelled";
  const serverPlayerWon = serverBattle?.status === "finished" && serverBattle.winnerId === serverBattle.player.id;
  const serverStatusText =
    serverBattle?.status === "waiting"
      ? "Ожидаем соперника"
      : serverBattle?.status === "cancelled"
        ? "Бой отменен"
        : serverBattle?.status;
  const gameOver = playerHp <= 0 || enemyHp <= 0 || serverFinished;
  const resultText = serverFinished ? (serverPlayerWon ? "ПОБЕДА" : "ПОРАЖЕНИЕ") : enemyHp <= 0 ? "ПОБЕДА" : playerHp <= 0 ? "ПОРАЖЕНИЕ" : "";

  useEffect(() => {
    battleIdRef.current = battleId || null;
    isServerBattleRef.current = isServerBattle;
    gameOverRef.current = gameOver;
  }, [battleId, gameOver, isServerBattle]);

  useEffect(() => {
    if (!isServerBattle || !serverBattle) return;

    const serverWord = serverBattle.player.word;
    if (!serverWord || lastServerWordRef.current === serverWord) return;

    lastServerWordRef.current = serverWord;
    setTyped("");
  }, [isServerBattle, serverBattle]);

  useEffect(() => {
    actionRef.current = action;
    playerHpRef.current = playerHp;
    enemyHpRef.current = enemyHp;
  }, [action, playerHp, enemyHp]);

  useEffect(() => {
    window.setTimeout(() => {
      try {
        typingInputRef.current?.focus({ preventScroll: true });
      } catch {
        typingInputRef.current?.focus();
      }
      window.scrollTo(0, 0);
    }, 60);
  }, [action]);

  useEffect(() => {
    if (!gameOver || resultReported.current) return;

    resultReported.current = true;
    onBattleComplete?.({
      resultId: createBattleResultId(),
      battleId: battleId || null,
      mode,
      outcome: serverFinished ? (serverPlayerWon ? "win" : "loss") : enemyHp <= 0 ? "win" : "loss",
      combo,
      playerHp: displayedPlayerHp,
      enemyHp: displayedEnemyHp,
      wordsCompleted: isServerBattle ? serverWordsCompleted : playerWordIndex,
      durationMs: Date.now() - battleStartedAt.current,
      finishedAt: new Date().toISOString(),
    });
  }, [
    combo,
    displayedEnemyHp,
    displayedPlayerHp,
    enemyHp,
    gameOver,
    mode,
    onBattleComplete,
    playerWordIndex,
    isServerBattle,
    serverFinished,
    serverPlayerWon,
    serverWordsCompleted,
  ]);

  useEffect(() => {
    if (!isServerBattle || !battleId || gameOver) return;

    if (typingProgressTimer.current) {
      window.clearTimeout(typingProgressTimer.current);
    }

    const typedCount = currentWord.startsWith(typed) ? typed.length : 0;

    typingProgressTimer.current = window.setTimeout(() => {
      void api
        .updateBattleTyping(battleId, typedCount)
        .then((response) => {
          if (response?.state) {
            setServerBattle(response.state);
          }
        })
        .catch(() => null);
    }, TYPING_PROGRESS_MS);

    return () => {
      if (typingProgressTimer.current) {
        window.clearTimeout(typingProgressTimer.current);
      }
    };
  }, [battleId, currentWord, gameOver, isServerBattle, typed]);

  useEffect(() => {
    roundStartedAt.current = Date.now();
    roundLetterTimes.current = [];
    calibratedRoundTempo.current = null;
  }, [currentWord]);

  useEffect(() => {
    if (mode !== "ai" || gameOver || action !== "idle") return;

    const nextMood = pickAiMood(combo);
    setBotMood(nextMood);
    scheduleAiMove(getAiTypingDelay(enemyWord, combo, nextMood));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, enemyWordIndex, enemyWord, action, gameOver]);

  useEffect(() => {
    if (!isServerBattle || !battleId) {
      setServerBattle(null);
      setServerError("");
      return;
    }

    let cancelled = false;
    let pollTimer: number | null = null;

    async function loadBattleState() {
      try {
        const state = await api.getBattleState(battleId);
        if (cancelled || !state) return;

        setServerBattle(state);
        setServerError("");
        setPlayerHp(state.player.hp);
        setEnemyHp(state.opponent.hp);

        if ((state.status === "finished" || state.status === "cancelled") && pollTimer) {
          window.clearInterval(pollTimer);
          pollTimer = null;
        }
      } catch {
        if (!cancelled) {
          setServerError("Сервер боя временно недоступен");
        }
      }
    }

    void loadBattleState();
    pollTimer = window.setInterval(loadBattleState, BATTLE_POLL_MS);

    return () => {
      cancelled = true;
      if (pollTimer) window.clearInterval(pollTimer);
    };
  }, [battleId, isServerBattle]);

  useEffect(() => {
    return () => {
      if (resetTimer.current) window.clearTimeout(resetTimer.current);
      if (aiTimer.current) window.clearTimeout(aiTimer.current);
      if (aiTypingTimer.current) window.clearInterval(aiTypingTimer.current);
      if (typingProgressTimer.current) window.clearTimeout(typingProgressTimer.current);
      reportBattleLeave();
    };
  }, []);

  useEffect(() => {
    function handlePageHide() {
      reportBattleLeave();
    }

    window.addEventListener("pagehide", handlePageHide);
    const cleanupTelegramClose = telegram.onClose(handlePageHide);

    return () => {
      cleanupTelegramClose();
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, []);

  function reportBattleLeave() {
    const currentBattleId = battleIdRef.current;
    if (!isServerBattleRef.current || !currentBattleId || leaveReported.current || gameOverRef.current) return;

    leaveReported.current = true;
    void api.leaveBattle(currentBattleId).catch(() => null);
  }

  function handleMenu() {
    reportBattleLeave();
    onMenu();
  }

  function resetDelayed(ms = TOTAL_HURT_MS) {
    if (resetTimer.current) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setAction("idle"), ms);
  }

  function getPlayerTempo() {
    if (calibratedRoundTempo.current) return calibratedRoundTempo.current;

    if (playerWordIntervals.current.length === 0) return 2200;

    const total = playerWordIntervals.current.reduce((sum, interval) => sum + interval, 0);
    return total / playerWordIntervals.current.length;
  }

  function getAverageWordLength() {
    if (words.length === 0) return 5;

    const total = words.reduce((sum, word) => sum + word.length, 0);
    return total / words.length;
  }

  function getPlayerWpmEstimate() {
    const tempo = getPlayerTempo();
    const averageWordLength = getAverageWordLength();

    return Math.round((60000 / tempo) * (averageWordLength / 5));
  }

  function getAiPressure(currentCombo = 0) {
    const hpGap = playerHp - enemyHp;
    const playerWpm = getPlayerWpmEstimate();
    let pressure = 0;

    if (playerWordIntervals.current.length < 2) return 0;

    if (playerWpm >= 42) pressure += 1;
    if (playerWpm >= 62) pressure += 1;
    if (playerWpm >= 82) pressure += 1;
    if (currentCombo >= 3) pressure += 1;
    if (currentCombo >= 5) pressure += 1;
    if (playerHitsInRow.current >= 3) pressure += 1;
    if (playerHitsInRow.current >= 5) pressure += 1;
    if (hpGap >= HIT_DAMAGE * 2) pressure += 1;
    if (hpGap >= HIT_DAMAGE * 4) pressure += 1;

    return Math.min(6, pressure);
  }

  function rememberPlayerHit() {
    const now = Date.now();

    if (lastPlayerHitAt.current) {
      const interval = now - lastPlayerHitAt.current;
      playerWordIntervals.current = [...playerWordIntervals.current.slice(-4), interval];
    }

    lastPlayerHitAt.current = now;
  }

  function setBotMood(mood: AiMood) {
    aiMoodRef.current = mood;
    setAiMood(mood);
  }

  function pickAiMood(currentCombo = 0) {
    const playerTempo = getPlayerTempo();
    const pressure = getAiPressure(currentCombo);
    const botIsBehind = enemyHp + HIT_DAMAGE < playerHp;
    const playerIsBehind = playerHp + HIT_DAMAGE < enemyHp;
    const playerIsFast = playerTempo < 1900 || currentCombo >= 4;
    const roll = Math.random();

    if (playerWordIntervals.current.length < 2) return roll < 0.22 ? "focused" : "steady";
    if (playerTempo > 3300 || playerHp + HIT_DAMAGE < enemyHp) {
      return roll < 0.42 ? "confused" : "steady";
    }
    if (pressure >= 6) return roll < 0.88 ? "aggressive" : "focused";
    if (pressure >= 4) return roll < 0.72 ? "aggressive" : "focused";
    if (botIsBehind) return roll < 0.78 ? "aggressive" : "focused";
    if (playerIsBehind) return roll < 0.32 ? "confused" : "steady";
    if (playerIsFast) return roll < 0.24 ? "focused" : "aggressive";
    if (roll < 0.1) return "confused";
    if (roll < 0.52) return "focused";
    return "steady";
  }

  function getAiDelay(currentCombo = 0, mood: AiMood = aiMoodRef.current) {
    const playerTempo = getPlayerTempo();
    const pressure = getAiPressure(currentCombo);
    const playerIsSlow = playerWordIntervals.current.length >= 2 && playerTempo > 3000;
    const playerIsLosing = playerHp + HIT_DAMAGE < enemyHp;
    const moodMultiplier = {
      confused: 1.35,
      steady: 1,
      focused: 0.82,
      aggressive: 0.68,
    }[mood];
    const comboPressure = Math.max(0, currentCombo - 2) * 95;
    const pressureBoost = pressure * 115;
    const randomness = 0.9 + Math.random() * 0.22;
    const mercySlowdown = playerIsSlow ? 850 : 0;
    const losingSlowdown = playerIsLosing ? 650 : 0;
    const calibrationSlowdown = playerWordIntervals.current.length < 2 ? 900 : 0;
    const delay =
      playerTempo * moodMultiplier * randomness -
      comboPressure -
      pressureBoost +
      mercySlowdown +
      losingSlowdown +
      calibrationSlowdown;

    const minDelay = playerIsSlow ? 1450 : AI_MIN_WORD_MS;
    return Math.max(minDelay, Math.min(AI_MAX_WORD_MS, delay));
  }

  function getAiTypingDelay(word: string, currentCombo = 0, mood: AiMood = aiMoodRef.current) {
    const estimatedWordDelay = getAiDelay(currentCombo, mood);
    const lengthFactor = Math.max(0.72, Math.min(1.28, word.length / 5));
    const reactionDelay = mood === "aggressive" ? 90 : mood === "focused" ? 140 : 220;

    return Math.max(AI_MIN_WORD_MS, estimatedWordDelay * lengthFactor + reactionDelay);
  }

  function scheduleAiMove(delay = getAiDelay(combo), elapsed = 0) {
    if (aiTimer.current) window.clearTimeout(aiTimer.current);
    if (aiTypingTimer.current) window.clearInterval(aiTypingTimer.current);

    const totalDelay = Math.max(delay + elapsed, 1);
    const stepDelay = Math.max(70, totalDelay / Math.max(1, enemyWord.length));
    let typedLetters = Math.min(enemyWord.length, Math.floor(elapsed / stepDelay));
    setAiTypedCount(typedLetters);

    aiTypingTimer.current = window.setInterval(() => {
      typedLetters += 1;
      setAiTypedCount(Math.min(enemyWord.length, typedLetters));

      if (typedLetters >= enemyWord.length && aiTypingTimer.current) {
        window.clearInterval(aiTypingTimer.current);
        aiTypingTimer.current = null;
      }
    }, stepDelay);

    aiTimer.current = window.setTimeout(() => {
      if (playerHpRef.current <= 0 || enemyHpRef.current <= 0) return;

      const sinceLastBotHit = Date.now() - lastBotHitAt.current;
      if (sinceLastBotHit < AI_HIT_COOLDOWN_MS) {
        scheduleAiMove(AI_HIT_COOLDOWN_MS - sinceLastBotHit);
        return;
      }

      if (actionRef.current !== "idle") {
        scheduleAiMove(120);
        return;
      }

      if (aiMoodRef.current === "confused" && Math.random() < 0.34) {
        setBotMood(pickAiMood(combo));
        scheduleAiMove(900 + Math.random() * 1100);
        return;
      }

      botHit();
    }, delay);
  }

  function restartBattle() {
    if (resetTimer.current) window.clearTimeout(resetTimer.current);
    if (aiTypingTimer.current) window.clearInterval(aiTypingTimer.current);
    aiTypingTimer.current = null;
    setAiTypedCount(0);
    if (aiTimer.current) window.clearTimeout(aiTimer.current);
    battleStartedAt.current = Date.now();
    resultReported.current = false;
    setPlayerHp(maxHp);
    setEnemyHp(maxHp);
    setCombo(0);
    setPlayerWordIndex(0);
    setEnemyWordIndex(0);
    setTyped("");
    setAction("idle");
    setBotMood("steady");
    setAiTypedCount(0);
    lastPlayerHitAt.current = null;
    playerWordIntervals.current = [];
    playerHitsInRow.current = 0;
    botHitsInRow.current = 0;
    lastBotHitAt.current = 0;
  }

  function performHit(nextCombo: number) {
    const damage = HIT_DAMAGE + Math.min(nextCombo * 2, 10);
    setAction("playerAttack");

    if (resetTimer.current) window.clearTimeout(resetTimer.current);

    resetTimer.current = window.setTimeout(() => {
      setAction("enemyFall");
      setEnemyHp((hp) => Math.max(0, hp - damage));
      resetDelayed();
    }, ATTACK_MS);
  }

  function botHit() {
    setAction("enemyAttack");
    setCombo(0);
    setTyped("");
    botHitsInRow.current += 1;
    playerHitsInRow.current = 0;
    lastBotHitAt.current = Date.now();

    if (resetTimer.current) window.clearTimeout(resetTimer.current);
    if (aiTimer.current) window.clearTimeout(aiTimer.current);
    if (aiTypingTimer.current) window.clearInterval(aiTypingTimer.current);
    aiTypingTimer.current = null;
    setAiTypedCount(enemyWord.length);

    resetTimer.current = window.setTimeout(() => {
      setAction("playerFall");
      const moodDamage = aiMoodRef.current === "aggressive" ? HIT_DAMAGE + 3 : HIT_DAMAGE;
      setPlayerHp((hp) => Math.max(0, hp - moodDamage));
      setEnemyWordIndex((index) => index + 1);
      resetDelayed();
    }, ATTACK_MS);
  }

  function calibrateRoundTyping(clean: string) {
    if (calibratedRoundTempo.current || clean.length === 0 || clean.length > 2) return;

    const now = Date.now();
    while (roundLetterTimes.current.length < clean.length && roundLetterTimes.current.length < 2) {
      roundLetterTimes.current.push(now);
    }

    if (roundLetterTimes.current.length < 2) return;

    const firstToSecondMs = roundLetterTimes.current[1] - roundLetterTimes.current[0];
    const averageLetterMs = Math.max(120, firstToSecondMs);
    const estimatedWordMs = Math.max(900, Math.min(5200, averageLetterMs * currentWord.length + 320));
    calibratedRoundTempo.current = estimatedWordMs;

    if (mode !== "ai" || actionRef.current !== "idle" || gameOver) return;

    const nextMood = pickAiMood(combo);
    const targetDelay = getAiTypingDelay(enemyWord, combo, nextMood);
    const elapsed = Date.now() - roundStartedAt.current;

    setBotMood(nextMood);
    scheduleAiMove(Math.max(260, targetDelay - elapsed), elapsed);
  }

  function handleTyping(value: string) {
    if (gameOver) return;

    const clean = value.trim().toLowerCase();

    if (actionRef.current !== "idle") {
      if (clean !== typed) {
        setTyped(typed);
      }
      return;
    }

    setTyped(clean);

    if (!currentWord.startsWith(clean)) {
      setCombo(0);
      setAction("wrong");
      resetDelayed(350);
      return;
    }

    calibrateRoundTyping(clean);

    if (clean === currentWord) {
      if (isServerBattle && battleId) {
        void submitServerWord(clean);
        return;
      }

      const nextCombo = combo + 1;
      rememberPlayerHit();
      playerHitsInRow.current += 1;
      botHitsInRow.current = 0;
      setCombo(nextCombo);
      setTyped("");
      setPlayerWordIndex((index) => index + 1);
      performHit(nextCombo);
    }
  }

  async function submitServerWord(word: string) {
    try {
      const previousEnemyHp = displayedEnemyHp;
      const result = await api.submitBattleWord(battleId!, word, serverBattle?.round);

      if (result?.state) {
        setServerBattle(result.state);
        setPlayerHp(result.state.player.hp);
        setEnemyHp(result.state.opponent.hp);
      }

      if (!result?.accepted) {
        setCombo(0);
        setTyped("");
        if (result?.rejectionReason === "stale_round" || result?.rejectionReason === "battle_finished") {
          setServerError("");
          return;
        }
        setAction("wrong");
        setServerError(result?.message || "Сервер отклонил слово. Попробуй еще раз.");
        resetDelayed(350);
        return;
      }

      setServerWordsCompleted((completed) => completed + 1);
      setCombo((currentCombo) =>
        typeof result.combo === "number" ? result.combo : currentCombo + 1
      );
      setTyped("");
      setServerError("");
      telegram.impact("medium");

      const nextEnemyHp = result.state?.opponent.hp ?? previousEnemyHp;
      if (nextEnemyHp < previousEnemyHp || result.outcome === "hit" || result.outcome === "finished") {
        setAction("playerAttack");
        resetDelayed(ATTACK_MS);
      }
    } catch {
      setServerError("Слово не отправлено. Попробуй еще раз.");
      setTyped("");
    }
  }

  return (
    <div
      className={`tk-battle-layout${isTypingFocused ? " tk-battle-keyboard-open" : ""}`}
      style={styles.battleLayout}
    >
      <BattleHeader onMenu={handleMenu} combo={combo} mode={mode} />

      <BattleArena
        playerHp={displayedPlayerHp}
        enemyHp={displayedEnemyHp}
        combo={combo}
        currentWord={currentWord}
        enemyWord={enemyWord}
        typed={typed}
        playerTypedCount={displayedPlayerTypedCount}
        aiTypedCount={displayedEnemyTypedCount}
        action={action}
        maxHp={displayedMaxHp}
        gameOver={gameOver}
        resultText={resultText}
        aiMood={aiMood}
        serverStatus={serverStatusText}
        serverError={serverError}
        onRestart={restartBattle}
        onMenu={handleMenu}
        canRestart={!isServerBattle}
      />

      <TypingDock
        currentWord={currentWord}
        typed={typed}
        action={action}
        gameOver={gameOver}
        onType={handleTyping}
        inputRef={typingInputRef}
        onFocus={() => setIsTypingFocused(true)}
        onBlur={() => setIsTypingFocused(false)}
      />

      <KeyboardMock />
    </div>
  );
}

function getMatchingEnemyWord(words: string[], currentWord: string, wordIndex: number) {
  const sameLengthWords = words.filter(
    (word) => word.length === currentWord.length && word !== currentWord
  );

  if (sameLengthWords.length === 0) return currentWord;

  return sameLengthWords[(wordIndex + 3) % sameLengthWords.length];
}

function getPlayerWord(words: string[], wordIndex: number) {
  if (words.length === 0) return "молния";

  if (wordIndex === 0) {
    return words.find((word) => word.length >= 5) || words[0] || "молния";
  }

  return words[wordIndex % words.length] || "молния";
}

function BattleHeader({ onMenu, combo, mode }: { onMenu: () => void; combo: number; mode: string }) {
  return (
    <header style={styles.battleHeader}>
      <button style={styles.backButton} type="button" onClick={onMenu}>←</button>
      <div style={styles.battleHeaderCenter}>
        <div style={styles.battleTitle}>YOU <span>VS</span> {mode === "ai" ? "BOT" : "PLAYER"}</div>
        <div style={styles.comboMini}>COMBO x{combo}</div>
      </div>
      <div style={styles.timer}>1:25</div>
    </header>
  );
}

function BattleArena({
  playerHp,
  enemyHp,
  combo,
  currentWord,
  enemyWord,
  typed,
  playerTypedCount,
  aiTypedCount,
  action,
  maxHp,
  gameOver,
  resultText,
  aiMood,
  serverStatus,
  serverError,
  onRestart,
  onMenu,
  canRestart,
}: {
  playerHp: number;
  enemyHp: number;
  combo: number;
  currentWord: string;
  enemyWord: string;
  typed: string;
  playerTypedCount: number;
  aiTypedCount: number;
  action: string;
  maxHp: number;
  gameOver: boolean;
  resultText: string;
  aiMood: AiMood;
  serverStatus?: string;
  serverError?: string;
  onRestart: () => void;
  onMenu: () => void;
  canRestart: boolean;
}) {
  const playerAction =
    action === "playerAttack" ? styles.stickmanPlayerAttack : action === "playerFall" ? styles.stickmanPlayerFall : {};
  const enemyAction =
    action === "enemyAttack" ? styles.stickmanEnemyAttack : action === "enemyFall" ? styles.stickmanEnemyFall : {};

  return (
    <section style={styles.battleCard}>
      <ArenaBackground />

      <div style={styles.hudRow}>
        <HpSide name="YOU" hp={`${playerHp}/${maxHp}`} side="player" percent={playerHp / maxHp} />
        <div style={styles.versus}>VS</div>
        <HpSide name="BOT" hp={`${enemyHp}/${maxHp}`} side="enemy" percent={enemyHp / maxHp} />
      </div>

      <div style={styles.aiMoodTag}>{serverStatus || AI_MOOD_LABELS[aiMood]}</div>

      <div style={styles.arenaGround} />
      <Stickman side="player" actionStyle={playerAction} />
      <Stickman side="enemy" actionStyle={enemyAction} />
      <TypingProgress word={currentWord} typedCount={playerTypedCount} side="player" />
      <TypingProgress word={enemyWord} typedCount={aiTypedCount} side="enemy" />

      {serverError && <div style={styles.battleServerStatus}>{serverError}</div>}

      <div style={{ ...styles.slashFlash, opacity: action === "idle" ? 0.2 : 1 }}>
        {action === "wrong" ? "✖" : "⚔"}
      </div>

      {gameOver && (
        <div style={styles.resultOverlay}>
          <div>
            <div style={styles.resultTitle}>{resultText}</div>
            <div style={styles.resultText}>Комбо: x{combo}</div>
            <button style={styles.resultButton} type="button" onClick={canRestart ? onRestart : onMenu}>
              {canRestart ? "Играть еще" : "В меню"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function TypingProgress({
  word,
  typedCount,
  side,
}: {
  word: string;
  typedCount: number;
  side: "player" | "enemy";
}) {
  return (
    <div
      style={{
        ...styles.fighterTypingProgress,
        ...(side === "enemy" ? styles.fighterTypingProgressEnemy : styles.fighterTypingProgressPlayer),
      }}
    >
      {word.split("").map((letter, index) => (
        <span
          key={`${letter}-${index}`}
          style={{
            ...styles.fighterLetter,
            ...(index < typedCount ? styles.fighterLetterFilled : {}),
          }}
        >
          {letter}
        </span>
      ))}
    </div>
  );
}

function ArenaBackground() {
  return (
    <div style={styles.arenaBg} aria-hidden="true">
      <div style={styles.arenaSun} />
      <div style={{ ...styles.arenaCloud, left: 24, top: 42, width: 82 }} />
      <div style={{ ...styles.arenaCloud, right: 30, top: 68, width: 104 }} />
      <div style={{ ...styles.arenaMountain, ...styles.arenaMountainLeft }} />
      <div style={{ ...styles.arenaMountain, ...styles.arenaMountainRight }} />
    </div>
  );
}

function HpSide({ name, hp, side, percent }: { name: string; hp: string; side: "player" | "enemy"; percent: number }) {
  const isEnemy = side === "enemy";
  const fillWidth = `${Math.max(0, Math.min(1, percent)) * 100}%`;

  return (
    <div style={{ ...styles.hpSide, ...(isEnemy ? styles.hpSideEnemy : {}) }}>
      <div style={styles.hpName}>{name}</div>
      <div style={styles.hpBar}>
        <div style={{ ...styles.hpFill, ...(isEnemy ? styles.enemyFill : styles.playerFill), width: fillWidth }} />
      </div>
      <div style={styles.hpText}>{hp}</div>
    </div>
  );
}

function Stickman({ side, actionStyle = {} }: { side: "player" | "enemy"; actionStyle?: React.CSSProperties }) {
  const isEnemy = side === "enemy";
  const isAttacking = actionStyle === styles.stickmanPlayerAttack || actionStyle === styles.stickmanEnemyAttack;

  return (
    <div style={{ ...styles.stickman, ...(isEnemy ? styles.stickmanEnemy : styles.stickmanPlayer), ...actionStyle }}>
      <BattleCharacter enemy={isEnemy} />
      {isAttacking && <div style={styles.attackTrail} />}
    </div>
  );
}

function TypingDock({
  currentWord,
  typed,
  action,
  gameOver,
  onType,
  inputRef,
  onFocus,
  onBlur,
}: {
  currentWord: string;
  typed: string;
  action: string;
  gameOver: boolean;
  onType: (value: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const disabled = gameOver;

  function focusInput() {
    if (disabled) return;

    try {
      inputRef.current?.focus({ preventScroll: true });
    } catch {
      inputRef.current?.focus();
    }
  }

  return (
    <section className="tk-typing-dock" style={styles.typingDock} onClick={focusInput}>
      <div style={styles.typingWord}>{currentWord}</div>
      <input
        ref={inputRef}
        className="tk-native-input-proxy"
        style={styles.nativeInputProxy}
        value={typed}
        onChange={(event) => onType(event.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        disabled={disabled}
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        inputMode="text"
        enterKeyHint="go"
        spellCheck={false}
      />
      <button
        className="tk-visible-typebox"
        style={{ ...styles.realInput, ...(action === "wrong" ? styles.realInputWrong : {}) }}
        type="button"
        disabled={disabled}
        onClick={focusInput}
      >
        {typed || "печатай..."}
      </button>
    </section>
  );
}

function KeyboardMock() {
  const rowOne = ["й", "ц", "у", "к", "е", "н", "г", "ш", "щ"];
  const rowTwo = ["ф", "ы", "в", "а", "п", "р", "о", "л"];

  return (
    <div className="tk-keyboard-mock" style={styles.keyboardMock}>
      <div style={styles.keyboardHandle} />
      <div style={styles.keyboardText}>место под клавиатуру телефона</div>
      <div style={styles.keyboardRows}>
        <div style={styles.keyboardRow}>{rowOne.map((key) => <span key={key} style={styles.key}>{key}</span>)}</div>
        <div style={styles.keyboardRow}>{rowTwo.map((key) => <span key={key} style={styles.key}>{key}</span>)}</div>
        <div style={styles.spaceKey}>пробел</div>
      </div>
    </div>
  );
}
