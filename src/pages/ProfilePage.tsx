import { useEffect, useRef, useState } from "react";
import type { Language } from "../App";
import { BottomNav } from "../components/BottomNav";
import { api } from "../lib/api";
import type { PlayerProfile } from "../lib/playerProfile";
import { buildStartAppLink } from "../lib/telegramLinks";
import { styles } from "../styles/styles";
import { TopBar } from "../components/TopBar";

type ProfilePageProps = {
  onHome: () => void;
  onRating: () => void;
  player: PlayerProfile;
  soundEnabled?: boolean;
  vibrationEnabled?: boolean;
  language?: Language;
  onToggleSound?: () => void;
  onToggleVibration?: () => void;
  onToggleLanguage?: () => void;
};

export default function ProfilePage({
  onHome,
  onRating,
  player,
  soundEnabled = true,
  vibrationEnabled = true,
  language = "RU",
  onToggleSound,
  onToggleVibration,
  onToggleLanguage,
}: ProfilePageProps) {
  const progress = Math.min(1, player.score / player.nextScore);
  const [refOpen, setRefOpen] = useState(false);
  const [refCopied, setRefCopied] = useState(false);
  const refCopiedTimer = useRef<number | null>(null);
  const refLink = buildStartAppLink(`ref_${player.name.replace(/\s+/g, "").toUpperCase()}`);

  useEffect(() => {
    return () => {
      if (refCopiedTimer.current) window.clearTimeout(refCopiedTimer.current);
    };
  }, []);

  async function copyReferralLink() {
    const refCode = new URL(refLink).searchParams.get("startapp") || undefined;
    void api.trackEvent({ eventName: "ref_link_copied", refCode });

    try {
      await navigator.clipboard.writeText(refLink);
    } catch {
      // Preview browsers may block clipboard access.
    }

    setRefCopied(true);
    if (refCopiedTimer.current) window.clearTimeout(refCopiedTimer.current);
    refCopiedTimer.current = window.setTimeout(() => setRefCopied(false), 2200);
  }

  async function shareReferralLink() {
    const refCode = new URL(refLink).searchParams.get("startapp") || undefined;
    void api.trackEvent({ eventName: "ref_link_shared", refCode });

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Type Fight",
          text: "Заходи в Type Fight по моей ссылке",
          url: refLink,
        });
      } catch {
        return;
      }
      return;
    }

    await copyReferralLink();
  }

  return (
    <div style={styles.menuLayout}>
      <TopBar title="Профиль" />

      <section style={styles.pageScreen} aria-label="Профиль игрока">
        <div style={styles.progressCard}>
          <div style={styles.progressTop}>
            <div>
              <div style={styles.cardLabel}>ДО СЛЕДУЮЩЕЙ ЛИГИ</div>
              <div style={styles.progressTitle}>{player.nextLeague}</div>
            </div>

            <div style={styles.progressScore}>
              {player.score}/{player.nextScore}
            </div>
          </div>

          <div style={styles.progressBar}>
            <div
              style={{
                ...styles.progressFill,
                width: `${progress * 100}%`,
              }}
            />
          </div>
        </div>

        <div style={styles.statsGrid}>
          <StatCard icon="🎯" value={player.winRate} label="ПОБЕД" />
          <StatCard icon="⌨️" value={player.wpm} label="WPM" />
          <StatCard icon="🔥" value={player.streak} label="СЕРИЯ" />
          <StatCard icon="⚔️" value={player.wins} label="ВЫИГРАНО" />
          <StatCard icon="💀" value={player.losses} label="ПОРАЖЕНИЙ" />
          <StatCard icon="⚡" value={`x${player.bestCombo}`} label="КОМБО" />
        </div>

        <div style={styles.dailyCard}>
          <div>
            <div style={styles.dailyTitle}>👥 Пригласить друга</div>
            <div style={styles.dailyText}>Приглашено: {player.invited}</div>
          </div>

          <button
            style={styles.dailyButton}
            type="button"
            onClick={() => {
              const refCode = new URL(refLink).searchParams.get("startapp") || undefined;
              void api.trackEvent({ eventName: "ref_link_created", refCode });
              setRefOpen(true);
              setRefCopied(false);
            }}
          >
            Ссылка
          </button>
        </div>

        {refOpen && (
          <div style={styles.inviteModal}>
            <div style={styles.inviteCard}>
              <div style={styles.inviteTitle}>Реферальная ссылка</div>
              <div style={styles.inviteText}>
                Отправь ссылку другу. Когда он зайдет в приложение, сервер привяжет его к твоему профилю.
              </div>

              <div style={styles.inviteLink}>{refLink}</div>

              <div style={styles.inviteActions}>
                <button style={styles.invitePrimaryButton} type="button" onClick={copyReferralLink}>
                  {refCopied ? "Скопировано" : "Скопировать"}
                </button>

                <button style={styles.inviteSecondaryButton} type="button" onClick={shareReferralLink}>
                  Поделиться
                </button>
              </div>

              <button style={styles.inviteCloseButton} type="button" onClick={() => setRefOpen(false)}>
                Закрыть
              </button>
            </div>
          </div>
        )}

        <div style={styles.settingsCard}>
          <SettingRow
            icon="🔊"
            title="Звук"
            value={soundEnabled ? "Вкл" : "Выкл"}
            active={soundEnabled}
            onClick={onToggleSound}
          />

          <SettingRow
            icon="📳"
            title="Вибрация"
            value={vibrationEnabled ? "Вкл" : "Выкл"}
            active={vibrationEnabled}
            onClick={onToggleVibration}
          />

          <SettingRow icon="🌐" title="Язык" value={language} active onClick={onToggleLanguage} />
        </div>
      </section>

      <BottomNav active="profile" onHome={onHome} onRating={onRating} />
    </div>
  );
}

function StatCard({ icon, value, label }: { icon: string; value: string | number; label: string }) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statIcon}>{icon}</div>
      <div style={styles.statValue}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}

function SettingRow({
  icon,
  title,
  value,
  active,
  onClick,
}: {
  icon: string;
  title: string;
  value: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button style={styles.settingButton} type="button" onClick={onClick} aria-pressed={active}>
      <div style={styles.settingLeft}>
        <span style={styles.settingIcon}>{icon}</span>
        {title}
      </div>

      <div
        style={{
          ...styles.settingValue,
          ...(active === false ? styles.settingValueOff : {}),
        }}
      >
        {value}
      </div>
    </button>
  );
}
