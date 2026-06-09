"use client";

import { useState, useEffect } from "react";
import { GAMIFICATION_CONFIG } from "./gamificationConfig";

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  type: "quiz" | "game" | "nectar" | "badge" | "levelup";
  description: string;
  xpEarned: number;
}

export interface DevotionalStats {
  level: number;
  xpCurrent: number;
  xpNeeded: number;
  xpTotal: number;
  streak: number;
  lastActiveDate: string | null;
  quizzesTaken: number;
  perfectQuizzes: number;
  gamesPlayed: number; // crossword, memory, drag-drop
  badges: string[]; // IDs of unlocked badges
  lastNectarClaimedDate: string | null;
  activityLog: ActivityLogEntry[];
}

export interface BhaktiRankInfo {
  title: string;
  sanskrit: string;
  desc: string;
  minLevel: number;
  emoji: string;
}

export interface BadgeInfo {
  id: string;
  name: string;
  sanskrit: string;
  desc: string;
  emoji: string;
  color: string;
}

export const BHAKTI_RANKS: BhaktiRankInfo[] = [
  {
    title: "Inquiring Seeker",
    sanskrit: "Śraddhā / Jijñāsu",
    desc: "The seed of faith is sown. You are beginning to inquire into the sublime scriptural truths.",
    minLevel: 1,
    emoji: "🌱"
  },
  {
    title: "Devotional Seeker",
    sanskrit: "Sādhu-saṅga",
    desc: "You are drawing inspiration from the association and teachings of the Gauḍīya Ācāryas.",
    minLevel: 5,
    emoji: "🪷"
  },
  {
    title: "Steady Practitioner",
    sanskrit: "Bhajana-kriyā",
    desc: "Establishing a steady and active daily sādhana of scriptural reading and reflection.",
    minLevel: 10,
    emoji: "📿"
  },
  {
    title: "Purified Soul",
    sanskrit: "Anartha-nivṛtti",
    desc: "Obstacles, doubts, and impurities are cleared from the heart through consistent study.",
    minLevel: 16,
    emoji: "🕯️"
  },
  {
    title: "Steadfast Devotee",
    sanskrit: "Niṣṭhā",
    desc: "Your comprehension and faith in the scriptural conclusions have become firm and unwavering.",
    minLevel: 23,
    emoji: "🌸"
  },
  {
    title: "Tasteful Reader",
    sanskrit: "Ruci",
    desc: "You have developed an exquisite, sweet, and ecstatic taste for reading and contemplating these truths.",
    minLevel: 31,
    emoji: "🦚"
  },
  {
    title: "Attached Devotee",
    sanskrit: "Āsakti",
    desc: "Deep attachment and absorption in the name, form, qualities, and pastimes of the divine couple.",
    minLevel: 41,
    emoji: "💎"
  },
  {
    title: "Scriptural Sage",
    sanskrit: "Bhāva-sphuraṇa",
    desc: "A heart fully illuminated by the ecstatic rays of transcendental knowledge and devotion.",
    minLevel: 51,
    emoji: "👑"
  }
];

export const BADGES: BadgeInfo[] = [
  {
    id: "first_steps",
    name: "First Steps of Faith",
    sanskrit: "Śraddhā-bindu",
    desc: "Complete your first quiz or game round.",
    emoji: "🌱",
    color: "#4A752C"
  },
  {
    id: "steady_sadhana",
    name: "Steady Sadhana",
    sanskrit: "Nitya-sevā",
    desc: "Maintain a 3-day daily study streak.",
    emoji: "🔥",
    color: "#bf6a1f"
  },
  {
    id: "perfectionist",
    name: "Scriptural Scholar",
    sanskrit: "Siddhānta-vit",
    desc: "Achieve a perfect 7/7 score on any quiz.",
    emoji: "🎓",
    color: "#d4a843"
  },
  {
    id: "memory_master",
    name: "Ecstatic Recall",
    sanskrit: "Smaraṇa-siddhi",
    desc: "Complete the Memory Match game in under 15 turns.",
    emoji: "🧠",
    color: "#8b3a5a"
  },
  {
    id: "associations_expert",
    name: "Tattva Guide",
    sanskrit: "Sambandha-jnāna",
    desc: "Complete the Drag & Drop matching game with 100% accuracy.",
    emoji: "🤝",
    color: "#2e7a6a"
  },
  {
    id: "crossword_champion",
    name: "Sūtra Solver",
    sanskrit: "Vyutpanna",
    desc: "Solve a crossword puzzle with zero hints.",
    emoji: "🧩",
    color: "#006064"
  },
  {
    id: "multi_scholar",
    name: "Verse Explorer",
    sanskrit: "Śāstrārtha-kuśala",
    desc: "Complete quiz rounds for 3 different sacred books.",
    emoji: "📜",
    color: "#7a3a1a"
  },
  {
    id: "level_ten",
    name: "Devotional Ascent",
    sanskrit: "Bhakti-sopāna",
    desc: "Reach Level 10 of scriptural absorption.",
    emoji: "💎",
    color: "#e8954a"
  }
];

