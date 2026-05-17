export const MAX_HP = 120;
export const HIT_DAMAGE = 15;
export const ATTACK_MS = 360;
export const FALL_MS = 720;
export const RECOVER_MS = 520;
export const TOTAL_HURT_MS = FALL_MS + RECOVER_MS;
export const KEYBOARD_ZONE_HEIGHT = 310;
export const ENERGY_MAX = 50;

export const WORDS = [
  "меч",
  "щит",
  "бой",
  "ход",
  "маг",
  "лук",
  "лед",
  "жар",
  "удар",
  "цель",
  "волк",
  "буря",
  "воин",
  "арка",
  "руна",
  "тень",
  "лава",
  "гром",
  "сила",
  "плащ",
  "пламя",
  "сталь",
  "копье",
  "клин",
  "шлем",
  "искра",
  "топор",
  "рывок",
  "арена",
  "битва",
  "герой",
  "заряд",
  "скала",
  "знамя",
  "квест",
  "слава",
  "огонь",
  "ветер",
  "атака",
  "замок",
  "дракон",
  "молния",
  "победа",
  "защита",
  "камень",
  "рыцарь",
  "стрела",
  "башня",
  "корона",
  "пульс",
];

export const LEADERS = [
  { rank: 1, name: "SHADOW", league: "MYTHIC", wpm: 412, wins: "98%", streak: 12, color: "#a855f7" },
  { rank: 2, name: "BLADE", league: "DIAMOND", wpm: 399, wins: "94%", streak: 9, color: "#38bdf8" },
  { rank: 3, name: "SPEEDY", league: "DIAMOND", wpm: 378, wins: "92%", streak: 7, color: "#fb923c" },
  { rank: 4, name: "NINJA", league: "DIAMOND", wpm: 356, wins: "90%", streak: 6, color: "#84cc16" },
  { rank: 5, name: "TYPERX", league: "PLATINUM", wpm: 334, wins: "87%", streak: 5, color: "#22d3ee" },
  { rank: 24, name: "CASE D", league: "SILVER II", wpm: 288, wins: "71%", streak: 5, color: "#fde047", me: true },
  { rank: 25, name: "FLASH", league: "SILVER II", wpm: 284, wins: "70%", streak: 4, color: "#a855f7" },
];

export const PLAYER = {
  name: "CASE D",
  league: "Silver League",
  leagueCode: "SILVER II",
  rank: 24,
  score: 2880,
  nextLeague: "GOLD LEAGUE",
  nextScore: 3000,
  wins: 71,
  losses: 29,
  winRate: "71%",
  bestCombo: 12,
  wpm: 288,
  streak: 5,
  invited: 8,
};
