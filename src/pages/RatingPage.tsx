import { BottomNav } from "../components/BottomNav";
import { TopBar } from "../components/TopBar";
import type { LeaderboardEntry } from "../lib/apiContracts";
import type { PlayerProfile } from "../lib/playerProfile";
import { styles } from "../styles/styles";

type RatingPageProps = {
  leaders: LeaderboardEntry[];
  player: PlayerProfile;
  ratingPeriod: "week" | "today";
  onPeriodChange: (period: "week" | "today") => void;
  onHome: () => void;
  onProfile: () => void;
};

export default function RatingPage({
  leaders,
  player,
  ratingPeriod,
  onPeriodChange,
  onHome,
  onProfile,
}: RatingPageProps) {
  const progress = Math.min(1, player.score / player.nextScore);

  return (
    <div style={styles.menuLayout}>
      <TopBar title="Рейтинг" />

      <section style={styles.pageScreen} aria-label="Рейтинг игроков">
        <div style={styles.tabsCard}>
          <button
            style={{
              ...styles.periodButton,
              ...(ratingPeriod === "week" ? styles.periodButtonActive : {}),
            }}
            type="button"
            onClick={() => onPeriodChange("week")}
          >
            🗓️ НЕДЕЛЯ
          </button>
          <button
            style={{
              ...styles.periodButton,
              ...(ratingPeriod === "today" ? styles.periodButtonActive : {}),
            }}
            type="button"
            onClick={() => onPeriodChange("today")}
          >
            🗓️ СЕГОДНЯ
          </button>
        </div>

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
          <div style={styles.ratingNote}>Рейтинг обновляется каждую неделю. Новый шанс для каждого!</div>
        </div>

        <div style={styles.statsGrid}>
          <StatCard icon="🎯" value={player.winRate} label="ПОБЕД" />
          <StatCard icon="⌨️" value={player.wpm} label="WPM" />
          <StatCard icon="🔥" value={player.streak} label="СЕРИЯ" />
        </div>

        <div style={styles.tableCard}>
          <div style={styles.tableTitle}>🏆 Лидеры сезона</div>
          <div style={styles.tableHead}>
            <span>#</span>
            <span>ИГРОК</span>
            <span>WPM</span>
            <span>WIN</span>
          </div>

          {leaders.map((leader) => (
            <RatingRow key={`${leader.rank}-${leader.name}`} player={leader} />
          ))}
        </div>
      </section>

      <BottomNav active="rating" onHome={onHome} onProfile={onProfile} />
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

function RatingRow({ player }: { player: LeaderboardEntry }) {
  const medal = player.rank <= 3 ? ["🥇", "🥈", "🥉"][player.rank - 1] : player.rank;

  return (
    <div style={{ ...styles.ratingRow, ...(player.me ? styles.ratingRowMe : {}) }}>
      <div style={styles.ratingRankCell}>{medal}</div>
      <div style={styles.ratingPlayerCell}>
        <div
          style={{
            ...styles.ratingAvatar,
            boxShadow: `0 0 0 4px ${player.color}, 0 0 16px ${player.color}`,
          }}
        >
          ●
        </div>
        <div>
          <div style={styles.ratingPlayerName}>{player.name}</div>
          <div style={styles.ratingLeagueBadge}>🛡️ {player.league}</div>
        </div>
      </div>
      <div style={styles.ratingWpm}>{player.wpm}</div>
      <div style={styles.ratingStreak}>{player.streak} 🔥</div>
    </div>
  );
}
