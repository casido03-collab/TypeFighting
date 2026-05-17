import { styles } from "../styles/styles";

type TopBarProps = {
  title?: string;
  showEyebrow?: boolean;
  showActions?: boolean;
};

export function TopBar({ title = "Type Fight", showEyebrow = false, showActions = false }: TopBarProps) {
  return (
    <header style={styles.topbar}>
      <div>
        {showEyebrow && <p style={styles.eyebrow}>Telegram Mini App</p>}
        <h1 style={styles.title}>{title}</h1>
      </div>

      {showActions && (
        <div style={styles.topActions}>
          <button style={styles.iconButton} type="button" aria-label="Звук">
            🔊
          </button>
          <button style={styles.iconButton} type="button" aria-label="Настройки">
            ⚙️
          </button>
        </div>
      )}
    </header>
  );
}
