import { useState } from "react";
import { BottomNav } from "../components/BottomNav";
import { HeroCharacter } from "../components/HeroCharacter";
import { TopBar } from "../components/TopBar";
import { api } from "../lib/api";
import type { PlayerProfile } from "../lib/playerProfile";
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
  player: PlayerProfile;
  energy: number;
  maxEnergy: number;
  syncStatus: "local" | "syncing" | "synced" | "offline";
  syncMessage: string;
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
  player,
  energy,
  maxEnergy,
  syncStatus,
  syncMessage,
  onCopyDuelLink,
  onCloseDuelInvite,
}: MainMenuPageProps) {
  const [energyInfoOpen, setEnergyInfoOpen] = useState(false);

  async function shareDuelLink() {
    if (!duelLink) return;

    const duelUrl = new URL(duelLink);
    const duelId = duelUrl.searchParams.get("startapp") || duelUrl.searchParams.get("start") || undefined;
    void api.trackEvent({ eventName: "duel_shared", duelId });

    const shareText = "Присоединяйся к дуэли в Type Fight";
    const telegramShareUrl = `https://t.me/share/url?url=${encodeURIComponent(duelLink)}&text=${encodeURIComponent(shareText)}`;

    if (window.Telegram?.WebApp?.openTelegramLink) {
      window.Telegram.WebApp.openTelegramLink(telegramShareUrl);
      return;
    }

    if (window.Telegram?.WebApp?.openLink) {
      window.Telegram.WebApp.openLink(telegramShareUrl);
      return;
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Type Fight",
          text: "Присоединяйся к дуэли в Type Fight",
          url: duelLink,
        });
      } catch {
        return;
      }
      return;
    }

    await onCopyDuelLink();
  }

  return (
    <div style={styles.menuLayout}>
      <TopBar />
      <section style={styles.homeScreen} aria-label="Главная страница">
        <div style={styles.homeHeroCard}>
          <div style={styles.homeProfileRow}>
            <div>
              <div style={styles.homeNickname}>{player.name}</div>
              <div style={styles.homeLeague}>{player.league}</div>
            </div>
            <div style={styles.homeBadgeRow}>
              {syncStatus !== "local" && (
                <div
                  style={{
                    ...styles.syncBadge,
                    ...(syncStatus === "offline" ? styles.syncBadgeOffline : {}),
                  }}
                  title={syncMessage || undefined}
                >
                  {syncStatus === "syncing" ? "SYNC" : syncStatus === "offline" ? "OFF" : "ON"}
                </div>
              )}
              <button
                style={styles.energyBadge}
                type="button"
                aria-label={`Энергия ${energy} из ${maxEnergy}`}
                onClick={() => setEnergyInfoOpen(true)}
              >
                ⚡ {energy}
              </button>
              <div style={styles.currencyBadge}>🏆 #{player.rank}</div>
            </div>
          </div>

          <div style={styles.heroArenaPreview}>
            <div style={styles.heroCharacterWrap}>
              <div style={styles.heroIdleFloat}>
                <HeroCharacter />
              </div>
            </div>
          </div>

          <button
            style={{
              ...styles.findBattleButton,
              ...(isSearching ? styles.findBattleButtonSearching : {}),
              ...(energy <= 0 ? styles.findBattleButtonEmpty : {}),
            }}
            type="button"
            onClick={onStart}
            disabled={isSearching}
          >
            {isSearching ? "🔎 ПОИСК СОПЕРНИКА..." : "⚔️ НАЙТИ СОПЕРНИКА"}
          </button>
        </div>

        {searchMessage && <div style={styles.searchMessage}>{searchMessage}</div>}
        {syncStatus === "offline" && syncMessage && (
          <div style={styles.searchMessage}>{syncMessage}</div>
        )}

        {energyInfoOpen && (
          <div style={styles.energyInfoBanner}>
            <div>
              <div style={styles.energyInfoTitle}>⚡ Энергия</div>
              <div style={styles.energyInfoText}>
                Один сыгранный бой с соперником тратит 1 энергию независимо от победы или поражения.
                Поиск, бои с ИИ и другом энергию не снимают. Каждый день запас восстанавливается до {maxEnergy}.
                Позже можно будет пополнить энергию за просмотр рекламы.
              </div>
            </div>

            <button
              style={styles.energyInfoClose}
              type="button"
              aria-label="Закрыть"
              onClick={() => setEnergyInfoOpen(false)}
            >
              ×
            </button>
          </div>
        )}

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
              <div style={styles.inviteText}>Отправь ссылку другу - бой начнется, когда он подключится.</div>
              <div style={styles.inviteLink}>{duelLink}</div>
              <div style={styles.inviteActions}>
                <button style={styles.invitePrimaryButton} type="button" onClick={onCopyDuelLink}>
                  {duelCopied ? "Скопировано" : "Скопировать"}
                </button>
                <button style={styles.inviteSecondaryButton} type="button" onClick={shareDuelLink}>
                  Поделиться
                </button>
              </div>
              <button style={styles.inviteCloseButton} type="button" onClick={onCloseDuelInvite}>
                Закрыть
              </button>
            </div>
          </div>
        )}
      </section>

      <BottomNav active="home" onRating={onRating} onProfile={onProfile} />
    </div>
  );
}
