import { BottomNav } from "../components/BottomNav";
import { HeroCharacter, TrophyAsset } from "../components/HeroCharacter";
import { TopBar } from "../components/TopBar";
import { PLAYER } from "../data/gameData";
import { styles } from "../styles/styles";

type Leader = {
  rank: number;
  name: string;
  league: string;
  wpm: number;
  wins: string;
  streak: number;
  color: string;
  me?: boolean;
};

type RatingPageProps = {
  leaders: Leader[];
  ratingPeriod: "week" | "today";
  onPeriodChange: (period: "week" | "today") => void;
  onHome: () => void;
  onProfile: () => void;
};

export default function RatingPage({ leaders, ratingPeriod, onPeriodChange, onHome, onProfile }: RatingPageProps) {
  const progress = Math.min(1, PLAYER.score / PLAYER.nextScore);

  return (
    <div style={styles.menuLayout}>
      <TopBar title="Рейтинг" />

      <section style={styles.pageScreen} aria-label="Рейтинг игроков">
        <div style={styles.homeHeroCard}>
          <div style={styles.homeProfileRow}>
            <div>
              <div style={styles.homeNickname}>{PLAYER.name}</div>
              <div style={styles.homeLeague}>{PLAYER.league}</div>
            </div>
            <div style={styles.currencyBadge}>🏆 #{PLAYER.rank}</div>
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
            <div style={{ position: "absolute", right: 24, bottom: 20, width: 88, height: 102, filter: "drop-shadow(0 8px 10px rgba(0,0,0,.22))" }}>
              <TrophyAsset />
            </div>
          </div>

          <div style={styles.profileInfoRow}>
            <div>
              <div style={styles.infoLabel}>ТВОЙ РАНГ</div>
              <div style={styles.rankLine}>🛡️ {PLAYER.leagueCode}</div>
            </div>
            <div style={styles.scoreBadge}>🏆 {PLAYER.score}</div>
          </div>
        </div>

        <div style={styles.tabsCard}>
          <button
            style={{ ...styles.periodButton, ...(ratingPeriod === "week" ? styles.periodButtonActive : {}) }}
            type="button"
            onClick={() => onPeriodChange("week")}
          >
            🗓️ НЕДЕЛЯ
          </button>
          <button
            style={{ ...styles.periodButton, ...(ratingPeriod === "today" ? styles.periodButtonActive : {}) }}
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
              <div style={styles.progressTitle}>{PLAYER.nextLeague}</div>
            </div>
            <div style={styles.progressScore}>{PLAYER.score}/{PLAYER.nextScore}</div>
          </div>
          <div style={styles.progressBar}><div style={{ ...styles.progressFill, width: `${progress * 100}%` }} /></div>
          <div style={styles.ratingNote}>Рейтинг обновляется каждую неделю. Новый шанс для каждого!</div>
        </div>

        <div style={styles.statsGrid}>
          <StatCard icon="🎯" value={PLAYER.winRate} label="ПОБЕД" />
          <StatCard icon="⌨️" value={PLAYER.wpm} label="WPM" />
          <StatCard icon="🔥" value={PLAYER.streak} label="СЕРИЯ" />
        </div>

        <div style={styles.tableCard}>
          <div style={styles.tableTitle}>🏆 Лидеры сезона</div>
          <div style={styles.tableHead}>
            <span>#</span>
            <span>ИГРОК</span>
            <span>WPM</span>
            <span>WIN</span>
          </div>

          {leaders.map((player) => <RatingRow key={`${player.rank}-${player.name}`} player={player} />)}
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

function RatingRow({ player }: { player: Leader }) {
  const medal = player.rank <= 3 ? ["🥇", "🥈", "🥉"][player.rank - 1] : player.rank;

  return (
    <div style={{ ...styles.ratingRow, ...(player.me ? styles.ratingRowMe : {}) }}>
      <div style={styles.ratingRankCell}>{medal}</div>
      <div style={styles.ratingPlayerCell}>
        <div style={{ ...styles.ratingAvatar, boxShadow: `0 0 0 4px ${player.color}, 0 0 16px ${player.color}` }}>●</div>
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
