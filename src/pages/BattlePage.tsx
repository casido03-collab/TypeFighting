import { useEffect, useRef, useState } from "react";
import {
  ATTACK_MS,
  HIT_DAMAGE,
  MAX_HP,
  TOTAL_HURT_MS,
} from "../data/gameData";
import { BattleCharacter } from "../components/HeroCharacter";
import { styles } from "../styles/styles";

type BattlePageProps = {
  mode?: "ai" | "online" | "friend";
  words: string[];
  maxHp?: number;
  onMenu: () => void;
};

export default function BattlePage({ mode = "ai", words, maxHp = MAX_HP, onMenu }: BattlePageProps) {
  const [playerHp, setPlayerHp] = useState(maxHp);
  const [enemyHp, setEnemyHp] = useState(maxHp);
  const [combo, setCombo] = useState(0);
  const [wordIndex, setWordIndex] = useState(0);
  const [typed, setTyped] = useState("");
  const [action, setAction] = useState("idle");

  const resetTimer = useRef<number | null>(null);
  const aiTimer = useRef<number | null>(null);
  const typingInputRef = useRef<HTMLInputElement | null>(null);

  const currentWord = words[wordIndex % words.length] || "молния";
  const enemyWord = words[(wordIndex + 3) % words.length] || "щит";
  const gameOver = playerHp <= 0 || enemyHp <= 0;
  const resultText = enemyHp <= 0 ? "ПОБЕДА" : playerHp <= 0 ? "ПОРАЖЕНИЕ" : "";

  useEffect(() => {
    window.setTimeout(() => typingInputRef.current?.focus(), 60);
  }, [action]);

  useEffect(() => {
    if (mode === "ai") {
      scheduleAiMove(900);
    }

    return () => {
      if (resetTimer.current) window.clearTimeout(resetTimer.current);
      if (aiTimer.current) window.clearTimeout(aiTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetDelayed(ms = TOTAL_HURT_MS) {
    if (resetTimer.current) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setAction("idle"), ms);
  }

  function getAiDelay(currentCombo = 0) {
    const base = 2800 + Math.random() * 1800;
    const pressure = Math.max(0, currentCombo - 2) * 220;
    const mistakePause = Math.random() < 0.22 ? 900 + Math.random() * 900 : 0;
    return base + pressure + mistakePause;
  }

  function scheduleAiMove(delay = getAiDelay(combo)) {
    if (aiTimer.current) window.clearTimeout(aiTimer.current);
    aiTimer.current = window.setTimeout(() => {
      if (action !== "idle" || playerHp <= 0 || enemyHp <= 0) return;
      botHit();
    }, delay);
  }

  function restartBattle() {
    if (resetTimer.current) window.clearTimeout(resetTimer.current);
    if (aiTimer.current) window.clearTimeout(aiTimer.current);
    setPlayerHp(maxHp);
    setEnemyHp(maxHp);
    setCombo(0);
    setWordIndex(0);
    setTyped("");
    setAction("idle");
    if (mode === "ai") scheduleAiMove(900);
  }

  function performHit(nextCombo: number) {
    const damage = HIT_DAMAGE + Math.min(nextCombo * 2, 10);
    setAction("playerAttack");

    if (resetTimer.current) window.clearTimeout(resetTimer.current);
    if (aiTimer.current) window.clearTimeout(aiTimer.current);

    resetTimer.current = window.setTimeout(() => {
      setAction("enemyFall");
      setEnemyHp((hp) => Math.max(0, hp - damage));
      resetDelayed();
      if (mode === "ai") scheduleAiMove(getAiDelay(nextCombo));
    }, ATTACK_MS);
  }

  function botHit() {
    setAction("enemyAttack");
    setCombo(0);

    if (resetTimer.current) window.clearTimeout(resetTimer.current);
    if (aiTimer.current) window.clearTimeout(aiTimer.current);

    resetTimer.current = window.setTimeout(() => {
      setAction("playerFall");
      setPlayerHp((hp) => Math.max(0, hp - HIT_DAMAGE));
      resetDelayed();
      if (mode === "ai") scheduleAiMove(getAiDelay(0) + 600);
    }, ATTACK_MS);
  }

  function handleTyping(value: string) {
    const clean = value.trim().toLowerCase();
    setTyped(clean);

    if (!currentWord.startsWith(clean)) {
      setCombo(0);
      setAction("wrong");
      resetDelayed(350);
      return;
    }

    if (clean === currentWord) {
      const nextCombo = combo + 1;
      setCombo(nextCombo);
      setTyped("");
      setWordIndex((index) => index + 1);
      performHit(nextCombo);
    }
  }

  return (
    <div style={styles.battleLayout}>
      <BattleHeader onMenu={onMenu} combo={combo} mode={mode} />

      <BattleArena
        playerHp={playerHp}
        enemyHp={enemyHp}
        combo={combo}
        currentWord={currentWord}
        enemyWord={enemyWord}
        action={action}
        maxHp={maxHp}
        gameOver={gameOver}
        resultText={resultText}
        onRestart={restartBattle}
      />

      <TypingDock
        currentWord={currentWord}
        typed={typed}
        action={action}
        gameOver={gameOver}
        onType={handleTyping}
        onBotHit={botHit}
        inputRef={typingInputRef}
      />

      <KeyboardMock />
    </div>
  );
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
  action,
  maxHp,
  gameOver,
  resultText,
  onRestart,
}: {
  playerHp: number;
  enemyHp: number;
  combo: number;
  currentWord: string;
  enemyWord: string;
  action: string;
  maxHp: number;
  gameOver: boolean;
  resultText: string;
  onRestart: () => void;
}) {
  const playerAction =
    action === "playerAttack" ? styles.stickmanPlayerAttack : action === "playerFall" ? styles.stickmanPlayerFall : {};
  const enemyAction =
    action === "enemyAttack" ? styles.stickmanEnemyAttack : action === "enemyFall" ? styles.stickmanEnemyFall : {};

  return (
    <section style={{ ...styles.battleCard, ...(action !== "idle" ? styles.battleShake : {}) }}>
      <ArenaBackground />

      <div style={styles.hudRow}>
        <HpSide name="YOU" hp={`${playerHp}/${maxHp}`} side="player" percent={playerHp / maxHp} />
        <div style={styles.versus}>VS</div>
        <HpSide name="BOT" hp={`${enemyHp}/${maxHp}`} side="enemy" percent={enemyHp / maxHp} />
      </div>

      <div style={{ ...styles.wordChip, ...styles.wordChipPlayer }}>{currentWord}</div>
      <div style={{ ...styles.wordChip, ...styles.wordChipEnemy }}>{enemyWord}</div>

      <div style={styles.arenaGround} />
      <Stickman side="player" actionStyle={playerAction} />
      <Stickman side="enemy" actionStyle={enemyAction} />

      <div style={{ ...styles.slashFlash, opacity: action === "idle" ? 0.2 : 1 }}>
        {action === "wrong" ? "✖" : "⚔"}
      </div>

      {gameOver && (
        <div style={styles.resultOverlay}>
          <div>
            <div style={styles.resultTitle}>{resultText}</div>
            <div style={styles.resultText}>Комбо: x{combo}</div>
            <button style={styles.resultButton} type="button" onClick={onRestart}>Играть ещё</button>
          </div>
        </div>
      )}
    </section>
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
  onBotHit,
  inputRef,
}: {
  currentWord: string;
  typed: string;
  action: string;
  gameOver: boolean;
  onType: (value: string) => void;
  onBotHit: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const disabled = gameOver || ["playerFall", "enemyFall", "playerAttack", "enemyAttack"].includes(action);

  return (
    <section style={styles.typingDock}>
      <div style={styles.typingWord}>{currentWord}</div>
      <input
        ref={inputRef}
        style={{ ...styles.realInput, ...(action === "wrong" ? styles.realInputWrong : {}) }}
        value={typed}
        onChange={(event) => onType(event.target.value)}
        placeholder="печатай..."
        disabled={disabled}
        autoCapitalize="none"
        autoComplete="off"
        spellCheck={false}
      />
      <button style={styles.botButton} type="button" onClick={onBotHit} disabled={gameOver || action !== "idle"}>
        удар бота / тест
      </button>
    </section>
  );
}

function KeyboardMock() {
  const rowOne = ["й", "ц", "у", "к", "е", "н", "г", "ш", "щ"];
  const rowTwo = ["ф", "ы", "в", "а", "п", "р", "о", "л"];

  return (
    <div style={styles.keyboardMock}>
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
