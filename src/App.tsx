import { useEffect, useRef, useState } from "react";
import MainMenuPage from "./pages/MainMenuPage";
import BattlePage from "./pages/BattlePage";
import RatingPage from "./pages/RatingPage";
import ProfilePage from "./pages/ProfilePage";
import { Background } from "./components/Background";
import { ENERGY_MAX, LEADERS, MAX_HP, WORDS } from "./data/gameData";
import { ApiError, api } from "./lib/api";
import type { LeaderboardEntry } from "./lib/apiContracts";
import { createPlayerProfile } from "./lib/playerProfile";
import type { PlayerProfile } from "./lib/playerProfile";
import {
  getTodayKey,
  clearPendingBattleResults,
  loadEnergy,
  loadPendingBattleResults,
  loadSettings,
  saveBattleResult,
  saveEnergy,
  savePendingBattleResult,
  saveSettings,
} from "./lib/progressStorage";
import type { StoredBattleResult, StoredLanguage } from "./lib/progressStorage";
import { telegram } from "./lib/telegram";
import { buildBotStartLink, buildStartAppLink } from "./lib/telegramLinks";
import { parseStartAppParam } from "./lib/startApp";
import { styles } from "./styles/styles";

export type Screen = "menu" | "battle" | "rating" | "profile";
export type BattleMode = "ai" | "online" | "friend";
export type Language = StoredLanguage;
type SyncStatus = "local" | "syncing" | "synced" | "offline";

function isLocalDevelopmentHost() {
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
}

function isMobileLikeBrowser() {
  const userAgent = navigator.userAgent || "";
  const hasMobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
  const hasTouch = navigator.maxTouchPoints > 0;
  const narrowScreen = Math.min(window.screen.width, window.screen.height) <= 820;

  return hasMobileUserAgent || (hasTouch && narrowScreen);
}

function shouldBlockDesktopClient() {
  if (isLocalDevelopmentHost()) return false;

  const platform = telegram.platform.toLowerCase();
  if (platform) {
    return !["android", "android_x", "ios"].includes(platform);
  }

  return !isMobileLikeBrowser();
}