export const DEFAULT_STATS: DevotionalStats = {
  level: 1,
  xpCurrent: 0,
  xpNeeded: 100,
  xpTotal: 0,
  streak: 0,
  lastActiveDate: null,
  quizzesTaken: 0,
  perfectQuizzes: 0,
  gamesPlayed: 0,
  badges: [],
  lastNectarClaimedDate: null,
  activityLog: []
};

// Formula: XP needed for level L is L * 100
export const getXpNeededForLevel = (lvl: number): number => {
  return lvl * 100;
};

// Given total XP, reconstruct level and current XP
export const calculateLevelFromTotalXp = (totalXp: number): { level: number; xpCurrent: number; xpNeeded: number } => {
  let level = 1;
  let remaining = totalXp;
  let needed = getXpNeededForLevel(level);

  while (remaining >= needed) {
    remaining -= needed;
    level += 1;
    needed = getXpNeededForLevel(level);
  }

  return {
    level,
    xpCurrent: remaining,
    xpNeeded: needed
  };
};

export const getRankForLevel = (level: number): BhaktiRankInfo => {
  let matched = BHAKTI_RANKS[0];
  for (const rank of BHAKTI_RANKS) {
    if (level >= rank.minLevel) {
      matched = rank;
    }
  }
  return matched;
};

// Migrate old structure if needed
export const getOrMigrateStats = (): DevotionalStats => {
  if (typeof window === "undefined") return DEFAULT_STATS;

  try {
    const levelStored = localStorage.getItem("bhakti_level");
    
    // If we already have the level stored, load the modern stats structure
    if (levelStored) {
      const stats: DevotionalStats = {
        level: parseInt(levelStored, 10) || 1,
        xpCurrent: parseInt(localStorage.getItem("bhakti_xp_current") || "0", 10),
        xpNeeded: parseInt(localStorage.getItem("bhakti_xp_needed") || "100", 10),
        xpTotal: parseInt(localStorage.getItem("bhakti_xp_total") || "0", 10),
        streak: parseInt(localStorage.getItem("sadhana_streak") || "0", 10),
        lastActiveDate: localStorage.getItem("sadhana_last_date"),
        quizzesTaken: parseInt(localStorage.getItem("bhakti_quizzes_taken") || "0", 10),
        perfectQuizzes: parseInt(localStorage.getItem("bhakti_perfect_quizzes") || "0", 10),
        gamesPlayed: parseInt(localStorage.getItem("bhakti_games_played") || "0", 10),
        badges: JSON.parse(localStorage.getItem("bhakti_badges") || "[]"),
        lastNectarClaimedDate: localStorage.getItem("last_nectar_claimed_date"),
        activityLog: JSON.parse(localStorage.getItem("bhakti_activity_log") || "[]")
      };
      return stats;
    }

    // Otherwise, perform migration from old variables
    const oldXp = parseInt(localStorage.getItem("bhakti_xp") || "0", 10);
    const oldStreak = parseInt(localStorage.getItem("sadhana_streak") || "0", 10);
    const oldLastDate = localStorage.getItem("sadhana_last_date");
    const oldQuizzes = parseInt(localStorage.getItem("bhakti_quizzes_taken") || "0", 10);

    const calc = calculateLevelFromTotalXp(oldXp);

    const initialLog: ActivityLogEntry[] = [];
    if (oldXp > 0) {
      initialLog.push({
        id: "migration",
        timestamp: new Date().toISOString(),
        type: "levelup",
        description: `Imported progress: Reached Level ${calc.level}!`,
        xpEarned: oldXp
      });
    }

    const migrated: DevotionalStats = {
      level: calc.level,
      xpCurrent: calc.xpCurrent,
      xpNeeded: calc.xpNeeded,
      xpTotal: oldXp,
      streak: oldStreak,
      lastActiveDate: oldLastDate,
      quizzesTaken: oldQuizzes,
      perfectQuizzes: 0,
      gamesPlayed: 0,
      badges: [],
      lastNectarClaimedDate: null,
      activityLog: initialLog
    };

    saveStatsToLocalStorage(migrated);
    return migrated;
  } catch (e) {
    console.error("Failed to load or migrate stats", e);
    return DEFAULT_STATS;
  }
};

