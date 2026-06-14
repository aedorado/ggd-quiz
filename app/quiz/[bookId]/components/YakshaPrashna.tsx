"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { GAMIFICATION_CONFIG } from "../../../utils/gamificationConfig";

// Grid dimensions (must be odd for DFS/SAW carving: 9x9)
const GRID_SIZE = 9;

// Coordinate point
interface Point {
  col: number;
  row: number;
}

// Cell definition
interface Cell {
  col: number;
  row: number;
  type: "empty" | "tree" | "collectible" | "obstacle" | "start" | "destination" | "tulasi" | "whirlpool" | "lamp" | "sandalwood";
  obstacleName?: string;
  collectibleType?: "pot" | "lotus";
}

interface Entity {
  name: string;
  type: string;
  lila: string;
  attributes?: { att: string; verse: string }[];
  relations?: { type: string; target_id: string; verse: string }[];
  incarnation_of?: any[];
  mentioned_in?: string[];
}

interface Riddle {
  type: "identity" | "standard" | "boolean";
  correctName: string;
  clue: string;
  options: string[];
  explanation?: string;
  verseRef?: string;
  verseText?: string;
}

interface YakshaPrashnaProps {
  bookId: string;
  bookQuestions: any[];
  playCorrectSound: () => void;
  playWrongSound: () => void;
  triggerParticles: () => void;
  onClose: () => void;
  onComplete: (xpEarned: number, heartsLeft: number, potsCollected: number) => void;
}

