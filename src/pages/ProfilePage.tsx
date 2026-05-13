import { useState } from "react";
import { BottomNav } from "../components/BottomNav";
import { HeroCharacter } from "../components/HeroCharacter";
import { TopBar } from "../components/TopBar";
import { PLAYER } from "../data/gameData";
import { styles } from "../styles/styles";

type ProfilePageProps = {
  onHome: () => void;
  onRating: () => void;
};

export default function ProfilePage({
  onHome,
  onRating,
}: ProfilePageProps) {
  const progress = Math.min(
    1,
    PLAYER.score / PLAYER.nextScore
  );

  const [refOpen, setRefOpen] =
    useState(false);

  const [refCopied, setRefCopied] =
    useState(false);

  const refLink =
    "https://t.me/typing_kombat_bot/app?startapp=ref_" +
    PLAYER.name.replace(/\s+/g, "").toUpperCase();

  async function copyReferralLink() {
    try {
      await navigator.clipboard.writeText(
        refLink
      );
    } catch (error) {
      console.log(error);
    }

    setRefCopied(true);
  }

  return (
    <div style={styles.menuLayout}>
      <TopBar title="Профиль" />

      <section
        style={styles.pageScreen}
        aria-label="Профиль игрока"
      >
        <div style={styles.homeHeroCard}>
          <div style={styles.homeProfileRow}>
            <div>
              <div style={styles.homeNickname}>
                {PLAYER.name}
              </div>

              <div style={styles.homeLeague}>
                {PLAYER.league}
              </div>
            </div>

            <div style={styles.currencyBadge}>
              🏆 #{PLAYER.rank}
            </div>
          </div>

          <div style={styles.heroArenaPreview}>
            <div style={styles.heroSun} />
            <div style={styles.heroCloud} />
            <div style={styles.heroMountainLeft} />
            <div style={styles.heroMountainRight} />
            <div style={styles.heroGrass} />

            <div style={styles.heroCharacterWrap}>
              <div style={styles.heroIdleFloat}>
                <HeroCharacter />
              </div>
            </div>
          </div>

          <div style={styles.profileInfoRow}>
            <div>
              <div style={styles.infoLabel}>
                ТЕКУЩАЯ ЛИГА
              </div>

              <div style={styles.rankLine}>
                🛡️ {PLAYER.leagueCode}
              </div>
            </div>

            <div style={styles.scoreBadge}>
              🏆 {PLAYER.score}
            </div>
          </div>
        </div>

        <div style={styles.progressCard}>
          <div style={styles.progressTop}>
            <div>
              <div style={styles.cardLabel}>
                ДО СЛЕДУЮЩЕЙ ЛИГИ
              </div>

              <div style={styles.progressTitle}>
                {PLAYER.nextLeague}
              </div>
            </div>

            <div style={styles.progressScore}>
              {PLAYER.score}/{PLAYER.nextScore}
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
          <StatCard
            icon="🎯"
            value={PLAYER.winRate}
            label="ПОБЕД"
          />

          <StatCard
            icon="⌨️"
            value={PLAYER.wpm}
            label="WPM"
          />

          <StatCard
            icon="🔥"
            value={PLAYER.streak}
            label="СЕРИЯ"
          />

          <StatCard
            icon="⚔️"
            value={PLAYER.wins}
            label="ВЫИГРАНО"
          />

          <StatCard
            icon="💀"
            value={PLAYER.losses}
            label="ПОРАЖЕНИЙ"
          />

          <StatCard
            icon="⚡"
            value={`x${PLAYER.bestCombo}`}
            label="КОМБО"
          />
        </div>

        <div style={styles.dailyCard}>
          <div>
            <div style={styles.dailyTitle}>
              👥 Пригласить друга
            </div>

            <div style={styles.dailyText}>
              Приглашено: {PLAYER.invited}
            </div>
          </div>

          <button
            style={styles.dailyButton}
            type="button"
            onClick={() => {
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
              <div style={styles.inviteTitle}>
                Реферальная ссылка
              </div>

              <div style={styles.inviteText}>
                Отправь ссылку другу.
                Когда он зайдёт в приложение,
                сервер привяжет его к твоему
                профилю.
              </div>

              <div style={styles.inviteLink}>
                {refLink}
              </div>

              <div style={styles.inviteActions}>
                <button
                  style={
                    styles.invitePrimaryButton
                  }
                  type="button"
                  onClick={copyReferralLink}
                >
                  {refCopied
                    ? "Скопировано"
                    : "Скопировать"}
                </button>

                <button
                  style={
                    styles.inviteSecondaryButton
                  }
                  type="button"
                >
                  Поделиться
                </button>
              </div>

              <button
                style={
                  styles.inviteCloseButton
                }
                type="button"
                onClick={() =>
                  setRefOpen(false)
                }
              >
                Закрыть
              </button>
            </div>
          </div>
        )}

        <div style={styles.settingsCard}>
          <SettingRow
            icon="🔊"
            title="Звук"
            value="Вкл"
          />

          <SettingRow
            icon="📳"
            title="Вибрация"
            value="Вкл"
          />

          <SettingRow
            icon="🌐"
            title="Язык"
            value="RU"
          />
        </div>
      </section>

      <BottomNav
        active="profile"
        onHome={onHome}
        onRating={onRating}
      />
    </div>
  );
}

function StatCard({
  icon,
  value,
  label,
}: {
  icon: string;
  value: string | number;
  label: string;
}) {
  return (
    <div style={styles.statCard}>
      <div style={styles.statIcon}>
        {icon}
      </div>

      <div style={styles.statValue}>
        {value}
      </div>

      <div style={styles.statLabel}>
        {label}
      </div>
    </div>
  );
}

function SettingRow({
  icon,
  title,
  value,
}: {
  icon: string;
  title: string;
  value: string;
}) {
  return (
    <div style={styles.settingRow}>
      <div style={styles.settingLeft}>
        <span style={styles.settingIcon}>
          {icon}
        </span>

        {title}
      </div>

      <div style={styles.settingValue}>
        {value}
      </div>
    </div>
  );
}