import { styles } from "../styles/styles";

type BottomNavProps = {
  active?: "home" | "rating" | "profile";
  onHome?: () => void;
  onRating?: () => void;
  onProfile?: () => void;
};

export function BottomNav({ active = "home", onHome, onRating, onProfile }: BottomNavProps) {
  return (
    <nav style={styles.bottomNav} aria-label="Навигация">
      <NavButton icon="🏠" text="Главная" active={active === "home"} onClick={onHome} />
      <NavButton icon="🏆" text="Рейтинг" active={active === "rating"} onClick={onRating} />
      <NavButton icon="👤" text="Профиль" active={active === "profile"} onClick={onProfile} />
    </nav>
  );
}

function NavButton({
  icon,
  text,
  active,
  onClick,
}: {
  icon: string;
  text: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button style={{ ...styles.navButton, ...(active ? styles.navButtonActive : {}) }} type="button" onClick={onClick}>
      <span style={styles.navIcon}>{icon}</span>
      {text}
    </button>
  );
}