const saveStatsToLocalStorage = (stats: DevotionalStats) => {
  if (typeof window === "undefined") return;

  try {
    localStorage.setItem("bhakti_level", stats.level.toString());
    localStorage.setItem("bhakti_xp_current", stats.xpCurrent.toString());
    localStorage.setItem("bhakti_xp_needed", stats.xpNeeded.toString());
    localStorage.setItem("bhakti_xp_total", stats.xpTotal.toString());
    localStorage.setItem("sadhana_streak", stats.streak.toString());
    if (stats.lastActiveDate) localStorage.setItem("sadhana_last_date", stats.lastActiveDate);
    localStorage.setItem("bhakti_quizzes_taken", stats.quizzesTaken.toString());
    localStorage.setItem("bhakti_perfect_quizzes", stats.perfectQuizzes.toString());
    localStorage.setItem("bhakti_games_played", stats.gamesPlayed.toString());
    localStorage.setItem("bhakti_badges", JSON.stringify(stats.badges));
    if (stats.lastNectarClaimedDate) localStorage.setItem("last_nectar_claimed_date", stats.lastNectarClaimedDate);
    localStorage.setItem("bhakti_activity_log", JSON.stringify(stats.activityLog));
    
    // Also update legacy variable just in case
    localStorage.setItem("bhakti_xp", stats.xpTotal.toString());
  } catch (e) {
    console.error("Failed to save stats to local storage", e);
  }
};

export const checkBadgeAchievements = (stats: DevotionalStats): string[] => {
  const newBadges: string[] = [];

  // Helper check
  const hasBadge = (id: string) => stats.badges.includes(id);

  // 1. First Steps of Faith
  if (!hasBadge("first_steps") && (stats.quizzesTaken > 0 || stats.gamesPlayed > 0)) {
    newBadges.push("first_steps");
  }

  // 2. Steady Sadhana (Streak >= 3)
  if (!hasBadge("steady_sadhana") && stats.streak >= 3) {
    newBadges.push("steady_sadhana");
  }

  // 3. Perfectionist (Perfect score quiz >= 1)
  if (!hasBadge("perfectionist") && stats.perfectQuizzes > 0) {
    newBadges.push("perfectionist");
  }

  // 4. Devotional Ascent (Level >= 10)
  if (!hasBadge("level_ten") && stats.level >= 10) {
    newBadges.push("level_ten");
  }

  // Other game-specific badges are awarded directly on completions (memory_master, associations_expert, crossword_champion)
  // because they depend on specific performance metrics like turns or hints.
  // The caller will supply these directly during game completion actions.

  return newBadges;
};