function DesktopBlockedView() {
  return (
    <div style={styles.desktopBlocker}>
      <div style={styles.desktopBlockerCard}>
        <div style={styles.desktopBlockerIcon}>📱</div>
        <div style={styles.desktopBlockerTitle}>Открой с телефона</div>
        <div style={styles.desktopBlockerText}>
          Type Fight работает как мобильная Telegram Mini App. Открой приложение в Telegram на телефоне, чтобы играть без ошибок с клавиатурой и экраном боя.
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [battleMode, setBattleMode] = useState<BattleMode>("ai");
  const [ratingPeriod, setRatingPeriod] = useState<"week" | "today">("week");
  const [isSearching, setIsSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");
  const [duelInviteOpen, setDuelInviteOpen] = useState(false);
  const [duelLink, setDuelLink] = useState("");
  const [pendingDuelId, setPendingDuelId] = useState("");
  const [duelCopied, setDuelCopied] = useState(false);
  const [activeBattleId, setActiveBattleId] = useState<string | null>(null);
  const [player, setPlayer] = useState<PlayerProfile>(() => createPlayerProfile(telegram.user));
  const [leaders, setLeaders] = useState<LeaderboardEntry[]>(LEADERS);
  const [energy, setEnergy] = useState(() => loadEnergy(ENERGY_MAX).value);
  const [settings, setSettings] = useState(loadSettings);
  const [isDesktopBlocked, setIsDesktopBlocked] = useState(() => shouldBlockDesktopClient());
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() =>
    api.isConfigured ? "syncing" : "local"
  );
  const [syncMessage, setSyncMessage] = useState("");

  const searchTimer = useRef<number | null>(null);
  const messageTimer = useRef<number | null>(null);
  const duelCopiedTimer = useRef<number | null>(null);
  const duelPollTimer = useRef<number | null>(null);
  const isReturningToMenu = useRef(false);

  useEffect(() => {
    const cleanupTelegram = telegram.init();
    const desktopBlocked = shouldBlockDesktopClient();
    setIsDesktopBlocked(desktopBlocked);

    if (!desktopBlocked) {
      setPlayer(createPlayerProfile(telegram.user));
      void syncSession();
      void handleStartAppParam(telegram.startParam);
    }

    return () => {
      cleanupTelegram();
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
      if (messageTimer.current) window.clearTimeout(messageTimer.current);
      if (duelCopiedTimer.current) window.clearTimeout(duelCopiedTimer.current);
      if (duelPollTimer.current) window.clearInterval(duelPollTimer.current);
    };
  }, []);

  useEffect(() => {
    saveEnergy({ value: energy, date: getTodayKey() });
  }, [energy]);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    void loadLeaderboard(ratingPeriod);
  }, [ratingPeriod]);

  useEffect(() => {
    if (screen === "menu") return;

    return telegram.showBackButton(() => {
      if (screen === "battle") {
        void returnToMenu();
        return;
      }

      setScreen("menu");
    });
  }, [screen]);

  useEffect(() => {
    if (!pendingDuelId || !duelInviteOpen || !api.isConfigured) return;

    duelPollTimer.current = window.setInterval(() => {
      void pollDuelInvite(pendingDuelId);
    }, 2200);

    return () => {
      if (duelPollTimer.current) window.clearInterval(duelPollTimer.current);
    };
  }, [duelInviteOpen, pendingDuelId]);

  function playFeedback() {
    if (settings.vibrationEnabled) {
      telegram.impact("light");
    }

    if (settings.vibrationEnabled && "vibrate" in navigator) {
      navigator.vibrate(25);
    }

    if (!settings.soundEnabled) return;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.frequency.value = 660;
    gain.gain.value = 0.035;
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.08);
  }

  async function syncSession() {
    if (!api.isConfigured) {
      setSyncStatus("local");
      return;
    }

    setSyncStatus("syncing");

    try {
      const session = await api.syncSession();
      if (!session) {
        setSyncStatus("local");
        return;
      }

      setPlayer(session.player);
      setEnergy(session.energy.value);
      if (session.settings) {
        setSettings(session.settings);
      }
      setSyncStatus("synced");
      void flushPendingBattleResults();
      void loadLeaderboard(ratingPeriod);
    } catch (error) {
      setSyncStatus("offline");
      setSyncMessage(
        error instanceof ApiError
          ? `API ${error.status}: ${error.code}`
          : "API connection failed"
      );
    }
  }

  async function loadLeaderboard(period: "today" | "week") {
    if (!api.isConfigured) {
      setLeaders(LEADERS);
      return;
    }

    try {
      const leaderboard = await api.getLeaderboard(period);
      if (!leaderboard) {
        setLeaders(LEADERS);
        return;
      }

      setLeaders(leaderboard.leaders);
      setPlayer((currentPlayer) => ({
        ...currentPlayer,
        rank: leaderboard.playerRank,
      }));
      setSyncStatus("synced");
    } catch {
      setLeaders(LEADERS);
      setSyncStatus("offline");
    }
  }

  async function flushPendingBattleResults() {
    if (!api.isConfigured) return;

    const pendingResults = loadPendingBattleResults();
    if (pendingResults.length === 0) return;

    try {
      for (const result of pendingResults) {
        await api.recordBattleResult(result);
      }

      clearPendingBattleResults();
      setSyncStatus("synced");
    } catch {
      setSyncStatus("offline");
    }
  }

  async function handleStartAppParam(startParam: string) {
    const action = parseStartAppParam(startParam);

    if (action.type === "none") return;

    if (action.type === "push") {
      void api.recordPushOpen(action.pushType);
      showSearchMessage("С возвращением в Type Fight.", 2200);
      return;
    }

    if (action.type === "unknown") {
      showSearchMessage("Неизвестная ссылка запуска.", 2500);
      return;
    }

    if (action.type === "referral") {
      void api.trackEvent({ eventName: "ref_opened", refCode: action.referralCode });
      if (!api.isConfigured) {
        showSearchMessage("Реферальная ссылка распознана. Начисление подключим на сервере.", 3000);
        return;
      }

      try {
        const referral = await api.applyReferral(action.referralCode);
        showSearchMessage(referral?.message || "Реферальная ссылка принята.", 2500);
        setSyncStatus("synced");
      } catch {
        setSyncStatus("offline");
        showSearchMessage("Не удалось применить реферальную ссылку.", 2500);
      }

      return;
    }

    if (!api.isConfigured) {
      void api.trackEvent({ eventName: "duel_join_opened", duelId: action.duelId });
      setDuelLink(buildStartAppLink(action.duelId));
      setDuelCopied(false);
      setDuelInviteOpen(true);
      showSearchMessage("Дуэльная ссылка распознана. Подключение к бою заработает с сервером.", 3000);
      return;
    }

    try {
      void api.trackEvent({ eventName: "duel_join_opened", duelId: action.duelId });
      const duel = await api.joinDuel(action.duelId);

      if (duel?.status === "joined") {
        if (!duel.battleId) {
          showSearchMessage("Сервер подключил дуэль, но не прислал бой. Попробуйте еще раз.", 2500);
          return;
        }

        setSyncStatus("synced");
        startBattle("friend", duel.battleId);
        return;
      }

      setSyncStatus("synced");
      showSearchMessage(duel?.message || "Дуэль недоступна.", 2500);
    } catch {
      setSyncStatus("offline");
      showSearchMessage("Не удалось подключиться к дуэли.", 2500);
    }
  }

  function startBattle(mode: BattleMode = "ai", battleId: string | null = null) {
    telegram.impact("light");
    setBattleMode(mode);
    setActiveBattleId(battleId);
    setIsSearching(false);
    setSearchMessage("");
    setDuelInviteOpen(false);
    setDuelCopied(false);
    setScreen("battle");
  }

  function blurActiveElement() {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) {
      activeElement.blur();
    }
  }

  function waitForBattleViewportRelease() {
    return new Promise<void>((resolve) => {
      const visualViewport = window.visualViewport;
      let settled = false;
      const startedAt = Date.now();
      const startHeight = visualViewport?.height || window.innerHeight;
      let lastHeight = startHeight;

      function finish() {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        visualViewport?.removeEventListener("resize", handleResize);
        telegram.refreshViewport();
        resolve();
      }

      function handleResize() {
        const nextHeight = visualViewport?.height || window.innerHeight;
        const heightRestored = nextHeight > startHeight + 70;
        const heightStable = Math.abs(nextHeight - lastHeight) < 2 && Date.now() - startedAt > 420;

        lastHeight = nextHeight;
        if (heightRestored || heightStable) {
          window.setTimeout(finish, 120);
        }
      }

      const timeout = window.setTimeout(finish, 620);
      visualViewport?.addEventListener("resize", handleResize);
      window.setTimeout(handleResize, 280);
    });
  }

  async function returnToMenu() {
    if (isReturningToMenu.current) return;

    isReturningToMenu.current = true;
    telegram.impact("light");
    blurActiveElement();
    document.documentElement.classList.remove("tk-battle-active");
    telegram.refreshViewport();

    if (screen === "battle") {
      await waitForBattleViewportRelease();
    }

    setActiveBattleId(null);
    setScreen("menu");
    window.setTimeout(() => {
      isReturningToMenu.current = false;
      telegram.refreshViewport();
    }, 80);
  }

  function showSearchMessage(message: string, timeoutMs = 2000) {
    setSearchMessage(message);
    messageTimer.current = window.setTimeout(() => setSearchMessage(""), timeoutMs);
  }

  function runLocalOpponentSearch() {
    searchTimer.current = window.setTimeout(() => {
      setIsSearching(false);
      showSearchMessage("Попробуйте еще раз!");
    }, 2000);
  }

  async function runServerOpponentSearch() {
    try {
      const result = await api.findOpponent();
      setIsSearching(false);

      if (!result || result.status === "unavailable") {
        showSearchMessage(result?.message || "Попробуйте еще раз!");
        return;
      }

      if (result.status === "queued") {
        showSearchMessage("Соперник пока не найден. Попробуйте еще раз через пару секунд.", 2500);
        setSyncStatus("synced");
        return;
      }

      setSyncStatus("synced");
      if (!result.battleId) {
        showSearchMessage("Сервер нашел соперника, но не прислал бой. Попробуйте еще раз.", 2500);
        return;
      }

      startBattle("online", result.battleId);
    } catch {
      setIsSearching(false);
      setSyncStatus("offline");
      showSearchMessage("Сервер поиска недоступен. Попробуйте еще раз.");
    }
  }

  function findOpponent() {
    if (isSearching) return;

    if (messageTimer.current) {
      window.clearTimeout(messageTimer.current);
    }

    if (energy <= 0) {
      setSearchMessage("Энергия закончилась. Завтра снова будет 50, позже добавим восстановление за рекламу.");
      telegram.notify("warning");
      messageTimer.current = window.setTimeout(() => setSearchMessage(""), 3500);
      return;
    }

    playFeedback();
    setSearchMessage("");
    setIsSearching(true);

    if (!api.isConfigured) {
      runLocalOpponentSearch();
      return;
    }

    void runServerOpponentSearch();
  }

  async function createFriendInvite() {
    try {
      const invite = await api.createDuelInvite();

      void api.trackEvent({ eventName: "duel_created", duelId: invite.duelId });
      setDuelLink(buildBotStartLink(invite.startParam));
      setPendingDuelId(invite.duelId);
      setDuelCopied(false);
      setDuelInviteOpen(true);
      if (api.isConfigured) setSyncStatus("synced");
    } catch {
      setSyncStatus("offline");
      setSearchMessage("Не удалось создать дуэль. Проверьте подключение и попробуйте еще раз.");
      messageTimer.current = window.setTimeout(() => setSearchMessage(""), 2500);
    }
  }

  async function pollDuelInvite(duelId: string) {
    try {
      const status = await api.getDuelStatus(duelId);
      if (!status || status.status === "waiting") return;

      if (status.status === "joined" && status.battleId) {
        setSyncStatus("synced");
        setPendingDuelId("");
        startBattle("friend", status.battleId);
        return;
      }

      setPendingDuelId("");
      setDuelInviteOpen(false);
      showSearchMessage(status.message || "Дуэль больше недоступна.", 2500);
    } catch {
      setSyncStatus("offline");
    }
  }

  async function copyDuelLink() {
    if (!duelLink) return;

    const duelUrl = new URL(duelLink);
    const duelId = duelUrl.searchParams.get("startapp") || duelUrl.searchParams.get("start") || undefined;
    void api.trackEvent({ eventName: "duel_copied", duelId });

    try {
      await navigator.clipboard.writeText(duelLink);
    } catch {
      // Preview browsers may block clipboard access.
    }

    setDuelCopied(true);
    if (duelCopiedTimer.current) window.clearTimeout(duelCopiedTimer.current);
    duelCopiedTimer.current = window.setTimeout(() => setDuelCopied(false), 2200);
  }

  function handleBattleComplete(result: StoredBattleResult) {
    saveBattleResult(result);

    void api
      .recordBattleResult(result)
      .then((response) => {
        if (!response) return;
        setPlayer(response.player);
        setEnergy(response.energy.value);
        setSyncStatus("synced");
        void flushPendingBattleResults();
        void loadLeaderboard(ratingPeriod);
      })
      .catch(() => {
        savePendingBattleResult(result);
        setSyncStatus("offline");
      });

    setPlayer((currentPlayer) => {
      const wins = currentPlayer.wins + (result.outcome === "win" ? 1 : 0);
      const losses = currentPlayer.losses + (result.outcome === "loss" ? 1 : 0);
      const totalBattles = Math.max(1, wins + losses);
      const winRate = `${Math.round((wins / totalBattles) * 100)}%`;
      const streak = result.outcome === "win" ? currentPlayer.streak + 1 : 0;
      const bestCombo = Math.max(currentPlayer.bestCombo, result.combo);

      return {
        ...currentPlayer,
        wins,
        losses,
        winRate,
        streak,
        bestCombo,
      };
    });
  }

  return (
    <div className="tk-root" style={styles.root}>
      <section className="tk-phone" style={styles.phone} aria-label="Type Fight">
        <Background />

        {isDesktopBlocked && <DesktopBlockedView />}

        {!isDesktopBlocked && screen === "menu" && (
          <MainMenuPage
            onStart={findOpponent}
            onStartAi={() => startBattle("ai")}
            onStartFriend={createFriendInvite}
            onRating={() => setScreen("rating")}
            onProfile={() => setScreen("profile")}
            isSearching={isSearching}
            searchMessage={searchMessage}
            duelInviteOpen={duelInviteOpen}
            duelLink={duelLink}
            duelCopied={duelCopied}
            player={player}
            energy={energy}
            maxEnergy={ENERGY_MAX}
            syncStatus={syncStatus}
            syncMessage={syncMessage}
            onCopyDuelLink={copyDuelLink}
            onCloseDuelInvite={() => {
              setPendingDuelId("");
              setDuelInviteOpen(false);
            }}
          />
        )}

        {!isDesktopBlocked && screen === "battle" && (
          <BattlePage
            mode={battleMode}
            words={WORDS}
            maxHp={MAX_HP}
            battleId={activeBattleId}
            onMenu={returnToMenu}
            onBattleComplete={handleBattleComplete}
          />
        )}

        {!isDesktopBlocked && screen === "rating" && (
          <RatingPage
            leaders={leaders}
            player={player}
            ratingPeriod={ratingPeriod}
            onPeriodChange={setRatingPeriod}
            onHome={() => setScreen("menu")}
            onProfile={() => setScreen("profile")}
          />
        )}

        {!isDesktopBlocked && screen === "profile" && (
          <ProfilePage
            onHome={() => setScreen("menu")}
            onRating={() => setScreen("rating")}
            player={player}
            soundEnabled={settings.soundEnabled}
            vibrationEnabled={settings.vibrationEnabled}
            language={settings.language}
            onToggleSound={() =>
              setSettings((currentSettings) => ({
                ...currentSettings,
                soundEnabled: !currentSettings.soundEnabled,
              }))
            }
            onToggleVibration={() => {
              setSettings((currentSettings) => ({
                ...currentSettings,
                vibrationEnabled: !currentSettings.vibrationEnabled,
              }));
              telegram.impact("medium");
              if (!settings.vibrationEnabled && "vibrate" in navigator) {
                navigator.vibrate(40);
              }
            }}
            onToggleLanguage={() =>
              setSettings((currentSettings) => ({
                ...currentSettings,
                language: currentSettings.language === "RU" ? "EN" : "RU",
              }))
            }
          />
        )}
      </section>
    </div>
  );
}
