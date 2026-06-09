# Bhakti Progression & XP System Guide

This document explains the architecture, formulas, and configurations of the **Bhakti Progression XP System** in **Tattva Darpaṇa**. Use this guide to adjust XP rewards, levels, ranks, unlockable badges, or sound frequencies.

---

## 📂 Key Codebase Mappings

- **Progression Logic & Configurations:** [`app/utils/bhaktiProgress.ts`](file:///Users/anuragsharma/Desktop/ggd-quiz/app/utils/bhaktiProgress.ts)
  - This file contains the types, mathematical formulas, badge criteria, and the React custom hook (`useBhaktiProgress`) that orchestrates the system.
- **Sādhana Dashboard Panel:** [`app/components/SadhanaDashboard.tsx`](file:///Users/anuragsharma/Desktop/ggd-quiz/app/components/SadhanaDashboard.tsx)
  - The overlay modal component displaying level progression bars, unlocked achievements, active streaks, and recent activity logs.
- **Level Up Celebration Screen:** [`app/components/LevelUpModal.tsx`](file:///Users/anuragsharma/Desktop/ggd-quiz/app/components/LevelUpModal.tsx)
  - An overlay modal triggered automatically on level-up. It initiates the falling flower particle rain (Puṣpa Vṛṣṭi) and plays Yamaha Raga flute chords using the browser's Web Audio API.
- **Visual Stylesheets:** [`app/globals.css`](file:///Users/anuragsharma/Desktop/ggd-quiz/app/globals.css)
  - Contains CSS layouts, animations, and typography variables for progression badges and the dashboard overlays.

---

## 📈 Leveling & Progression Formulas

### 1. Level-Up Threshold
The XP required to level up grows progressively as the user's level increases. The formula is defined inside `getXpNeededForLevel`:
$$\text{XP Needed for Level } L = L \times 100$$

- **Level 1 $\rightarrow$ 2:** 100 XP
- **Level 2 $\rightarrow$ 3:** 200 XP
- **Level 3 $\rightarrow$ 4:** 300 XP
- **Level 10 $\rightarrow$ 11:** 1,000 XP

### 2. Customizing Level Speeds
To change the leveling difficulty, edit `getXpNeededForLevel` in `bhaktiProgress.ts`:
```typescript
// To make it slower/steeper, increase the multiplier or make it exponential:
export const getXpNeededForLevel = (lvl: number): number => {
  return lvl * 150; // Slower leveling
};
```

---

## 🏅 Bhakti Steps & Ranks (Sopāna)

Ranks correspond to spiritual steps in devotional practice, mapped to Level numbers in `BHAKTI_RANKS`:

| Level Range | Rank Title | Sanskrit Step |
| :--- | :--- | :--- |
| **Level 1–4** | Inquiring Seeker | *Śraddhā / Jijñāsu* |
| **Level 5–9** | Devotional Seeker | *Sādhu-saṅga* |
| **Level 10–15** | Steady Practitioner | *Bhajana-kriyā* |
| **Level 16–22** | Purified Soul | *Anartha-nivṛtti* |
| **Level 23–30** | Steadfast Devotee | *Niṣṭhā* |
| **Level 31–40** | Tasteful Reader | *Ruci* |
| **Level 41–50** | Attached Devotee | *Āsakti* |
| **Level 51+** | Scriptural Sage | *Bhāva-sphuraṇa* |

### Adding or Modifying Ranks
Modify the `BHAKTI_RANKS` array in `bhaktiProgress.ts`. Keep `minLevel` fields in ascending order:
```typescript
export const BHAKTI_RANKS: BhaktiRankInfo[] = [
  {
    title: "New Rank Title",
    sanskrit: "Sanskrit Term",
    desc: "A descriptive explanation of this step.",
    minLevel: 12,
    emoji: "📿"
  },
  // ...
];
```

---

## 🏆 XP Rewards Configuration

The current default awards are defined across different game views:

### 1. Standard Quizzes
- **Correct Answer:** $+5\text{ XP}$ per correct answer (awarded in `handleQuizComplete`).
- **Perfect Score Bonus:** $+15\text{ XP}$ (awarded if $7/7$ correct).

### 2. Memory Match
- **Completion:** $+15\text{ XP}$ base (awarded in `handleGameComplete`).
- **Speed Bonus (Turns):** 
  - $\le 15\text{ turns: } +10\text{ XP}$
  - $\le 22\text{ turns: } +5\text{ XP}$

### 3. Drag & Drop
- **Completion:** $+15\text{ XP}$ base.
- **Accuracy Bonus:** $+10\text{ XP}$ if completed with $100\%$ accuracy (i.e. completed in exactly 6 moves).

### 4. Crossword Puzzles
- **Completion:** $+25\text{ XP}$ base minus hints used (capped at $+5\text{ XP}$ floor).
- **Achievements:** 
  - Zero Hints used: $+15\text{ XP}$ bonus.
  - Completed under 5 minutes (300 seconds): $+10\text{ XP}$ bonus.

### 5. Daily Sadhana (Nectar Card Draw)
- **Daily Reading:** $+10\text{ XP}$ base (claimed once per calendar day).
- **Streak Multiplier:** $+5\text{ XP}$ extra per day of consecutive streak (capped at a maximum bonus of $+25\text{ XP}$).

---

## 🎖️ Devotional Achievements (Badges)

Achievements (called *Utsāha-mudrās*) are configured in the `BADGES` array. Unlocking a badge awards the player a **$+50\text{ XP}$ bonus**.

### Existing Badges
1. **🌱 First Steps of Faith** (`first_steps`): Complete your first quiz or game round.
2. **🔥 Steady Sadhana** (`steady_sadhana`): Maintain a 3-day daily study streak.
3. **🎓 Scriptural Scholar** (`perfectionist`): Achieve a perfect 7/7 score on any quiz.
4. **🧠 Ecstatic Recall** (`memory_master`): Complete Memory Match in under 15 turns.
5. **🤝 Tattva Guide** (`associations_expert`): Complete Drag & Drop with 100% accuracy.
6. **🧩 Sūtra Solver** (`crossword_champion`): Complete a crossword with zero hints.
7. **📜 Verse Explorer** (`multi_scholar`): Complete quiz rounds for 3 different books.
8. **💎 Devotional Ascent** (`level_ten`): Reach Level 10.

### Adding a New Badge
1. Declare the badge in the `BADGES` array:
   ```typescript
   {
     id: "crossword_speedster",
     name: "Syllable Speedrun",
     sanskrit: "Śīghra-siddhi",
     desc: "Complete any crossword in under 3 minutes.",
     emoji: "⚡",
     color: "#fbbf24"
   }
   ```
2. Add logic to check for it in `checkBadgeAchievements` or evaluate it directly on game completion inside `addXp`:
   ```typescript
   // Inside addXp checking:
   if (metadata?.crosswordSeconds && metadata.crosswordSeconds < 180 && !currentStats.badges.includes("crossword_speedster")) {
     newlyUnlockedBadges.push("crossword_speedster");
   }
   ```

---

## 🎵 Bansuri Flute Sound (Web Audio API)

Sound in `LevelUpModal.tsx` is fully synthesized in client code, avoiding separate `.mp3` dependencies. Frequencies align with **Raga Yaman/Bhupali** pentatonic notes:

```typescript
// Yamaha scale arpeggio notes played sequentially in Yaman Raga
playNote(293.66, 0.0, 0.9, 0.12);    // D4
playNote(329.63, 0.18, 0.9, 0.12);   // E4
playNote(369.99, 0.36, 0.9, 0.12);   // F#4
playNote(440.00, 0.54, 1.1, 0.15);   // A4
playNote(587.33, 0.76, 1.5, 0.18);   // D5
playNote(739.99, 1.1, 2.0, 0.12);    // F#5
```

- **Note Frequency:** Frequencies correspond to standard equal temperament pitches.
- **Timing:** Delay and duration variables control arpeggiation speed.
- **Oscillator Type:** `"sine"` matches the round, pure tone of a bamboo bansuri. A low-frequency oscillator (LFO) adds vibrato.