// Custom React Hook
export const useBhaktiProgress = () => {
  const [stats, setStats] = useState<DevotionalStats>(DEFAULT_STATS);
  const [isMounted, setIsMounted] = useState(false);
  const [pendingLevelUp, setPendingLevelUp] = useState<{
    oldLevel: number;
    newLevel: number;
    rankTitle: string;
    newBadges: string[];
  } | null>(null);

  // Load stats on mount
  useEffect(() => {
    setIsMounted(true);
    const loaded = getOrMigrateStats();
    setStats(loaded);
  }, []);

  // Synchronize across multiple components/tabs
  useEffect(() => {
    if (!isMounted) return;

    const syncStats = () => {
      const loaded = getOrMigrateStats();
      setStats(loaded);
    };

    window.addEventListener("storage", syncStats);
    window.addEventListener("bhakti_progress_update", syncStats);
    return () => {
      window.removeEventListener("storage", syncStats);
      window.removeEventListener("bhakti_progress_update", syncStats);
    };
  }, [isMounted]);

  const dispatchUpdateEvent = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("bhakti_progress_update"));
    }
  };

  // Centralized XP adder
  const addXp = (
    xpEarned: number,
    actionType: "quiz" | "game" | "nectar",
    description: string,
    metadata?: {
      isPerfect?: boolean;
      memoryTurns?: number;
      dragAccuracy?: number;
      crosswordHints?: number;
      bookCount?: number;
      forceBadgeId?: string; // direct badge reward
    }
  ) => {
    if (typeof window === "undefined") return;

    const currentStats = getOrMigrateStats();
    const oldLevel = currentStats.level;

    // 1. Update activity counters
    if (actionType === "quiz") {
      currentStats.quizzesTaken += 1;
      if (metadata?.isPerfect) {
        currentStats.perfectQuizzes += 1;
      }
    } else if (actionType === "game") {
      currentStats.gamesPlayed += 1;
    }

    // 2. Add XP
    currentStats.xpTotal += xpEarned;
    currentStats.xpCurrent += xpEarned;

    // Log the base activity
    const activityId = `act-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    currentStats.activityLog.unshift({
      id: activityId,
      timestamp: new Date().toISOString(),
      type: actionType,
      description,
      xpEarned
    });

    // 3. Process Levels & Level Ups
    let leveledUp = false;
    let tempLevel = currentStats.level;
    let tempCurrent = currentStats.xpCurrent;
    let tempNeeded = currentStats.xpNeeded;

    while (tempCurrent >= tempNeeded) {
      tempCurrent -= tempNeeded;
      tempLevel += 1;
      tempNeeded = getXpNeededForLevel(tempLevel);
      leveledUp = true;

      // Log the level up
      currentStats.activityLog.unshift({
        id: `lvl-${Date.now()}-${tempLevel}`,
        timestamp: new Date().toISOString(),
        type: "levelup",
        description: `Conratulations! Ascended to Level ${tempLevel}`,
        xpEarned: 0
      });
    }

    currentStats.level = tempLevel;
    currentStats.xpCurrent = tempCurrent;
    currentStats.xpNeeded = tempNeeded;

    // 4. Update Streak / Activity Date
    const todayStr = new Date().toDateString();
    if (currentStats.lastActiveDate !== todayStr) {
      if (currentStats.lastActiveDate) {
        const lastDate = new Date(currentStats.lastActiveDate);
        const today = new Date(todayStr);
        const diffTime = Math.abs(today.getTime() - lastDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
          currentStats.streak += 1;
        } else {
          currentStats.streak = 1;
        }
      } else {
        currentStats.streak = 1;
      }
      currentStats.lastActiveDate = todayStr;
    }

    // 5. Evaluate and award badges
    const newlyUnlockedBadges = checkBadgeAchievements(currentStats);

    // Apply manual context-based badges
    if (metadata?.memoryTurns !== undefined && metadata.memoryTurns <= 15 && !currentStats.badges.includes("memory_master")) {
      newlyUnlockedBadges.push("memory_master");
    }
    if (metadata?.dragAccuracy !== undefined && metadata.dragAccuracy === 100 && !currentStats.badges.includes("associations_expert")) {
      newlyUnlockedBadges.push("associations_expert");
    }
    if (metadata?.crosswordHints !== undefined && metadata.crosswordHints === 0 && !currentStats.badges.includes("crossword_champion")) {
      newlyUnlockedBadges.push("crossword_champion");
    }
    if (metadata?.bookCount !== undefined && metadata.bookCount >= 3 && !currentStats.badges.includes("multi_scholar")) {
      newlyUnlockedBadges.push("multi_scholar");
    }
    if (metadata?.forceBadgeId && !currentStats.badges.includes(metadata.forceBadgeId)) {
      newlyUnlockedBadges.push(metadata.forceBadgeId);
    }

    // Award bonus XP for each newly unlocked badge (+50 XP!)
    if (newlyUnlockedBadges.length > 0) {
      newlyUnlockedBadges.forEach(badgeId => {
        const badge = BADGES.find(b => b.id === badgeId);
        if (badge) {
          currentStats.badges.push(badgeId);
          const bonusXp = GAMIFICATION_CONFIG.xpRewards.badgeUnlockBonus;
          currentStats.xpTotal += bonusXp;
          currentStats.xpCurrent += bonusXp;
          
          currentStats.activityLog.unshift({
            id: `badge-${badgeId}-${Date.now()}`,
            timestamp: new Date().toISOString(),
            type: "badge",
            description: `Unlocked Badge: ${badge.name}! (+${bonusXp} XP Bonus)`,
            xpEarned: bonusXp
          });
        }
      });

      // Recalculate level after badge bonuses
      while (currentStats.xpCurrent >= currentStats.xpNeeded) {
        currentStats.xpCurrent -= currentStats.xpNeeded;
        currentStats.level += 1;
        currentStats.xpNeeded = getXpNeededForLevel(currentStats.level);
        leveledUp = true;
        
        currentStats.activityLog.unshift({
          id: `lvl-bonus-${Date.now()}-${currentStats.level}`,
          timestamp: new Date().toISOString(),
          type: "levelup",
          description: `Ascended to Level ${currentStats.level} (via achievement bonus!)`,
          xpEarned: 0
        });
      }
    }

    // Limit log size to 30 items
    if (currentStats.activityLog.length > 30) {
      currentStats.activityLog = currentStats.activityLog.slice(0, 30);
    }

    saveStatsToLocalStorage(currentStats);
    setStats(currentStats);
    dispatchUpdateEvent();

    if (leveledUp) {
      const rank = getRankForLevel(currentStats.level);
      setPendingLevelUp({
        oldLevel,
        newLevel: currentStats.level,
        rankTitle: `${rank.title} (${rank.sanskrit})`,
        newBadges: newlyUnlockedBadges
      });
    }
  };

  const claimDailyNectar = () => {
    if (typeof window === "undefined") return false;

    const currentStats = getOrMigrateStats();
    const todayStr = new Date().toDateString();

    if (currentStats.lastNectarClaimedDate === todayStr) {
      return false; // already claimed today
    }

    // Base nectar reward
    const baseReward = GAMIFICATION_CONFIG.xpRewards.dailyNectarBase;
    
    // Streak reward: streak multiplier extra per day of streak, capped at max streak bonus
    const streakBonus = Math.min(
      (currentStats.streak || 1) * GAMIFICATION_CONFIG.xpRewards.dailyNectarStreakMultiplier,
      GAMIFICATION_CONFIG.xpRewards.dailyNectarMaxStreakBonus
    );
    const totalEarned = baseReward + streakBonus;

    currentStats.lastNectarClaimedDate = todayStr;
    saveStatsToLocalStorage(currentStats);
    
    // Trigger progress update with XP
    addXp(totalEarned, "nectar", `Daily Sadhana: Read Nectar Drop! (Streak Bonus: +${streakBonus} XP)`);
    return true;
  };

  const clearLevelUp = () => {
    setPendingLevelUp(null);
  };

  const resetProgress = () => {
    if (typeof window === "undefined") return;
    if (confirm("Are you sure you want to reset all your devotional progress, levels, and badges? This cannot be undone.")) {
      saveStatsToLocalStorage(DEFAULT_STATS);
      setStats(DEFAULT_STATS);
      dispatchUpdateEvent();
    }
  };

  return {
    isMounted,
    stats,
    currentRank: getRankForLevel(stats.level),
    pendingLevelUp,
    clearLevelUp,
    addXp,
    claimDailyNectar,
    resetProgress
  };
};