// Helper to clean generic clues
const isGenericClue = (text: string): boolean => {
  const lower = text.toLowerCase().trim();
  const clean = lower.replace(/^(a|an|the|this)\s+/, "");
  const genericPhrases = [
    "appeared as a devotee in gaura-lila",
    "appeared as a devotee in krsna-lila",
    "appeared as a devotee in krishna-lila",
    "appeared as a devotee in caitanya-lila",
    "appeared as a devotee",
    "appeared as a saintly devotee",
    "an associate appearing in gaura-lila",
    "an associate in gaura-lila",
    "associate appearing in gaura-lila",
    "associate in gaura-lila",
    "gopi present in krishna-lila",
    "gopi present in krsna-lila",
    "gopi from the eternal pastimes",
    "vraja-gopi residing in vraja",
    "cowherd damsel of vraja",
    "cowherd damsel of vrajabhumi",
    "cowherd damsel from vraja",
    "cowherd damsel residing in vraja",
    "resident of vraja",
    "resident of vrajabhumi",
    "resident of vrndavana",
    "gopi of vraja-lila",
    "appeared in gaura-lila",
    "appeared in krishna-lila",
    "appeared in krsna-lila",
    "appeared in caitanya's pastimes",
    "appeared in lord caitanya's pastimes",
    "appeared in lord caitanya",
    "an associate of lord caitanya",
    "associate of lord caitanya",
    "a devotee of lord caitanya",
    "devotee of lord caitanya",
    "devotee in gaura-lila",
    "devotee in krishna-lila",
    "devotee in krsna-lila",
    "associate of caitanya",
    "devotee of caitanya",
    "gopi in krishna-lila",
    "gopi in krsna-lila",
    "gopi in gaura-lila",
    "cowherd boy in caitanya's pastimes",
    "cowherd boy in vraja",
    "cowherd boy in vrajabhumi",
    "cowherd boy of vraja",
    "cowherd friend of lord krishna",
    "cowherd friend of lord krsna",
    "cowherd friend of krishna",
    "cowherd friend of krsna",
    "cowherd friend in vrajabhumi",
    "cowherd friend in vraja",
    "gopi residing in vraja",
    "vraja-gopi from the eternal pastimes",
    "associate appearing in gaura lila",
    "devotee in gaura lila",
    "devotee in krsna lila",
    "devotee in krishna lila",
    "cowherd boy residing in vraja",
    "cowherd friend residing in vraja",
    "servant of lord caitanya",
    "servant of lord caitanya mahaprabhu",
    "servant of caitanya",
    "servant of lord krsna",
    "servant of lord krishna",
    "servant of krishna",
    "servant of krsna",
    "servant in vrndavana",
    "servant in vraja",
    "servant in vrajabhumi",
    "servant of krsna in vrndavana",
    "servant of krishna in vrndavana",
    "cowherd damsel of vrndavana",
    "cowherd damsel of vrndavana-dhama"
  ];
  if (genericPhrases.includes(clean)) return true;
  const genericPattern = /^(appeared as a )?(devotee|saintly devotee|associate|gopi|vraja-gopi|cowherd damsel|cowherd boy|resident|servant)\s+(in|of|present in|appearing in|residing in|from|from the)\s+(gaura[- ]lila|krishna[- ]lila|krsna[- ]lila|caitanya[- ]lila|vraja|vrajabhumi|vrndavana|caitanya|lord caitanya's? pastimes|the eternal pastimes|eternal pastimes|puri)$/;
  return genericPattern.test(clean);
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const LAKE_THEMES = {
  gauri: {
    boardBg: "#b5d3cd", // Soft turquoise/sandy water bg
    boardBorder: "4px solid var(--saffron)", // Warm saffron border
    cellBgEmpty: "#dcece8", // Light walkable path
    cellBgTree: "#9dbbb5", // Muted reeds/deep water wall
    cellBgStart: "#a2c6bf",
    cellBgObstacle: "#d29c9c", // Soft red
    cellBgDestination: "rgba(212, 168, 67, 0.3)",
    dpadBg: "var(--parchment-dk)",
    dpadColor: "var(--ink-mid)",
  },
  shyama: {
    boardBg: "#0c1622", // Mystical dark night lake water
    boardBorder: "4px solid var(--saffron)", // Peacock green border
    cellBgEmpty: "#1a2936", // Dark walkable path
    cellBgTree: "#070f16", // Deepest black-indigo reeds/walls
    cellBgStart: "#1b3a4b",
    cellBgObstacle: "#451515", // Deep crimson red
    cellBgDestination: "rgba(16, 185, 129, 0.25)",
    dpadBg: "var(--parchment-dk)",
    dpadColor: "var(--ink-mid)",
  }
};

export default function YakshaPrashna({
  bookId,
  bookQuestions,
  playCorrectSound,
  playWrongSound,
  triggerParticles,
  onClose,
  onComplete,
}: YakshaPrashnaProps) {
  const [theme, setTheme] = useState<"gauri" | "shyama">("gauri");

  useEffect(() => {
    const activeTheme = (document.documentElement.getAttribute("data-theme") as "gauri" | "shyama") || "gauri";
    setTheme(activeTheme);

    const observer = new MutationObserver(() => {
      const currentTheme = (document.documentElement.getAttribute("data-theme") as "gauri" | "shyama") || "gauri";
      setTheme(currentTheme);
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });

    return () => observer.disconnect();
  }, []);

  const lakeTheme = LAKE_THEMES[theme] || LAKE_THEMES.gauri;

  const [isMobile, setIsMobile] = useState(false);
  const [grid, setGrid] = useState<Cell[][]>([]);
  const [playerPos, setPlayerPos] = useState<Point>({ col: 0, row: GRID_SIZE - 1 });
  const [prevPos, setPrevPos] = useState<Point>({ col: 0, row: GRID_SIZE - 1 });
  const [hearts, setHearts] = useState<number>(3);
  const [pots, setPots] = useState<number>(0);
  const [riddles, setRiddles] = useState<Riddle[]>([]);
  const [activeRiddle, setActiveRiddle] = useState<Riddle | null>(null);
  const [activeRiddlePos, setActiveRiddlePos] = useState<Point | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [showRiddleExplanation, setShowRiddleExplanation] = useState<boolean>(false);
  const [gameState, setGameState] = useState<"loading" | "playing" | "victory" | "gameover">("loading");
  const [seconds, setSeconds] = useState<number>(0);
  const [hasShield, setHasShield] = useState<boolean>(false);
  const [hasLamp, setHasLamp] = useState<boolean>(false);
  const [lampUsed, setLampUsed] = useState<boolean>(false);
  const [shieldTriggered, setShieldTriggered] = useState<boolean>(false);
  const [isTeleporting, setIsTeleporting] = useState<boolean>(false);

  const timerRef = useRef<any>(null);

  // Resize listener for mobile responsiveness
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Helper to count carved (empty) neighbors around a coordinate
  const countCarvedNeighbors = (c: number, r: number, tempGrid: Cell[][]): number => {
    let count = 0;
    const dirs = [
      { col: c - 1, row: r },
      { col: c + 1, row: r },
      { col: c, row: r - 1 },
      { col: c, row: r + 1 }
    ];
    for (const d of dirs) {
      if (
        d.col >= 0 && d.col < GRID_SIZE &&
        d.row >= 0 && d.row < GRID_SIZE &&
        tempGrid[d.row][d.col].type !== "tree"
      ) {
        count++;
      }
    }
    return count;
  };

  // Carve a unique path using a Self-Avoiding Walk from bottom-left to top-right
  const generateUniquePathMaze = useCallback(() => {
    let attempts = 0;
    while (attempts < 2000) {
      attempts++;

      // Determine minimum path length threshold to avoid infinite loops
      let minLength = 25;
      if (attempts > 1200) {
        minLength = 17;
      } else if (attempts > 800) {
        minLength = 21;
      }

      // Initialize all grid cells as walls (tree)
      const tempGrid: Cell[][] = [];
      for (let r = 0; r < GRID_SIZE; r++) {
        const rowCells: Cell[] = [];
        for (let c = 0; c < GRID_SIZE; c++) {
          rowCells.push({ col: c, row: r, type: "tree" });
        }
        tempGrid.push(rowCells);
      }

      // Start position (bottom-left)
      const start: Point = { col: 0, row: GRID_SIZE - 1 };
      const dest: Point = { col: GRID_SIZE - 1, row: 0 };

      tempGrid[start.row][start.col].type = "empty";

      const path: Point[] = [start];
      let current = start;
      let solved = false;

      // Self-avoiding walk path carver (no inner backtracking to prevent hangs)
      while (true) {
        if (current.col === dest.col && current.row === dest.row) {
          if (path.length >= minLength) {
            solved = true;
          }
          break;
        }

        // Gather neighbors
        const neighbors = [
          { col: current.col - 1, row: current.row },
          { col: current.col + 1, row: current.row },
          { col: current.col, row: current.row - 1 },
          { col: current.col, row: current.row + 1 }
        ];

        // Filter valid neighbors
        // Must be tree (uncarved) AND have at most 1 carved neighbor (its predecessor)
        const validNeighbors = neighbors.filter(n => {
          if (n.col < 0 || n.col >= GRID_SIZE || n.row < 0 || n.row >= GRID_SIZE) return false;
          if (tempGrid[n.row][n.col].type !== "tree") return false;

          // To prevent loops/shortcuts, the target cell must only touch the current cell
          return countCarvedNeighbors(n.col, n.row, tempGrid) <= 1;
        });

        if (validNeighbors.length > 0) {
          // Shuffle completely at random to let the path wander (no distance sorting)
          const shuffled = shuffle(validNeighbors);
          const next = shuffled[0];

          tempGrid[next.row][next.col].type = "empty";
          path.push(next);
          current = next;
        } else {
          // Stuck in a dead end, abort this attempt
          break;
        }
      }

      if (!solved) continue;

      // Mark Start & Destination
      tempGrid[start.row][start.col].type = "start";
      tempGrid[dest.row][dest.col].type = "destination";

      // Carve 3-4 side dead-end corridors branching off the main path
      const mainPathPoints = [...path];
      let branchesCount = 0;
      for (const p of mainPathPoints) {
        if (branchesCount >= 4) break;
        if (p.col === start.col && p.row === start.row) continue;
        if (p.col === dest.col && p.row === dest.row) continue;

        if (Math.random() < 0.12) {
          const dirs = shuffle([
            { col: p.col - 1, row: p.row },
            { col: p.col + 1, row: p.row },
            { col: p.col, row: p.row - 1 },
            { col: p.col, row: p.row + 1 }
          ]);

          for (const d of dirs) {
            if (
              d.col >= 0 && d.col < GRID_SIZE &&
              d.row >= 0 && d.row < GRID_SIZE &&
              tempGrid[d.row][d.col].type === "tree" &&
              countCarvedNeighbors(d.col, d.row, tempGrid) <= 1
            ) {
              // Carve first branch node
              tempGrid[d.row][d.col].type = "empty";

              // Try carving one step further
              const subDirs = shuffle([
                { col: d.col - 1, row: d.row },
                { col: d.col + 1, row: d.row },
                { col: d.col, row: d.row - 1 },
                { col: d.col, row: d.row + 1 }
              ]);
              for (const sd of subDirs) {
                if (
                  sd.col >= 0 && sd.col < GRID_SIZE &&
                  sd.row >= 0 && sd.row < GRID_SIZE &&
                  tempGrid[sd.row][sd.col].type === "tree" &&
                  countCarvedNeighbors(sd.col, sd.row, tempGrid) <= 1
                ) {
                  tempGrid[sd.row][sd.col].type = "empty";
                  break;
                }
              }

              branchesCount++;
              break;
            }
          }
        }
      }

      // Gather carved empty cells to place items and obstacles
      const emptyCells: Point[] = [];
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          if (tempGrid[r][c].type === "empty") {
            emptyCells.push({ col: c, row: r });
          }
        }
      }

      if (emptyCells.length < 15) continue;

      const shuffledCells = shuffle(emptyCells);

      // Place 3 Nectar Pots
      for (let i = 0; i < 3; i++) {
        if (shuffledCells.length === 0) break;
        const pt = shuffledCells.pop()!;
        tempGrid[pt.row][pt.col].type = "collectible";
        tempGrid[pt.row][pt.col].collectibleType = Math.random() > 0.4 ? "pot" : "lotus";
      }

      // Place 5 Yaksha Guards
      for (let i = 0; i < 5; i++) {
        if (shuffledCells.length === 0) break;
        const pt = shuffledCells.pop()!;
        tempGrid[pt.row][pt.col].type = "obstacle";
        tempGrid[pt.row][pt.col].obstacleName = `Yaksha Guard #${i + 1}`;
      }

      // Place 1 Tulasi Leaf (Divine Shield)
      if (shuffledCells.length > 0) {
        const pt = shuffledCells.pop()!;
        tempGrid[pt.row][pt.col].type = "tulasi";
      }

      // Place 1 Mystical Whirlpool (Āvarta)
      if (shuffledCells.length > 0) {
        const pt = shuffledCells.pop()!;
        tempGrid[pt.row][pt.col].type = "whirlpool";
      }

      // Place 1 Ghee Lamp (Dīpa)
      if (shuffledCells.length > 0) {
        const pt = shuffledCells.pop()!;
        tempGrid[pt.row][pt.col].type = "lamp";
      }

      // Place 1 Sandalwood Paste (Candana)
      if (shuffledCells.length > 0) {
        const pt = shuffledCells.pop()!;
        tempGrid[pt.row][pt.col].type = "sandalwood";
      }

      setGrid(tempGrid);
      setPlayerPos({ col: 0, row: GRID_SIZE - 1 });
      setPrevPos({ col: 0, row: GRID_SIZE - 1 });
      return;
    }

    // Fallback simple grid if attempts exceeded
    const fallbackGrid: Cell[][] = Array.from({ length: GRID_SIZE }, (_, r) =>
      Array.from({ length: GRID_SIZE }, (_, c) => ({
        col: c,
        row: r,
        type: (r === GRID_SIZE - 1 && c === 0) ? "start" : (r === 0 && c === GRID_SIZE - 1) ? "destination" : "empty",
      }))
    );
    setGrid(fallbackGrid);
    setPlayerPos({ col: 0, row: GRID_SIZE - 1 });
    setPrevPos({ col: 0, row: GRID_SIZE - 1 });
  }, []);

  // Initialize data and load expanded riddle pool
  useEffect(() => {
    async function initData() {
      try {
        const res = await fetch(`/${bookId}/identities.json`);
        if (!res.ok) throw new Error("Failed to load identities");
        const data = await res.json();

        const entities: Record<string, Entity> = data.entities || {};
        const verses: Record<string, { text?: string; content?: string }> = data.verses || {};

        const parsedRiddles: Riddle[] = [];
        const personalities = Object.entries(entities).filter(
          ([_, ent]) => ent.type === "personality" && ent.name
        );

        // 1. ADD IDENTITY RIDDLES
        for (const [id, entity] of personalities) {
          const clues: { text: string; ref: string }[] = [];

          if (entity.attributes) {
            entity.attributes.forEach((attr) => {
              if (attr.att && !isGenericClue(attr.att)) {
                clues.push({
                  text: attr.att.charAt(0).toUpperCase() + attr.att.slice(1),
                  ref: attr.verse || entity.mentioned_in?.[0] || ""
                });
              }
            });
          }

          if (entity.relations) {
            entity.relations.forEach((rel) => {
              const targetName = entities[rel.target_id]?.name || rel.target_id;
              const relType = rel.type.replace(/_/g, " ");
              clues.push({
                text: `Stands in relation of ${relType} to ${targetName}`,
                ref: rel.verse || entity.mentioned_in?.[0] || ""
              });
            });
          }

          if (entity.incarnation_of) {
            entity.incarnation_of.forEach((inc) => {
              const prevId = typeof inc === "object" && inc !== null ? inc.id : inc;
              const prevName = entities[prevId]?.name || prevId;
              const verse = typeof inc === "object" && inc !== null ? inc.verse : (entity.mentioned_in?.[0] || "");
              clues.push({
                text: `Formerly / eternally appeared as ${prevName}`,
                ref: verse || ""
              });
            });
          }

          if (clues.length > 0) {
            clues.forEach((c) => {
              const distractors = personalities
                .filter(([pId, _]) => pId !== id)
                .map(([_, pEnt]) => pEnt.name);
              const shuffledDistractors = shuffle(distractors).slice(0, 3);
              const options = shuffle([...shuffledDistractors, entity.name]);

              const verseObj = verses[c.ref];
              const verseText = verseObj ? (verseObj.text || (verseObj as any).content || "") : "";

              parsedRiddles.push({
                type: "identity",
                correctName: entity.name,
                clue: `Identify this personality: "${c.text}"`,
                options,
                verseRef: c.ref,
                verseText
              });
            });
          }
        }

        // 2. ADD TRUE/FALSE RELATIONAL QUESTIONS
        personalities.forEach(([_, entity]) => {
          if (entity.relations && entity.relations.length > 0) {
            entity.relations.forEach((rel) => {
              const targetName = entities[rel.target_id]?.name || rel.target_id;
              const relType = rel.type.replace(/_/g, " ");
              const verseObj = verses[rel.verse || ""];
              const verseText = verseObj ? (verseObj.text || (verseObj as any).content || "") : "";

              parsedRiddles.push({
                type: "boolean",
                correctName: "True",
                clue: `True or False: ${entity.name} is the ${relType} of ${targetName}.`,
                options: ["True", "False"],
                verseRef: rel.verse,
                verseText,
                explanation: `Verified in scripture: ${entity.name} is indeed the ${relType} of ${targetName}.`
              });

              const otherPersonalities = personalities.filter(([_, p]) => p.name !== targetName && p.name !== entity.name);
              if (otherPersonalities.length > 0) {
                const randomWrongName = otherPersonalities[Math.floor(Math.random() * otherPersonalities.length)][1].name;
                parsedRiddles.push({
                  type: "boolean",
                  correctName: "False",
                  clue: `True or False: ${entity.name} is the ${relType} of ${randomWrongName}.`,
                  options: ["True", "False"],
                  verseRef: rel.verse,
                  verseText,
                  explanation: `Incorrect. In scriptural records, ${entity.name} is actually the ${relType} of ${targetName}.`
                });
              }
            });
          }
        });

        // 3. ADD STANDARD QUIZ QUESTIONS
        if (bookQuestions && bookQuestions.length > 0) {
          bookQuestions.forEach((q) => {
            parsedRiddles.push({
              type: "standard",
              correctName: q.correct,
              clue: q.question,
              options: q.options,
              explanation: q.explanation,
              verseRef: q.verse_number,
              verseText: q.verse_text
            });
          });
        }

        setRiddles(parsedRiddles.length > 0 ? parsedRiddles : [
          {
            type: "standard",
            correctName: bookId === "ggd" ? "Lord Caitanya Mahāprabhu" : "Śrī Kṛṣṇa",
            clue: "Who is the central Personality of Godhead described in this text?",
            options: ["Śrī Kṛṣṇa", "Balarāma", "Śrīdāmā", "Subala"],
          }
        ]);

        generateUniquePathMaze();
        setGameState("playing");
      } catch (err) {
        console.error("Yaksha Prashna initialization error:", err);
      }
    }
    initData();
  }, [bookId, bookQuestions, generateUniquePathMaze]);

  // Game timer
  useEffect(() => {
    if (gameState === "playing" && !activeRiddle) {
      timerRef.current = setInterval(() => {
        setSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [gameState, activeRiddle]);

  // Handle avatar movement step
  const moveStep = useCallback((dCol: number, dRow: number) => {
    if (gameState !== "playing" || activeRiddle) return;

    const nextCol = playerPos.col + dCol;
    const nextRow = playerPos.row + dRow;

    if (nextCol < 0 || nextCol >= GRID_SIZE || nextRow < 0 || nextRow >= GRID_SIZE) {
      return;
    }

    const cell = grid[nextRow][nextCol];

    if (cell.type === "tree") {
      return; // Blocked by wall
    }

    setPrevPos(playerPos);

    // Hit Yaksha obstacle riddle
    if (cell.type === "obstacle") {
      const pool = riddles.length > 0 ? riddles : [];
      let randRiddle = pool[Math.floor(Math.random() * pool.length)];

      // Handle Ghee Lamp
      if (hasLamp) {
        const incorrectOptions = randRiddle.options.filter(opt => opt !== randRiddle.correctName);
        if (incorrectOptions.length > 0) {
          const toRemove = incorrectOptions[Math.floor(Math.random() * incorrectOptions.length)];
          const filteredOptions = randRiddle.options.filter(opt => opt !== toRemove);
          randRiddle = {
            ...randRiddle,
            options: filteredOptions
          };
        }
        setHasLamp(false);
        setLampUsed(true);
      } else {
        setLampUsed(false);
      }

      setActiveRiddle(randRiddle);
      setActiveRiddlePos({ col: nextCol, row: nextRow });
      setSelectedOption(null);
      setIsCorrect(null);
      setShowRiddleExplanation(false);
      setPlayerPos({ col: nextCol, row: nextRow });
      return;
    }

    // Collect soma pot / nectar lotus
    if (cell.type === "collectible") {
      setPots((p) => p + 1);
      playCorrectSound();
      triggerParticles();

      const updatedGrid = [...grid];
      updatedGrid[nextRow][nextCol] = {
        ...updatedGrid[nextRow][nextCol],
        type: "empty",
      };
      setGrid(updatedGrid);
      setPlayerPos({ col: nextCol, row: nextRow });
      return;
    }

    // Collect Tulasi Leaf
    if (cell.type === "tulasi") {
      setHasShield(true);
      playCorrectSound();
      triggerParticles();

      const updatedGrid = [...grid];
      updatedGrid[nextRow][nextCol] = {
        ...updatedGrid[nextRow][nextCol],
        type: "empty",
      };
      setGrid(updatedGrid);
      setPlayerPos({ col: nextCol, row: nextRow });
      return;
    }

    // Collect Ghee Lamp
    if (cell.type === "lamp") {
      setHasLamp(true);
      playCorrectSound();
      triggerParticles();

      const updatedGrid = [...grid];
      updatedGrid[nextRow][nextCol] = {
        ...updatedGrid[nextRow][nextCol],
        type: "empty",
      };
      setGrid(updatedGrid);
      setPlayerPos({ col: nextCol, row: nextRow });
      return;
    }

    // Collect Sandalwood Paste
    if (cell.type === "sandalwood") {
      setHearts((h) => Math.min(3, h + 1));
      playCorrectSound();
      triggerParticles();

      const updatedGrid = [...grid];
      updatedGrid[nextRow][nextCol] = {
        ...updatedGrid[nextRow][nextCol],
        type: "empty",
      };
      setGrid(updatedGrid);
      setPlayerPos({ col: nextCol, row: nextRow });
      return;
    }

    // Land on Whirlpool
    if (cell.type === "whirlpool") {
      console.log("Stepped on whirlpool at:", nextCol, nextRow);
      playWrongSound(); // drama mridanga beat
      triggerParticles();
      setIsTeleporting(true); // Trigger fade-out spin animation

      const safeTypes = ["empty", "start", "collectible", "tulasi", "lamp", "sandalwood"];
      const teleportDestinations: Point[] = [];
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          if (
            safeTypes.includes(grid[r][c].type) &&
            !(r === nextRow && c === nextCol)
          ) {
            teleportDestinations.push({ col: c, row: r });
          }
        }
      }
      console.log("Found safe teleport destinations:", teleportDestinations.length);

      const updatedGrid = [...grid];
      updatedGrid[nextRow][nextCol] = {
        ...updatedGrid[nextRow][nextCol],
        type: "empty",
      };

      // Spawns +3 new Yakshas on other empty path tiles to increase challenge!
      const emptyTilesForYakshas: Point[] = [];
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          if (updatedGrid[r][c].type === "empty" && !(r === nextRow && c === nextCol)) {
            emptyTilesForYakshas.push({ col: c, row: r });
          }
        }
      }
      const shuffledYakshas = shuffle(emptyTilesForYakshas);
      for (let i = 0; i < 3; i++) {
        if (shuffledYakshas.length === 0) break;
        const pt = shuffledYakshas.pop()!;
        updatedGrid[pt.row][pt.col] = {
          ...updatedGrid[pt.row][pt.col],
          type: "obstacle",
          obstacleName: `Spawned Yaksha #${i + 1}`
        };
      }

      setGrid(updatedGrid);

      if (teleportDestinations.length > 0) {
        const randomTarget = teleportDestinations[Math.floor(Math.random() * teleportDestinations.length)];
        console.log("Teleporting player to:", randomTarget);
        setPlayerPos({ col: nextCol, row: nextRow }); // first show on whirlpool

        setTimeout(() => {
          setPlayerPos(randomTarget);
          setIsTeleporting(false);
          triggerParticles(); // splash at destination
        }, 500);
      } else {
        setPlayerPos({ col: nextCol, row: nextRow });
        setIsTeleporting(false);
      }
      return;
    }

    // Reached destination altar
    if (cell.type === "destination") {
      setGameState("victory");
    }

    setPlayerPos({ col: nextCol, row: nextRow });
  }, [grid, gameState, activeRiddle, riddles, playCorrectSound, playWrongSound, triggerParticles, hasLamp, playerPos]);

  // Tap adjacent cells to move (highly intuitive for mobile touch screens)
  const handleCellClick = useCallback((cell: Cell) => {
    if (gameState !== "playing" || activeRiddle) return;
    const colDiff = cell.col - playerPos.col;
    const rowDiff = cell.row - playerPos.row;
    const isAdjacent = (Math.abs(colDiff) === 1 && rowDiff === 0) || (Math.abs(rowDiff) === 1 && colDiff === 0);
    if (isAdjacent && cell.type !== "tree") {
      moveStep(colDiff, rowDiff);
    }
  }, [gameState, activeRiddle, playerPos, moveStep]);


  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (["ArrowUp", "KeyW"].includes(e.code)) {
        e.preventDefault();
        moveStep(0, -1);
      } else if (["ArrowDown", "KeyS"].includes(e.code)) {
        e.preventDefault();
        moveStep(0, 1);
      } else if (["ArrowLeft", "KeyA"].includes(e.code)) {
        e.preventDefault();
        moveStep(-1, 0);
      } else if (["ArrowRight", "KeyD"].includes(e.code)) {
        e.preventDefault();
        moveStep(1, 0);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [moveStep]);

  // Answer verification
  const handleSelectOption = (option: string) => {
    if (selectedOption || !activeRiddle) return;

    setSelectedOption(option);
    const correct = option === activeRiddle.correctName;

    if (correct) {
      setIsCorrect(true);
      playCorrectSound();
      triggerParticles();
      setShieldTriggered(false);
    } else {
      if (hasShield) {
        setIsCorrect(true); // Allow path advance
        setHasShield(false); // consume shield
        setShieldTriggered(true);
        playCorrectSound(); // Play shield save sound
        triggerParticles();
      } else {
        setIsCorrect(false);
        setShieldTriggered(false);
        playWrongSound();
        setHearts((h) => {
          const nextH = h - 1;
          if (nextH <= 0) {
            setGameState("gameover");
          }
          return nextH;
        });
      }
    }
    setShowRiddleExplanation(true);
  };

  // Close obstacle riddle dialog
  const handleResolveRiddle = () => {
    if (!activeRiddlePos || !activeRiddle) return;

    const updatedGrid = [...grid];
    if (isCorrect) {
      updatedGrid[activeRiddlePos.row][activeRiddlePos.col] = {
        ...updatedGrid[activeRiddlePos.row][activeRiddlePos.col],
        type: "empty",
      };
      setGrid(updatedGrid);
    } else {
      setPlayerPos(prevPos);
    }

    setActiveRiddle(null);
    setActiveRiddlePos(null);
    setSelectedOption(null);
    setIsCorrect(null);
    setShowRiddleExplanation(false);
    setShieldTriggered(false); // Reset shield flag
  };

  const handleVictoryComplete = () => {
    const baseXP = GAMIFICATION_CONFIG.xpRewards.pathfinderBase;
    const perfectBonus = hearts === 3 ? GAMIFICATION_CONFIG.xpRewards.pathfinderPerfectBonus : 0;
    const potXP = pots * 2;
    const totalXP = baseXP + perfectBonus + potXP;

    onComplete(totalXP, hearts, pots);
  };

  const handleRestart = () => {
    setHearts(3);
    setPots(0);
    setHasShield(false);
    setHasLamp(false);
    setLampUsed(false);
    setShieldTriggered(false);
    setSeconds(0);
    generateUniquePathMaze();
    setGameState("playing");
  };

  if (gameState === "loading") {
    return (
      <div className="quiz-card divine-aura fade-in" style={{ textAlign: "center", padding: "3rem" }}>
        <h3 style={{ fontFamily: "'Cinzel', serif", color: "var(--saffron)" }}>Approaching the Sacred Lake...</h3>
      </div>
    );
  }

  const totalXPEarned =
    GAMIFICATION_CONFIG.xpRewards.pathfinderBase +
    (hearts === 3 ? GAMIFICATION_CONFIG.xpRewards.pathfinderPerfectBonus : 0) +
    pots * 2;

  return (
    <div
      className="quiz-card divine-aura fade-in"
      style={{
        maxWidth: "800px",
        margin: "0 auto 4rem auto",
        padding: "2rem",
        borderRadius: "16px",
        boxShadow: "0 12px 40px rgba(0,0,0,0.12)",
      }}
    >
      {/* Game Header HUD */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          color: "var(--ink-mid)",
          fontSize: "0.9rem",
          marginBottom: "1.5rem",
          borderBottom: "1.5px solid var(--border)",
          paddingBottom: "1rem",
          flexWrap: "wrap",
          gap: "1rem"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <span style={{ fontSize: "1.3rem" }}>👹</span>
          <span style={{ fontWeight: "700", fontFamily: "'Cinzel', serif", letterSpacing: "0.05em", color: "var(--saffron)" }}>
            Yaksha Prashna
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1.2rem", flexWrap: "wrap" }}>
          {/* Hearts */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.25rem" }} title="Prāṇa (Hearts left)">
            {Array.from({ length: 3 }).map((_, i) => (
              <span
                key={i}
                style={{
                  fontSize: "1.2rem",
                  color: i < hearts ? "#f43f5e" : "var(--ink-faint)",
                  opacity: i < hearts ? 1 : 0.3,
                  transition: "opacity 0.3s"
                }}
              >
                ❤️
              </span>
            ))}
          </div>
          {/* Collectibles count */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <span>🏺</span>
            <span>Nectar: <strong>{pots} / 3</strong></span>
          </div>
          {/* Active Items */}
          {hasShield && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", backgroundColor: "rgba(58, 122, 42, 0.12)", border: "1px solid rgba(58, 122, 42, 0.3)", padding: "0.2rem 0.6rem", borderRadius: "12px" }} title="Tulasi Shield (Saves 1 Heart)">
              <span>🌿</span>
              <span style={{ fontSize: "0.72rem", fontWeight: "700", color: "var(--correct)" }}>SHIELD</span>
            </div>
          )}
          {hasLamp && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", backgroundColor: "rgba(212, 168, 67, 0.12)", border: "1px solid rgba(212, 168, 67, 0.3)", padding: "0.2rem 0.6rem", borderRadius: "12px" }} title="Ghee Lamp (Removes 1 distractor)">
              <span>🪔</span>
              <span style={{ fontSize: "0.72rem", fontWeight: "700", color: "var(--gold)" }}>LAMP</span>
            </div>
          )}
          {/* Timer */}
          <div>
            <span>Time: <strong>{Math.floor(seconds / 60)}:{(seconds % 60).toString().padStart(2, "0")}</strong></span>
          </div>
          {/* Points Potential */}
          <div
            style={{
              backgroundColor: "rgba(200, 114, 42, 0.1)",
              padding: "0.3rem 0.8rem",
              borderRadius: "20px",
              border: "1px solid rgba(200, 114, 42, 0.25)",
            }}
          >
            XP Potential: <strong style={{ color: "var(--saffron)" }}>+{totalXPEarned}</strong>
          </div>
        </div>
      </div>

      {/* Flat Grid Gameboard with Lake aesthetics */}
      {gameState === "playing" && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "1.5rem" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`,
              gridTemplateRows: `repeat(${GRID_SIZE}, 1fr)`,
              width: "min(390px, 85vw, 60vh)",
              height: "min(390px, 85vw, 60vh)",
              backgroundColor: lakeTheme.boardBg,
              border: lakeTheme.boardBorder,
              borderRadius: "12px",
              padding: "8px",
              gap: "4px",
              boxShadow: theme === "gauri"
                ? "inset 0 4px 12px rgba(0,0,0,0.1), 0 8px 24px rgba(0,0,0,0.06)"
                : "inset 0 4px 16px rgba(0,0,0,0.5), 0 8px 24px rgba(0,0,0,0.3)",
              boxSizing: "border-box",
              margin: "0 auto",
              overflow: "hidden"
            }}
          >
            {grid.flat().map((cell, idx) => {
              const isPlayer = playerPos.col === cell.col && playerPos.row === cell.row;
              let cellContent = "";
              let cellBg = lakeTheme.cellBgEmpty;
              let cellTitle = "Walkable Lake Path";

              if (cell.type === "tree") {
                cellContent = "🌾"; // reeds
                cellBg = lakeTheme.cellBgTree;
                cellTitle = "Deep Water & Reeds (Blocked)";
              } else if (cell.type === "collectible") {
                cellContent = cell.collectibleType === "pot" ? "🏺" : "🪷";
                cellTitle = "Sacred Nectar / Lotus (Collect)";
              } else if (cell.type === "obstacle") {
                cellContent = "👹"; // Yaksha Guard
                cellBg = lakeTheme.cellBgObstacle;
                cellTitle = "Yaksha Guard";
              } else if (cell.type === "destination") {
                cellContent = "🛕"; // Temple
                cellBg = lakeTheme.cellBgDestination;
                cellTitle = "Sacred Altar";
              } else if (cell.type === "start") {
                cellBg = lakeTheme.cellBgStart;
              } else if (cell.type === "tulasi") {
                cellContent = "🌿";
                cellTitle = "Sacred Tulasi Leaf (Divine Shield)";
              } else if (cell.type === "whirlpool") {
                cellContent = "🌀";
                cellTitle = "Mystical Whirlpool (Teleports)";
              } else if (cell.type === "lamp") {
                cellContent = "🪔";
                cellTitle = "Ghee Lamp (Eliminates distractor)";
              } else if (cell.type === "sandalwood") {
                cellContent = "🪵";
                cellTitle = "Sandalwood Paste (Restores Heart)";
              }

              // Determine if cell is adjacent to the player and walkable (enabling tap-to-move)
              const colDiff = cell.col - playerPos.col;
              const rowDiff = cell.row - playerPos.row;
              const isAdjacent = (Math.abs(colDiff) === 1 && rowDiff === 0) || (Math.abs(rowDiff) === 1 && colDiff === 0);
              const isWalkable = cell.type !== "tree";
              const canMoveHere = isAdjacent && isWalkable;

              return (
                <div
                  key={idx}
                  title={cellTitle}
                  onClick={() => handleCellClick(cell)}
                  style={{
                    position: "relative",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "clamp(0.7rem, 2.8vw, 1.3rem)",
                    backgroundColor: cellBg,
                    borderRadius: "6px",
                    border: canMoveHere
                      ? "1px solid var(--gold)"
                      : theme === "gauri"
                        ? "1px solid rgba(0, 0, 0, 0.05)"
                        : "1px solid rgba(255,255,255,0.03)",
                    boxShadow: canMoveHere
                      ? "0 0 8px rgba(255, 215, 0, 0.45)"
                      : cell.type === "tree"
                        ? "none"
                        : theme === "gauri"
                          ? "inset 0 1px 2px rgba(255,255,255,0.5)"
                          : "inset 0 1px 2px rgba(255,255,255,0.05)",
                    userSelect: "none",
                    cursor: canMoveHere ? "pointer" : "default",
                    transition: "all 0.2s",
                    minWidth: 0,
                    minHeight: 0,
                    width: "100%",
                    height: "100%",
                  }}
                >
                  {!isPlayer && cellContent}

                  {/* Player */}
                  {isPlayer && (
                    <div
                      className={`pulse ${isTeleporting ? "teleporting-effect" : ""}`}
                      style={{
                        fontSize: "clamp(0.9rem, 3.8vw, 1.5rem)",
                        transform: "scale(1.1)",
                        zIndex: 2,
                        transition: "all 0.4s ease-in-out",
                      }}
                    >
                      🧘‍♂️
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* D-Pad and Instructions */}
          <div
            style={{
              display: "flex",
              flexDirection: isMobile ? "column-reverse" : "row",
              justifyContent: "space-between",
              alignItems: "center",
              width: "100%",
              maxWidth: "480px",
              marginTop: "0.5rem",
              gap: isMobile ? "1.2rem" : "1.5rem"
            }}
          >
            <div style={{ flex: 1, fontSize: "0.82rem", color: "var(--ink-soft)", lineHeight: "1.5", textAlign: isMobile ? "center" : "left" }}>
              <strong style={{ color: "var(--saffron)", textTransform: "uppercase", display: "block", marginBottom: "4px" }}>
                Quest Rules:
              </strong>
              {isMobile ? "• Tap adjacent cells or use D-pad to move." : "• Use Arrow Keys / WASD or click adjacent cells to move."}<br />
              • Confront the Yakshas 👹 guarding the path.<br />
              • Gather Nectar Pitchers 🏺 & Lotus Flowers 🪷.<br />
              • Seek Tulasi 🌿 (Shield), Ghee Lamps 🪔 (Help), and Sandalwood 🪵 (Healing).<br />
              • Avoid Whirlpools 🌀 & reach the Temple Altar 🛕!
            </div>

            {/* D-pad */}
            <div
              style={{
                display: "grid",
                gridTemplateAreas: `
                  ". up ."
                  "left . right"
                  ". down ."
                `,
                gap: "4px",
                width: isMobile ? "125px" : "110px",
                height: isMobile ? "125px" : "110px",
                margin: isMobile ? "0 auto" : "0"
              }}
            >
              <button
                onClick={() => moveStep(0, -1)}
                style={{
                  gridArea: "up",
                  backgroundColor: lakeTheme.dpadBg,
                  color: lakeTheme.dpadColor,
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "1rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ▲
              </button>
              <button
                onClick={() => moveStep(-1, 0)}
                style={{
                  gridArea: "left",
                  backgroundColor: lakeTheme.dpadBg,
                  color: lakeTheme.dpadColor,
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "1rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ◀
              </button>
              <button
                onClick={() => moveStep(1, 0)}
                style={{
                  gridArea: "right",
                  backgroundColor: lakeTheme.dpadBg,
                  color: lakeTheme.dpadColor,
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "1rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ▶
              </button>
              <button
                onClick={() => moveStep(0, 1)}
                style={{
                  gridArea: "down",
                  backgroundColor: lakeTheme.dpadBg,
                  color: lakeTheme.dpadColor,
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  cursor: "pointer",
                  fontSize: "1rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ▼
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Riddle Confrontation Modal */}
      {activeRiddle && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(5px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "1rem",
          }}
        >
          <div
            className="quiz-card divine-aura"
            style={{
              maxWidth: "640px",
              width: "100%",
              margin: 0,
              padding: "2rem",
              borderRadius: "16px",
              backgroundColor: "var(--parchment)",
              border: "2px solid var(--border)",
              boxShadow: "0 16px 48px rgba(0,0,0,0.3)",
            }}
          >
            <h3
              style={{
                color: "var(--saffron)",
                fontFamily: "'Cinzel', serif",
                marginTop: 0,
                borderBottom: "1.5px solid var(--border)",
                paddingBottom: "0.8rem",
                display: "flex",
                alignItems: "center",
                gap: "0.6rem"
              }}
            >
              👹 Yaksha's Echo
            </h3>
            <p style={{ fontSize: "0.95rem", color: "var(--ink-soft)", fontStyle: "italic", marginBottom: "1.2rem" }}>
              {activeRiddle.type === "boolean"
                ? "The Yaksha challenges you on a scriptural relationship mapping:"
                : "A voice booms from the waters: \"Answer my question, or succumb to the lake's poison!\""}
            </p>

            <div
              style={{
                backgroundColor: "var(--ivory)",
                borderLeft: "4px solid var(--saffron)",
                padding: "1.2rem 1.4rem",
                borderRadius: "4px",
                fontSize: "1.05rem",
                lineHeight: "1.6",
                color: "var(--ink-mid)",
                marginBottom: "1.8rem",
                boxShadow: "0 4px 12px rgba(0,0,0,0.02)",
              }}
            >
              {activeRiddle.clue}
            </div>

            {lampUsed && (
              <div style={{ color: "var(--saffron)", fontSize: "0.85rem", fontWeight: "600", marginBottom: "0.8rem", textAlign: "center" }}>
                🪔 Ghee Lamp illuminated: One incorrect option removed!
              </div>
            )}

            {/* Options grid */}
            <div style={{ display: "grid", gridTemplateColumns: activeRiddle.type === "boolean" ? "1fr 1fr" : "1fr 1fr", gap: "1rem", marginBottom: "1.8rem" }}>
              {activeRiddle.options.map((option) => {
                const isSelected = selectedOption === option;
                const isCorrectOption = option === activeRiddle.correctName;

                let optStyle: React.CSSProperties = {
                  padding: "1rem 0.8rem",
                  borderRadius: "10px",
                  border: "1.5px solid var(--border)",
                  backgroundColor: "var(--ivory)",
                  cursor: "pointer",
                  fontWeight: "600",
                  fontSize: "0.92rem",
                  fontFamily: "'Cinzel', serif",
                  textAlign: "center",
                  color: "var(--ink-mid)",
                  transition: "all 0.2s"
                };

                if (selectedOption) {
                  optStyle.cursor = "default";
                  if (isCorrectOption) {
                    optStyle.backgroundColor = "var(--correct-bg)";
                    optStyle.borderColor = "var(--correct)";
                    optStyle.color = "var(--correct)";
                  } else if (isSelected) {
                    optStyle.backgroundColor = "var(--wrong-bg)";
                    optStyle.borderColor = "var(--wrong)";
                    optStyle.color = "var(--wrong)";
                  } else {
                    optStyle.opacity = 0.4;
                  }
                }

                return (
                  <button
                    key={option}
                    disabled={!!selectedOption}
                    className={`yaksha-option-btn ${isCorrectOption ? "correct" : ""} ${isSelected ? "wrong" : ""}`}
                    style={optStyle}
                    onClick={() => handleSelectOption(option)}
                  >
                    {option}
                  </button>
                );
              })}
            </div>

            {/* Feedback & Verse */}
            {showRiddleExplanation && (
              <div
                style={{
                  borderTop: "1px dashed var(--border)",
                  paddingTop: "1.2rem",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: "0.4rem",
                    marginBottom: "1rem",
                  }}
                >
                  <span style={{ fontSize: "1.4rem" }}>{isCorrect ? "💮" : "☠️"}</span>
                  <h4 style={{ color: isCorrect ? "var(--correct)" : "var(--wrong)", margin: 0, fontFamily: "'Cinzel', serif" }}>
                    {shieldTriggered
                      ? "Tulasi Shield Absorbed the Poison!"
                      : isCorrect
                        ? "The Yaksha is pleased!"
                        : `Incorrect! Poison consumed!`}
                  </h4>
                </div>

                {activeRiddle.explanation && (
                  <p style={{ fontSize: "0.9rem", color: "var(--ink-soft)", marginBottom: "1rem" }}>
                    {activeRiddle.explanation}
                  </p>
                )}

                {isCorrect && activeRiddle.verseText && (
                  <div
                    className="verse-box"
                    style={{
                      fontSize: "0.9rem",
                      padding: "0.8rem 1rem",
                      textAlign: "left",
                      lineHeight: "1.5",
                      marginBottom: "1.2rem",
                    }}
                  >
                    {activeRiddle.verseText.split("\n").map((line, idx) => (
                      <span key={idx}>
                        {line}
                        <br />
                      </span>
                    ))}
                    {activeRiddle.verseRef && (
                      <div style={{ textAlign: "right", fontWeight: "700", color: "var(--saffron)", marginTop: "0.4rem" }}>
                        — Verse {activeRiddle.verseRef}
                      </div>
                    )}
                  </div>
                )}

                <button className="btn btn-primary" onClick={handleResolveRiddle} style={{ padding: "0.6rem 2rem", borderRadius: "6px" }}>
                  {isCorrect ? "Advance Path" : "Step Back"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Game Over */}
      {gameState === "gameover" && (
        <div style={{ textAlign: "center", padding: "3rem 1rem" }} className="fade-in">
          <span style={{ fontSize: "3rem" }}>☠️</span>
          <h2 style={{ fontFamily: "'Cinzel', serif", color: "var(--wrong)", marginTop: "1rem", marginBottom: "0.5rem" }}>
            Lethal Poison Consumed!
          </h2>
          <p style={{ color: "var(--ink-soft)", maxWidth: "420px", margin: "0 auto 2rem auto", fontSize: "0.95rem" }}>
            You drank the lake waters without satisfying Yamaraja's scriptural riddles. Study the books to revive your wisdom and try again!
          </p>
          <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
            <button className="btn btn-primary" onClick={handleRestart}>
              Try Again
            </button>
            <button className="btn btn-secondary" onClick={onClose}>
              Exit Lake
            </button>
          </div>
        </div>
      )}

      {/* Victory */}
      {gameState === "victory" && (
        <div style={{ textAlign: "center", padding: "2rem 1rem" }} className="fade-in">
          <span style={{ fontSize: "3rem" }}>🛕✨</span>
          <h2 style={{ fontFamily: "'Cinzel', serif", color: "var(--correct)", marginTop: "1rem", marginBottom: "0.5rem" }}>
            Shrine Altar Revived!
          </h2>
          <p style={{ color: "var(--ink-soft)", fontSize: "0.98rem", marginBottom: "2rem" }}>
            Yaksha Yamaraja honors your scriptural wisdom. You have safely navigated the sacred waters of Vraja!
          </p>

          <div
            style={{
              maxWidth: "340px",
              margin: "0 auto 2.5rem auto",
              backgroundColor: "var(--ivory)",
              border: "1px solid var(--border)",
              borderRadius: "12px",
              padding: "1.2rem 1.6rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.8rem",
              textAlign: "left",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9rem" }}>
              <span>Base Yaksha Prashna Reward:</span>
              <strong style={{ color: "var(--saffron)" }}>+{GAMIFICATION_CONFIG.xpRewards.pathfinderBase} XP</strong>
            </div>
            {hearts === 3 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9rem", color: "var(--correct)" }}>
                <span>Immaculate Wisdom Bonus (3 ❤️):</span>
                <strong>+{GAMIFICATION_CONFIG.xpRewards.pathfinderPerfectBonus} XP</strong>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.9rem" }}>
              <span>Sacred Relics Collected ({pots} 🏺/🪷):</span>
              <strong style={{ color: "var(--saffron)" }}>+{pots * 2} XP</strong>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "1.05rem",
                fontWeight: "700",
                borderTop: "1.5px solid var(--border)",
                paddingTop: "0.6rem",
                marginTop: "0.2rem",
              }}
            >
              <span>Total Gunja Berries:</span>
              <span style={{ color: "var(--saffron)" }}>+{totalXPEarned} GB</span>
            </div>
          </div>

          <button className="btn btn-primary" onClick={handleVictoryComplete}>
            Claim Rewards
          </button>
        </div>
      )}

      {/* Lobby quit option */}
      {gameState === "playing" && (
        <div style={{ textAlign: "center", marginTop: "1rem" }}>
          <button className="btn btn-secondary" onClick={onClose} style={{ fontSize: "0.8rem", padding: "0.4rem 1.8rem" }}>
            Leave Lake
          </button>
        </div>
      )}
    </div>
  );
}
