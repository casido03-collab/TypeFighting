import { styles } from "../styles/styles";

type SwordAssetProps = {
  variant?: "home" | "battle";
};

export function HeroCharacter() {
  return (
    <svg viewBox="0 0 220 260" style={styles.heroReferenceAsset} aria-hidden="true">
      <CharacterLines />
      <SwordAsset variant="home" />
    </svg>
  );
}

export function BattleCharacter({ enemy = false }: { enemy?: boolean }) {
  return (
    <svg
      viewBox="0 0 220 260"
      style={{ ...styles.battleCharacterAsset, ...(enemy ? styles.battleCharacterEnemy : {}) }}
      aria-hidden="true"
    >
      <CharacterLines />
      <SwordAsset variant="battle" />
    </svg>
  );
}

export function CharacterLines() {
  return (
    <>
      <circle cx="92" cy="54" r="34" fill="#fff" stroke="#000" strokeWidth="10" />
      <line x1="98" y1="88" x2="112" y2="162" stroke="#000" strokeWidth="10" strokeLinecap="round" />
      <line x1="108" y1="106" x2="154" y2="142" stroke="#000" strokeWidth="10" strokeLinecap="round" />
      <line x1="92" y1="108" x2="62" y2="156" stroke="#000" strokeWidth="10" strokeLinecap="round" />
      <line x1="112" y1="160" x2="152" y2="228" stroke="#000" strokeWidth="10" strokeLinecap="round" />
      <line x1="108" y1="160" x2="78" y2="236" stroke="#000" strokeWidth="10" strokeLinecap="round" />
    </>
  );
}

export function SwordAsset({ variant = "battle" }: SwordAssetProps) {
  const transform =
    variant === "home"
      ? "translate(150 42) scale(0.72) rotate(30 34 85)"
      : "translate(146 70) scale(0.54) rotate(30 34 85)";

  return (
    <g transform={transform}>
      <polygon points="34,0 51,20 42,118 28,118 17,20" fill="#111" />
      <polygon points="34,8 45,23 37,112 29,112 23,23" fill="#f8fafc" />
      <polygon points="34,8 45,23 37,112 34,112 34,8" fill="#cbd5e1" opacity="0.9" />
      <polygon points="29,112 37,112 37,137 29,137" fill="#111" />
      <rect x="7" y="108" width="53" height="13" rx="6" fill="#111" />
      <rect x="11" y="110" width="45" height="8" rx="4" fill="#d1d5db" />
      <rect x="27" y="126" width="14" height="38" rx="6" fill="#111" />
      <path d="M29 134h11M28 145h12M28 156h12" stroke="#6b7280" strokeWidth="3" strokeLinecap="round" />
      <circle cx="34" cy="172" r="14" fill="#111" />
      <circle cx="34" cy="172" r="9" fill="#9ca3af" />
      <circle cx="29" cy="168" r="5" fill="#fff" />
    </g>
  );
}

export function TrophyAsset() {
  return (
    <svg viewBox="0 0 80 95" style={{ width: "100%", height: "100%", overflow: "visible" }} aria-hidden="true">
      <rect x="19" y="20" width="42" height="34" rx="6" fill="#facc15" stroke="#111" strokeWidth="5" />
      <path d="M24 24c-20 0-20 26 0 26M56 24c20 0 20 26 0 26" fill="none" stroke="#111" strokeWidth="5" />
      <rect x="33" y="54" width="14" height="16" fill="#facc15" stroke="#111" strokeWidth="4" />
      <rect x="27" y="68" width="28" height="8" rx="4" fill="#facc15" stroke="#111" strokeWidth="4" />
      <text x="40" y="45" textAnchor="middle" fontSize="22" fontWeight="900" fill="#111">1</text>
    </svg>
  );
}
