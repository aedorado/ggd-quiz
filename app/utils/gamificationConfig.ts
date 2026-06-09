export interface XpRewardConfig {
  quizCorrectAnswer: number;
  quizPerfectScoreBonus: number;
  memoryMatchBase: number;
  memoryMatchSpeedBonusUnder15Turns: number;
  memoryMatchSpeedBonusUnder22Turns: number;
  dragDropBase: number;
  dragDropPerfectBonus: number;
  crosswordBasePerLetter: number;
  crosswordNoHintsBonus: number;
  crosswordSpeedBonus: number;
  dailyNectarBase: number;
  dailyNectarStreakMultiplier: number;
  dailyNectarMaxStreakBonus: number;
  badgeUnlockBonus: number;
}

export interface GameUnlockConfig {
  modeId: "quiz" | "memory" | "drag-drop" | "crossword";
  unlockLevel: number;
  displayName: string;
  emoji: string;
  description: string;
  questionsCount?: number;
  cardsCount?: number;
  pairsCount?: number;
}

export interface GamificationConfig {
  xpRewards: XpRewardConfig;
  bookUnlocks: Record<string, number>; // bookId -> unlockLevel
  gameUnlocks: Record<string, GameUnlockConfig>; // modeId -> config
}

export const GAMIFICATION_CONFIG: GamificationConfig = {
  xpRewards: {
    quizCorrectAnswer: 5,
    quizPerfectScoreBonus: 15,
    memoryMatchBase: 15,
    memoryMatchSpeedBonusUnder15Turns: 10,
    memoryMatchSpeedBonusUnder22Turns: 5,
    dragDropBase: 15,
    dragDropPerfectBonus: 10,
    crosswordBasePerLetter: 1, // 1 XP per letter placed
    crosswordNoHintsBonus: 15,
    crosswordSpeedBonus: 10, // solved under 5 minutes (300 seconds)
    dailyNectarBase: 10,
    dailyNectarStreakMultiplier: 5, // +5 XP per day of streak
    dailyNectarMaxStreakBonus: 25,
    badgeUnlockBonus: 50,
  },
  bookUnlocks: {
    ggd: 1,   // Gaura Gaṇoddeśa Dīpikā
    rkgd: 3,  // Rādhā Kṛṣṇa Gaṇoddeśa Dīpikā
    vvs: 6,   // Vraja Vilāsa Stava
    bs: 10,  // Śrī Brahma-saṁhitā
  },
  gameUnlocks: {
    quiz: {
      modeId: "quiz",
      unlockLevel: 1,
      displayName: "Standard Quiz",
      emoji: "📖",
      description: "7 Multiple Choice",
      questionsCount: 7,
    },
    memory: {
      modeId: "memory",
      unlockLevel: 2,
      displayName: "Memory Match",
      emoji: "🧠",
      description: "Match 10 Card Pairs",
      cardsCount: 10,
    },
    "drag-drop": {
      modeId: "drag-drop",
      unlockLevel: 3,
      displayName: "Drag & Drop",
      emoji: "🤝",
      description: "Match 10 Associations",
      pairsCount: 10,
    },
    crossword: {
      modeId: "crossword",
      unlockLevel: 5,
      displayName: "Crossword",
      emoji: "🧩",
      description: "Interactive Puzzle",
    },
  },
};

/**
 * Checks if a book is unlocked for a given level.
 */
export function isBookUnlocked(bookId: string, level: number): boolean {
  const req = GAMIFICATION_CONFIG.bookUnlocks[bookId];
  return req === undefined || level >= req;
}

/**
 * Checks if a game mode is unlocked for a given level.
 */
export function isGameModeUnlocked(modeId: string, level: number): boolean {
  const config = GAMIFICATION_CONFIG.gameUnlocks[modeId];
  return config === undefined || level >= config.unlockLevel;
}
