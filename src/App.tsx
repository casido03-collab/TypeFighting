import { useEffect, useRef, useState } from "react";
import MainMenuPage from "./pages/MainMenuPage";
import BattlePage from "./pages/BattlePage";
import RatingPage from "./pages/RatingPage";
import ProfilePage from "./pages/ProfilePage";
import { Background } from "./components/Background";
import { LEADERS, MAX_HP, WORDS } from "./data/gameData";
import { styles } from "./styles/styles";

export type Screen = "menu" | "battle" | "rating" | "profile";
export type BattleMode = "ai" | "online" | "friend";

export default function App() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [battleMode, setBattleMode] = useState<BattleMode>("ai");
  const [ratingPeriod, setRatingPeriod] = useState<"week" | "today">("week");
  const [isSearching, setIsSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");
  const [duelInviteOpen, setDuelInviteOpen] = useState(false);
  const [duelLink, setDuelLink] = useState("");
  const [duelCopied, setDuelCopied] = useState(false);

  const searchTimer = useRef<number | null>(null);
  const messageTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
      if (messageTimer.current) window.clearTimeout(messageTimer.current);
    };
  }, []);

  function startBattle(mode: BattleMode = "ai") {
    setBattleMode(mode);
    setIsSearching(false);
    setSearchMessage("");
    setDuelInviteOpen(false);
    setDuelCopied(false);
    setScreen("battle");
  }

  function findOpponent() {
    if (isSearching) return;

    setSearchMessage("");
    setIsSearching(true);

    searchTimer.current = window.setTimeout(() => {
      const opponentFound = false;

      if (opponentFound) {
        startBattle("online");
        return;
      }

      setIsSearching(false);
      setSearchMessage("Попробуйте еще раз!");
      messageTimer.current = window.setTimeout(() => setSearchMessage(""), 2000);
    }, 2000);
  }

  function createFriendInvite() {
    const duelId = `duel_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    setDuelLink(`https://t.me/typing_kombat_bot/app?startapp=${duelId}`);
    setDuelCopied(false);
    setDuelInviteOpen(true);
  }

  async function copyDuelLink() {
    if (!duelLink) return;

    try {
      await navigator.clipboard.writeText(duelLink);
    } catch {
      // В превью браузер может не дать доступ к clipboard.
    }

    setDuelCopied(true);
  }

  return (
    <div style={styles.root}>
      <section style={styles.phone} aria-label="Typing Kombat">
        <Background />

        {screen === "menu" && (
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
            onCopyDuelLink={copyDuelLink}
            onCloseDuelInvite={() => setDuelInviteOpen(false)}
          />
        )}

        {screen === "battle" && (
          <BattlePage
            mode={battleMode}
            words={WORDS}
            maxHp={MAX_HP}
            onMenu={() => setScreen("menu")}
          />
        )}

        {screen === "rating" && (
          <RatingPage
            leaders={LEADERS}
            ratingPeriod={ratingPeriod}
            onPeriodChange={setRatingPeriod}
            onHome={() => setScreen("menu")}
            onProfile={() => setScreen("profile")}
          />
        )}

        {screen === "profile" && (
          <ProfilePage
            onHome={() => setScreen("menu")}
            onRating={() => setScreen("rating")}
          />
        )}
      </section>
    </div>
  );
}
