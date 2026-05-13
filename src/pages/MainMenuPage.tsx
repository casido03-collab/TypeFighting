import { BottomNav } from "../components/BottomNav";
import { HeroCharacter } from "../components/HeroCharacter";
import { TopBar } from "../components/TopBar";
import { styles } from "../styles/styles";

type MainMenuPageProps = {
  onStart: () => void;
  onStartAi: () => void;
  onStartFriend: () => void;
  onRating: () => void;
  onProfile: () => void;
  isSearching: boolean;
  searchMessage: string;
  duelInviteOpen: boolean;
  duelLink: string;
  duelCopied: boolean;
  onCopyDuelLink: () => void;
  onCloseDuelInvite: () => void;
};

export default function MainMenuPage({
  onStart,
  onStartAi,
  onStartFriend,
  onRating,
  onProfile,
  isSearching,
  searchMessage,
  duelInviteOpen,
  duelLink,
  duelCopied,
  onCopyDuelLink,
  onCloseDuelInvite,
}: MainMenuPageProps) {
  return (
    <div style={styles.menuLayout}>
      <TopBar />

      <section style={styles.homeScreen} aria-label="Главная страница">
        <div style={styles.homeHeroCard}>
          <div style={styles.homeProfileRow}>
            <div>
              <div style={styles.homeNickname}>CASE D</div>
              <div style={styles.homeLeague}>Silver League</div>
            </div>
            <div style={styles.currencyBadge}>🏆 #24</div>
          </div>

          <div style={styles.heroArenaPreview}>
            <div style={styles.heroSun} />
            <div style={styles.heroCloud} />
            <div style={styles.heroMountainLeft} />
            <div style={styles.heroMountainRight} />
            <div style={styles.heroGrass} />
            <div style={styles.heroCharacterWrap}>
              <div style={styles.heroIdleFloat}><HeroCharacter /></div>
            </div>
          </div>

          <button
            style={{ ...styles.findBattleButton, ...(isSearching ? styles.findBattleButtonSearching : {}) }}
            type="button"
            onClick={onStart}
            disabled={isSearching}
          >
            {isSearching ? "🔎 ПОИСК СОПЕРНИКА..." : "⚔️ НАЙТИ СОПЕРНИКА"}
          </button>

          {searchMessage && <div style={styles.searchMessage}>{searchMessage}</div>}
        </div>

        <div style={styles.quickModesGrid}>
          <button style={styles.quickModeCard} type="button" onClick={onStartAi}>
            <div style={styles.quickModeIcon}>🤖</div>
            <div>
              <div style={styles.quickModeTitle}>Бой с ИИ</div>
              <div style={styles.quickModeText}>Тренируй скорость печати</div>
            </div>
          </button>

          <button style={styles.quickModeCard} type="button" onClick={onStartFriend}>
            <div style={styles.quickModeIcon}>👥</div>
            <div>
              <div style={styles.quickModeTitle}>Играть с другом</div>
              <div style={styles.quickModeText}>Дуэль по Telegram</div>
            </div>
          </button>
        </div>

        {duelInviteOpen && (
          <div style={styles.inviteModal}>
            <div style={styles.inviteCard}>
              <div style={styles.inviteTitle}>Дуэль с другом</div>
              <div style={styles.inviteText}>Отправь ссылку другу — бой начнётся, когда он подключится.</div>
              <div style={styles.inviteLink}>{duelLink}</div>
              <div style={styles.inviteActions}>
                <button style={styles.invitePrimaryButton} type="button" onClick={onCopyDuelLink}>
                  {duelCopied ? "Скопировано" : "Скопировать"}
                </button>
                <button style={styles.inviteSecondaryButton} type="button">Поделиться</button>
              </div>
              <button style={styles.inviteCloseButton} type="button" onClick={onCloseDuelInvite}>Закрыть</button>
            </div>
          </div>
        )}
</section>

      <BottomNav active="home" onRating={onRating} onProfile={onProfile} />
    </div>
  );
}
