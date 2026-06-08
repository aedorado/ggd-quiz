"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";

interface WordItem {
  word: string;
  clue: string;
  verseKey?: string;
  verseText?: string;
}

interface PlacedWord {
  word: string;
  clue: string;
  row: number;
  col: number;
  direction: "across" | "down";
  number: number;
  verseKey?: string;
  verseText?: string;
}

interface LayoutResult {
  grid: Record<string, { letter: string; number?: number }>;
  placedWords: PlacedWord[];
  rows: number;
  cols: number;
}

// Fallback seed pool (used if crosswords.json hasn't been generated yet)
const FALLBACK_CLUE_POOL: WordItem[] = [
  { word: "GOVINDA", clue: "The primeval Lord who always revels in pastimes of love." },
  { word: "GOKULA", clue: "The superexcellent station of Kṛṣṇa, which has thousands of petals." },
  { word: "SAMBHU", clue: "The dim twilight reflection of the supreme eternal effulgence." },
  { word: "DURGA", clue: "The external potency who is of the nature of the shadow of the cit potency." },
  { word: "GANESHA", clue: "He who holds the lotus feet of Govinda upon his elephant head." },
  { word: "SVETADVIPA", clue: "The mysterious quadrangular place surrounding Gokula's outskirts." },
  { word: "CINTAMANI", clue: "Spiritual gems used to build abodes in Goloka." },
  { word: "SARASVATI", clue: "The goddess of learning who gave the eighteen-syllable mantra to Brahmā." },
  { word: "GAYATRI", clue: "Mother of the Vedas who entered Brahmā's ear-holes from Kṛṣṇa's flute." },
  { word: "SURYA", clue: "The sun god who performs his journey mounting the wheel of time." },
  { word: "INDRA", clue: "The king of the devas, compared to a tiny insect in terms of karma." },
  { word: "YOGANIDRA", clue: "The spiritual potency of ecstatic trance whom Mahā-Viṣṇu consorts with." },
  { word: "SANKARSANA", clue: "The deity whose pores hold the seeds born as golden sperms." }
];

// Helper to shuffle array
function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Bounding box validation
function isValidPlacement(
  word: string,
  startRow: number,
  startCol: number,
  direction: "across" | "down",
  gridLetters: Record<string, string>
): boolean {
  const maxLimit = 22;

  for (let i = 0; i < word.length; i++) {
    const r = direction === "across" ? startRow : startRow + i;
    const c = direction === "across" ? startCol + i : startCol;

    // Check bound limit
    if (Math.abs(r) > maxLimit || Math.abs(c) > maxLimit) return false;

    const existing = gridLetters[`${r},${c}`];

    // Check intersection character match
    if (existing && existing !== word[i]) {
      return false;
    }

    // Check adjacent letter neighbors if placing a new letter (crossword rule)
    if (!existing) {
      const neighbors = direction === "across"
        ? [`${r - 1},${c}`, `${r + 1},${c}`]
        : [`${r},${c - 1}`, `${r},${c + 1}`];

      if (neighbors.some((n) => gridLetters[n])) {
        return false;
      }
    }
  }

  // Ensure cell before start and cell after end are empty
  const beforeKey = direction === "across"
    ? `${startRow},${startCol - 1}`
    : `${startRow - 1},${startCol}`;
  const afterKey = direction === "across"
    ? `${startRow},${startCol + word.length}`
    : `${startRow + word.length},${startCol}`;

  if (gridLetters[beforeKey] || gridLetters[afterKey]) {
    return false;
  }

  return true;
}

// Calculate intersection score minus shape penalty
function calculatePlacementScore(
  word: string,
  startRow: number,
  startCol: number,
  direction: "across" | "down",
  gridLetters: Record<string, string>,
  minRow: number,
  maxRow: number,
  minCol: number,
  maxCol: number,
  isMobile: boolean
): number {
  let intersections = 0;

  for (let i = 0; i < word.length; i++) {
    const r = direction === "across" ? startRow : startRow + i;
    const c = direction === "across" ? startCol + i : startCol;
    if (gridLetters[`${r},${c}`]) {
      intersections++;
    }
  }

  const newMinRow = Math.min(minRow, startRow, direction === "down" ? startRow + word.length - 1 : startRow);
  const newMaxRow = Math.max(maxRow, startRow, direction === "down" ? startRow + word.length - 1 : startRow);
  const newMinCol = Math.min(minCol, startCol, direction === "across" ? startCol + word.length - 1 : startCol);
  const newMaxCol = Math.max(maxCol, startCol, direction === "across" ? startCol + word.length - 1 : startCol);

  const width = newMaxCol - newMinCol + 1;
  const height = newMaxRow - newMinRow + 1;

  let shapePenalty = 0;
  if (isMobile) {
    // Mobile: Prefer tall & narrow layouts (less horizontal scrolling)
    // Penalize width expansion more heavily
    shapePenalty = (width * 3.5) + height;
  } else {
    // Desktop: Prefer square layouts
    // Penalize size + absolute aspect ratio difference
    const diff = Math.abs(width - height);
    shapePenalty = (width * height) + (diff * 6);
  }

  return intersections * 28 - shapePenalty;
}

// Layout generation single run
function compileSingleLayout(words: WordItem[], isMobile: boolean): LayoutResult | null {
  const sorted = [...words].sort((a, b) => b.word.length - a.word.length);
  const placed: PlacedWord[] = [];
  const gridLetters: Record<string, string> = {};

  let minRow = 0, maxRow = 0, minCol = 0, maxCol = 0;

  // Place first word at (0,0) Across
  const first = sorted[0];
  placed.push({
    word: first.word,
    clue: first.clue,
    row: 0,
    col: 0,
    direction: "across",
    number: 1,
    verseKey: first.verseKey,
    verseText: first.verseText
  });
  first.word.split("").forEach((char, idx) => {
    gridLetters[`0,${idx}`] = char;
  });
  maxCol = first.word.length - 1;

  // Try placing subsequent words
  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i];
    const candidates: { row: number; col: number; direction: "across" | "down"; score: number }[] = [];

    Object.entries(gridLetters).forEach(([coord, gridChar]) => {
      const [gr, gc] = coord.split(",").map(Number);
      let charIdx = item.word.indexOf(gridChar);

      while (charIdx !== -1) {
        // Find covering word direction to go perpendicular
        const coveringWord = placed.find((w) => {
          const wStart = w.direction === "across" ? w.col : w.row;
          const wCoord = w.direction === "across" ? gc : gr;
          const wLen = w.word.length;
          const isOrthogonalMatch = w.direction === "across" ? w.row === gr : w.col === gc;
          return isOrthogonalMatch && wCoord >= wStart && wCoord < wStart + wLen;
        });

        const newDir = coveringWord?.direction === "across" ? "down" : "across";
        const startR = newDir === "across" ? gr : gr - charIdx;
        const startC = newDir === "across" ? gc - charIdx : gc;

        if (isValidPlacement(item.word, startR, startC, newDir, gridLetters)) {
          const score = calculatePlacementScore(item.word, startR, startC, newDir, gridLetters, minRow, maxRow, minCol, maxCol, isMobile);
          candidates.push({ row: startR, col: startC, direction: newDir, score });
        }

        charIdx = item.word.indexOf(gridChar, charIdx + 1);
      }
    });

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score - a.score);
      const chosen = candidates[0];

      placed.push({
        word: item.word,
        clue: item.clue,
        row: chosen.row,
        col: chosen.col,
        direction: chosen.direction,
        number: 0,
        verseKey: item.verseKey,
        verseText: item.verseText
      });

      item.word.split("").forEach((char, idx) => {
        const r = chosen.direction === "across" ? chosen.row : chosen.row + idx;
        const c = chosen.direction === "across" ? chosen.col + idx : chosen.col;
        gridLetters[`${r},${c}`] = char;

        minRow = Math.min(minRow, r);
        maxRow = Math.max(maxRow, r);
        minCol = Math.min(minCol, c);
        maxCol = Math.max(maxCol, c);
      });
    }
  }

  // Expect at least 8 placed words for a satisfying crossword POC
  if (placed.length < 8) return null;

  // Normalize offset coordinates to start at (0,0)
  const rowOffset = -minRow;
  const colOffset = -minCol;

  const normalizedPlaced: PlacedWord[] = placed.map((w) => ({
    ...w,
    row: w.row + rowOffset,
    col: w.col + colOffset
  }));

  // Assign numbers top-left to bottom-right
  const startPoints = [...normalizedPlaced].sort((a, b) => {
    if (a.row !== b.row) return a.row - b.row;
    return a.col - b.col;
  });

  const coordNumbers: Record<string, number> = {};
  let currentNum = 1;
  startPoints.forEach((w) => {
    const key = `${w.row},${w.col}`;
    if (!coordNumbers[key]) {
      coordNumbers[key] = currentNum++;
    }
    w.number = coordNumbers[key];
  });

  const finalGrid: Record<string, { letter: string; number?: number }> = {};
  normalizedPlaced.forEach((w) => {
    w.word.split("").forEach((char, idx) => {
      const r = w.direction === "across" ? w.row : w.row + idx;
      const c = w.direction === "across" ? w.col + idx : w.col;
      finalGrid[`${r},${c}`] = { letter: char };
    });
  });

  Object.entries(coordNumbers).forEach(([coord, num]) => {
    if (finalGrid[coord]) {
      finalGrid[coord].number = num;
    }
  });

  return {
    grid: finalGrid,
    placedWords: normalizedPlaced,
    rows: maxRow - minRow + 1,
    cols: maxCol - minCol + 1
  };
}

// Orchestrator: Try layout generation multiple times with shuffles
function generateCrosswordLayout(words: WordItem[], isMobile: boolean): LayoutResult {
  for (let attempt = 0; attempt < 30; attempt++) {
    const shuffled = shuffleArray(words);
    const result = compileSingleLayout(shuffled, isMobile);
    if (result) return result;
  }
  // Safe fallback to first 8 words layout compilation
  const fallbackResult = compileSingleLayout(words.slice(0, 8), isMobile);
  if (fallbackResult) return fallbackResult;

  // Minimal emergency layout
  return { grid: {}, placedWords: [], rows: 0, cols: 0 };
}

export default function CrosswordPOC() {
  const [layout, setLayout] = useState<LayoutResult | null>(null);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [selectedClue, setSelectedClue] = useState<PlacedWord | null>(null);
  const [cluePool, setCluePool] = useState<WordItem[]>(FALLBACK_CLUE_POOL);
  const [loadingSource, setLoadingSource] = useState<"generated" | "fallback" | "loading">("loading");

  // Undo / Redo History stack states
  const [history, setHistory] = useState<Record<string, string>[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // Timer states
  const [seconds, setSeconds] = useState(0);
  const [paused, setPaused] = useState(false);
  const [success, setSuccess] = useState(false);

  // Bhakti XP & Hint states
  const [bhaktiXp, setBhaktiXp] = useState(0);
  const [hintPenalty, setHintPenalty] = useState(0);
  const [showVerseContextId, setShowVerseContextId] = useState<string | null>(null);
  const [activeCell, setActiveCell] = useState<{ r: number; c: number } | null>(null);
  const [revealedVerseClues, setRevealedVerseClues] = useState<string[]>([]);

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Load bhakti_xp on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const xp = parseInt(localStorage.getItem("bhakti_xp") || "0", 10);
      setBhaktiXp(xp);
    }
  }, []);

  // Sync scroll for selected clue
  useEffect(() => {
    if (selectedClue) {
      const elementId = `clue-${selectedClue.number}-${selectedClue.direction}`;
      const element = document.getElementById(elementId);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }, [selectedClue]);

  // Helper to push to history stack (for undo/redo)
  const pushStateToHistory = (newGrid: Record<string, string>) => {
    const nextHistory = history.slice(0, historyIndex + 1);
    nextHistory.push(newGrid);
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevIdx = historyIndex - 1;
      setHistoryIndex(prevIdx);
      setUserAnswers(history[prevIdx]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const nextIdx = historyIndex + 1;
      setHistoryIndex(nextIdx);
      setUserAnswers(history[nextIdx]);
    }
  };

  // Build a new puzzle from the current clue pool
  const buildPuzzle = (pool: WordItem[]) => {
    const isMobile = typeof window !== "undefined" ? window.innerWidth < 768 : false;

    // Filter the pool: allow only up to 1 word with length >= 14 characters,
    // and up to 14 words with length < 14 characters.
    const longWords = shuffleArray(pool.filter(item => item.word.length >= 14));
    const normalWords = shuffleArray(pool.filter(item => item.word.length < 14));

    const selectedPool: WordItem[] = [];
    if (longWords.length > 0) {
      selectedPool.push(longWords[0]);
    }

    // Fill the rest of the pool with normal words up to a total of 15 clues
    const remainingSlots = 15 - selectedPool.length;
    selectedPool.push(...normalWords.slice(0, remainingSlots));

    // Run layout generator (uses improved scoring and placement attempts)
    const newLayout = generateCrosswordLayout(shuffleArray(selectedPool), isMobile);

    setLayout(newLayout);
    setSeconds(0);
    setPaused(false);
    setSuccess(false);
    setSelectedClue(null);
    setHintPenalty(0);
    setShowVerseContextId(null);
    setActiveCell(null);
    setRevealedVerseClues([]);

    const initialAnswers: Record<string, string> = {};
    Object.keys(newLayout.grid).forEach((key) => {
      initialAnswers[key] = "";
    });
    setUserAnswers(initialAnswers);
    setHistory([initialAnswers]);
    setHistoryIndex(0);
  };

  const initializeNewPuzzle = () => buildPuzzle(cluePool);

  // On mount: try to load generated crosswords.json; fall back to seed pool
  useEffect(() => {
    fetch("/ggd/crosswords.json")
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: Record<string, { verse_text: string; clues: { word: string; clue: string }[] }>) => {
        const seen = new Set<string>();
        const allClues: WordItem[] = [];
        Object.entries(data).forEach(([verseKey, verseData]) => {
          verseData.clues.forEach((c) => {
            if (!seen.has(c.word)) {
              seen.add(c.word);
              allClues.push({
                word: c.word,
                clue: c.clue,
                verseKey: verseKey,
                verseText: verseData.verse_text
              });
            }
          });
        });
        if (allClues.length >= 8) {
          setCluePool(allClues);
          setLoadingSource("generated");
          buildPuzzle(allClues);
        } else {
          setLoadingSource("fallback");
          buildPuzzle(FALLBACK_CLUE_POOL);
        }
      })
      .catch(() => {
        setLoadingSource("fallback");
        buildPuzzle(FALLBACK_CLUE_POOL);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Timer interval
  useEffect(() => {
    if (paused || success) return;
    const interval = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [paused, success]);

  // Check answers
  const checkGridCompletion = (currentGrid: Record<string, string>) => {
    if (!layout) return;
    const allCorrect = Object.entries(layout.grid).every(([coord, cell]) => {
      return (currentGrid[coord] || "").toUpperCase() === cell.letter;
    });
    if (allCorrect) {
      setSuccess(true);
      // Award XP
      const earnedXp = Math.max(10 - hintPenalty, 0);
      if (typeof window !== "undefined") {
        const currentXp = parseInt(localStorage.getItem("bhakti_xp") || "0", 10);
        const newXp = currentXp + earnedXp;
        localStorage.setItem("bhakti_xp", newXp.toString());
        setBhaktiXp(newXp);
        window.dispatchEvent(new Event("storage"));
      }
    }
  };

  const isWordCorrect = (placed: PlacedWord) => {
    for (let i = 0; i < placed.word.length; i++) {
      const r = placed.direction === "across" ? placed.row : placed.row + i;
      const c = placed.direction === "across" ? placed.col + i : placed.col;
      const key = `${r},${c}`;
      if ((userAnswers[key] || "").toUpperCase() !== placed.word[i]) {
        return false;
      }
    }
    return true;
  };

  const isWordCorrectWithGrid = (placed: PlacedWord, grid: Record<string, string>) => {
    for (let i = 0; i < placed.word.length; i++) {
      const r = placed.direction === "across" ? placed.row : placed.row + i;
      const c = placed.direction === "across" ? placed.col + i : placed.col;
      const key = `${r},${c}`;
      if ((grid[key] || "").toUpperCase() !== placed.word[i]) {
        return false;
      }
    }
    return true;
  };

  const isCellInCorrectWord = (r: number, c: number) => {
    if (!layout) return false;
    return layout.placedWords.some((w) => {
      if (!isWordCorrect(w)) return false;
      for (let i = 0; i < w.word.length; i++) {
        const cr = w.direction === "across" ? w.row : w.row + i;
        const cc = w.direction === "across" ? w.col + i : w.col;
        if (cr === r && cc === c) return true;
      }
      return false;
    });
  };

  const handleInputChange = (r: number, c: number, val: string) => {
    if (paused || success) return;
    const key = `${r},${c}`;
    const cleaned = val.toUpperCase().replace(/[^A-Z]/g, "");

    const newGrid = { ...userAnswers, [key]: cleaned };
    setUserAnswers(newGrid);
    pushStateToHistory(newGrid);

    // Auto-tab to the next incomplete word if current word is completed and correct
    if (selectedClue && isWordCorrectWithGrid(selectedClue, newGrid)) {
      const nextWord = layout.placedWords
        .sort((a, b) => a.number - b.number)
        .find((w) => !isWordCorrectWithGrid(w, newGrid));

      if (nextWord) {
        setTimeout(() => {
          setSelectedClue(nextWord);
          let focusR = nextWord.row;
          let focusC = nextWord.col;
          for (let i = 0; i < nextWord.word.length; i++) {
            const cr = nextWord.direction === "across" ? nextWord.row : nextWord.row + i;
            const cc = nextWord.direction === "across" ? nextWord.col + i : nextWord.col;
            if (!newGrid[`${cr},${cc}`]) {
              focusR = cr;
              focusC = cc;
              break;
            }
          }
          inputRefs.current[`${focusR},${focusC}`]?.focus();
        }, 150);
      }
    } else if (cleaned && selectedClue) {
      // Auto-advance cursor along current clue track
      const currentIdx = selectedClue.direction === "across"
        ? c - selectedClue.col
        : r - selectedClue.row;

      if (currentIdx < selectedClue.word.length - 1) {
        const nextR = selectedClue.direction === "across" ? r : r + 1;
        const nextC = selectedClue.direction === "across" ? c + 1 : c;
        inputRefs.current[`${nextR},${nextC}`]?.focus();
      }
    }

    checkGridCompletion(newGrid);
  };

  const handleKeyDown = (r: number, c: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    const key = `${r},${c}`;

    // Handle Undo/Redo (Ctrl+Z, Ctrl+Y, Command+Z, Command+Shift+Z)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) {
        handleRedo();
      } else {
        handleUndo();
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      e.preventDefault();
      handleRedo();
      return;
    }

    // Toggle direction on spacebar
    if (e.key === " ") {
      e.preventDefault();
      toggleDirectionAtCell(r, c);
      return;
    }

    // Handle Tab and Shift+Tab navigation between clue starts
    if (e.key === "Tab") {
      e.preventDefault();
      if (!layout) return;

      const sortedWords = [...layout.placedWords].sort((a, b) => a.number - b.number);
      let nextClueIdx = 0;

      if (selectedClue) {
        const currentClueIdx = sortedWords.findIndex(
          (w) => w.number === selectedClue.number && w.direction === selectedClue.direction
        );
        if (e.shiftKey) {
          nextClueIdx = currentClueIdx - 1 < 0 ? sortedWords.length - 1 : currentClueIdx - 1;
        } else {
          nextClueIdx = (currentClueIdx + 1) % sortedWords.length;
        }
      } else if (e.shiftKey) {
        nextClueIdx = sortedWords.length - 1;
      }

      const nextClue = sortedWords[nextClueIdx];
      setSelectedClue(nextClue);
      inputRefs.current[`${nextClue.row},${nextClue.col}`]?.focus();
      return;
    }

    // Handle Arrow Keys Navigation
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
      e.preventDefault();
      let targetR = r;
      let targetC = c;

      if (e.key === "ArrowUp") targetR = r - 1;
      else if (e.key === "ArrowDown") targetR = r + 1;
      else if (e.key === "ArrowLeft") targetC = c - 1;
      else if (e.key === "ArrowRight") targetC = c + 1;

      const targetKey = `${targetR},${targetC}`;
      if (layout && layout.grid[targetKey]) {
        inputRefs.current[targetKey]?.focus();
      }
      return;
    }

    // Handle backspace
    if (e.key === "Backspace") {
      e.preventDefault();

      // If current cell is not empty, clear it first
      if (userAnswers[key]) {
        const newGrid = { ...userAnswers, [key]: "" };
        setUserAnswers(newGrid);
        pushStateToHistory(newGrid);
        checkGridCompletion(newGrid);
      } else if (selectedClue) {
        // Move focus backward if cell was already empty
        const currentIdx = selectedClue.direction === "across"
          ? c - selectedClue.col
          : r - selectedClue.row;

        if (currentIdx > 0) {
          const prevR = selectedClue.direction === "across" ? r : r - 1;
          const prevC = selectedClue.direction === "across" ? c - 1 : c;

          const prevKey = `${prevR},${prevC}`;
          const newGrid = { ...userAnswers, [prevKey]: "" };
          setUserAnswers(newGrid);
          pushStateToHistory(newGrid);
          checkGridCompletion(newGrid);

          inputRefs.current[prevKey]?.focus();
        }
      }
      return;
    }

    // Handle character typing (A-Z)
    if (/^[a-zA-Z]$/.test(e.key) && selectedClue) {
      e.preventDefault();
      const char = e.key.toUpperCase();
      const newGrid = { ...userAnswers, [key]: char };
      setUserAnswers(newGrid);
      pushStateToHistory(newGrid);
      checkGridCompletion(newGrid);

      // Auto-advance focus
      const currentIdx = selectedClue.direction === "across"
        ? c - selectedClue.col
        : r - selectedClue.row;

      if (currentIdx < selectedClue.word.length - 1) {
        const nextR = selectedClue.direction === "across" ? r : r + 1;
        const nextC = selectedClue.direction === "across" ? c + 1 : c;
        inputRefs.current[`${nextR},${nextC}`]?.focus();
      }
    }
  };

  const handleCellFocus = (r: number, c: number) => {
    if (!layout) return;
    const associated = layout.placedWords.filter((w) => {
      for (let i = 0; i < w.word.length; i++) {
        const cr = w.direction === "across" ? w.row : w.row + i;
        const cc = w.direction === "across" ? w.col + i : w.col;
        if (cr === r && cc === c) return true;
      }
      return false;
    });

    if (associated.length > 0) {
      // Prioritize the clue that starts at this coordinate
      const startingClue = associated.find((w) => w.row === r && w.col === c);
      if (startingClue) {
        setSelectedClue(startingClue);
        setActiveCell({ r, c });
        return;
      }

      // If cell belongs to currently selected clue, don't change
      if (selectedClue && associated.includes(selectedClue)) {
        setActiveCell({ r, c });
        return;
      }
      // Default to the first associated clue
      setSelectedClue(associated[0]);
      setActiveCell({ r, c });
    }
  };

  // Double click cell or Space key toggles direction if intersecting two words
  const toggleDirectionAtCell = (r: number, c: number) => {
    if (!layout) return;
    const associated = layout.placedWords.filter((w) => {
      for (let i = 0; i < w.word.length; i++) {
        const cr = w.direction === "across" ? w.row : w.row + i;
        const cc = w.direction === "across" ? w.col + i : w.col;
        if (cr === r && cc === c) return true;
      }
      return false;
    });

    if (associated.length > 1 && selectedClue) {
      const alternative = associated.find((w) => w.direction !== selectedClue.direction);
      if (alternative) {
        setSelectedClue(alternative);
      }
    }
  };

  // Get active cells for the currently selected clue track (for highlight)
  const isCellInActivePath = (r: number, c: number) => {
    if (!selectedClue) return false;
    for (let i = 0; i < selectedClue.word.length; i++) {
      const cr = selectedClue.direction === "across" ? selectedClue.row : selectedClue.row + i;
      const cc = selectedClue.direction === "across" ? selectedClue.col + i : selectedClue.col;
      if (cr === r && cc === c) return true;
    }
    return false;
  };

  // Hint Logic
  const handleRevealLetter = () => {
    if (paused || success || !layout || !activeCell) return;
    const { r, c } = activeCell;
    const key = `${r},${c}`;
    const correctLetter = layout.grid[key]?.letter;
    if (correctLetter) {
      const newGrid = { ...userAnswers, [key]: correctLetter };
      setUserAnswers(newGrid);
      pushStateToHistory(newGrid);
      setHintPenalty((prev) => prev + 1);
      checkGridCompletion(newGrid);

      // Auto-advance cursor to the next cell along the current clue track
      setTimeout(() => {
        if (selectedClue) {
          const currentIdx = selectedClue.direction === "across"
            ? c - selectedClue.col
            : r - selectedClue.row;

          if (currentIdx < selectedClue.word.length - 1) {
            const nextR = selectedClue.direction === "across" ? r : r + 1;
            const nextC = selectedClue.direction === "across" ? c + 1 : c;
            inputRefs.current[`${nextR},${nextC}`]?.focus();
            return;
          }
        }
        inputRefs.current[key]?.focus();
      }, 50);
    }
  };

  const handleRevealWord = () => {
    if (paused || success || !layout || !selectedClue) return;
    const newGrid = { ...userAnswers };
    for (let i = 0; i < selectedClue.word.length; i++) {
      const r = selectedClue.direction === "across" ? selectedClue.row : selectedClue.row + i;
      const c = selectedClue.direction === "across" ? selectedClue.col + i : selectedClue.col;
      const key = `${r},${c}`;
      newGrid[key] = selectedClue.word[i];
    }
    setUserAnswers(newGrid);
    pushStateToHistory(newGrid);
    setHintPenalty((prev) => prev + selectedClue.word.length);
    checkGridCompletion(newGrid);
  };

  const handleSeeVerseContext = () => {
    if (!selectedClue) return;
    const clueId = `${selectedClue.number}-${selectedClue.direction}`;
    if (!revealedVerseClues.includes(clueId)) {
      setRevealedVerseClues((prev) => [...prev, clueId]);
      setHintPenalty((prev) => prev + 5);
    }
    setShowVerseContextId(showVerseContextId === clueId ? null : clueId);
  };

  const getBlankedVerseText = (clue: PlacedWord) => {
    if (!clue.verseText) return "No verse text reference available.";
    let text = clue.verseText;
    const regexStr = clue.word.split("").join("[\\s\\-_]*");
    try {
      const regex = new RegExp(regexStr, "gi");
      text = text.replace(regex, "________");
    } catch (e) {
      text = text.replace(new RegExp(clue.word, "gi"), "________");
    }
    return text;
  };

  // Calculate progress stats
  const getProgressStats = () => {
    if (!layout) return { solved: 0, total: 0, percentage: 0 };
    let solved = 0;
    layout.placedWords.forEach((word) => {
      if (isWordCorrect(word)) {
        solved++;
      }
    });
    const total = layout.placedWords.length;
    const percentage = total > 0 ? Math.round((solved / total) * 100) : 0;
    return { solved, total, percentage };
  };

  // Format Timer output (MM:SS)
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  if (!layout || layout.rows === 0) {
    return (
      <div className="crossword-container" style={{ textAlign: "center", padding: "5rem" }}>
        <h2>Arranging Sacred Syllables...</h2>
      </div>
    );
  }

  const { solved, total, percentage } = getProgressStats();

  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
        .crossword-container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 2rem 1.5rem 4rem;
          font-family: 'EB Garamond', Georgia, serif;
          color: var(--ink, #1e1408);
          background-color: var(--ivory, #fdf6e8);
          min-height: 100vh;
          position: relative;
        }
        .cw-header {
          text-align: center;
          margin-bottom: 1.5rem;
        }
        .cw-header h1 {
          font-family: 'Cinzel', serif;
          font-size: 2.2rem;
          color: var(--saffron, #c8722a);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-bottom: 0.4rem;
        }
        .cw-header p {
          font-style: italic;
          color: var(--ink-soft, #6b4e26);
          font-size: 1.05rem;
        }
        
        /* ── CONTROL STRIP (TIMER & PAUSE & PROGRESS) ── */
        .control-strip {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 2rem;
          background: var(--parchment, #f0e6cc);
          border: 1px solid rgba(212, 168, 67, 0.2);
          border-radius: 4px;
          padding: 0.8rem 1.5rem;
          box-shadow: 0 2px 10px rgba(30, 20, 8, 0.05);
        }
        .timer-display {
          font-family: 'Cinzel', serif;
          font-size: 1.15rem;
          font-weight: 600;
          color: var(--ink-mid, #3d2b10);
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .progress-display {
          display: flex;
          align-items: center;
          gap: 10px;
          font-family: 'Cinzel', serif;
          font-size: 0.9rem;
          color: var(--ink-soft, #6b4e26);
        }
        .progress-bar-outer {
          width: 120px;
          height: 8px;
          background: rgba(30, 20, 8, 0.1);
          border-radius: 4px;
          overflow: hidden;
        }
        .progress-bar-inner {
          height: 100%;
          background: var(--saffron, #c8722a);
          transition: width 0.3s ease;
        }
        .action-buttons {
          display: flex;
          gap: 0.5rem;
        }
        .timer-btn {
          font-family: 'Cinzel', serif;
          font-size: 0.72rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 0.4rem 1rem;
          border: 1.5px solid var(--saffron, #c8722a);
          border-radius: 3px;
          background: transparent;
          color: var(--saffron, #c8722a);
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .timer-btn:hover {
          background: var(--saffron, #c8722a);
          color: #fff;
        }
        .timer-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        /* ── LAYOUT ── */
        .cw-layout {
          display: grid;
          grid-template-columns: 2fr 1fr;
          gap: 2rem;
          align-items: stretch;
        }
        @media (max-width: 768px) {
          .cw-layout {
            grid-template-columns: 1fr;
            gap: 1.5rem;
          }
        }
        
        /* ── GRID PANEL ── */
        .grid-panel {
          position: relative;
          background: var(--parchment, #f0e6cc);
          padding: 1.25rem;
          border-radius: 4px;
          border: 1px solid rgba(212, 168, 67, 0.25);
          box-shadow: 0 4px 20px rgba(30, 20, 8, 0.08);
          display: flex;
          justify-content: center;
          align-items: center;
          overflow: auto;
          min-height: 480px;
        }
        .paused-mask {
          position: absolute;
          inset: 0;
          background: rgba(240, 230, 204, 0.95);
          backdrop-filter: blur(4px);
          z-index: 10;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1rem;
        }
        .paused-mask p {
          font-family: 'Cinzel', serif;
          font-size: 1.2rem;
          color: var(--saffron, #c8722a);
        }
        
        .crossword-grid {
          display: grid;
          grid-template-columns: repeat(${layout.cols}, 1fr);
          gap: 2px;
          width: 100%;
          /* Fit the grid container without overflowing */
          max-width: min(100%, ${layout.cols * 32}px);
          margin: auto;
        }
        
        /* ── CELLS ── */
        .grid-cell {
          aspect-ratio: 1;
          position: relative;
          background-color: transparent;
          border-radius: 3px;
        }
        .grid-cell.inactive-cell {
          background-image: radial-gradient(#d4a843 1px, transparent 1px);
          background-size: 10px 10px;
          opacity: 0.15;
        }
        .grid-cell.active-cell {
          background-color: #fff;
          border: 1px solid rgba(200, 114, 42, 0.15);
          box-shadow: inset 0 1px 2px rgba(0,0,0,0.03);
          transition: background-color 0.15s ease;
        }
        .cell-number {
          position: absolute;
          top: 3px;
          left: 5px;
          font-size: 0.65rem;
          font-weight: 600;
          color: var(--saffron, #c8722a);
          z-index: 2;
          font-family: 'Cinzel', serif;
        }
        .cell-input {
          width: 100%;
          height: 100%;
          border: 1.5px solid transparent;
          text-align: center;
          font-size: clamp(0.9rem, 4vw, 1.25rem);
          font-weight: 600;
          text-transform: uppercase;
          background: transparent;
          color: var(--ink, #1e1408);
          outline: none;
          z-index: 1;
          position: relative;
          font-family: 'Cinzel', serif;
          transition: all 0.12s ease;
        }
        .cell-input:focus {
          border-color: var(--saffron, #c8722a);
          box-shadow: 0 0 6px rgba(200, 114, 42, 0.25);
          background-color: rgba(200, 114, 42, 0.05);
        }
        
        /* ── ACTIVE PATH HIGHLIGHTS ── */
        .grid-cell.active-path {
          background-color: var(--gold-pale, #f5e9c8);
        }
        .grid-cell.active-cell:hover:not(.active-path) {
          background-color: rgba(212, 168, 67, 0.08);
        }
        
        /* ── CLUES PANEL ── */
        .clues-panel {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          height: 100%;
          max-height: 520px;
          overflow-y: auto;
        }
        .clue-group {
          background: var(--parchment, #f0e6cc);
          padding: 1.25rem;
          border-radius: 4px;
          border: 1px solid rgba(212, 168, 67, 0.2);
        }
        .clue-group h3 {
          font-family: 'Cinzel', serif;
          font-size: 0.9rem;
          color: var(--saffron, #c8722a);
          border-bottom: 1.5px solid rgba(212, 168, 67, 0.25);
          padding-bottom: 0.4rem;
          margin-bottom: 0.8rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .clue-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .clue-item {
          font-size: 0.92rem;
          line-height: 1.45;
          cursor: pointer;
          padding: 0.4rem 0.6rem;
          border-radius: 2px;
          transition: background-color 0.15s ease;
          border-left: 2px solid transparent;
        }
        .clue-item:hover {
          background-color: rgba(200, 114, 42, 0.05);
        }
        .clue-item.selected {
          background-color: var(--gold-pale, #f5e9c8);
          border-left: 3px solid var(--saffron, #c8722a);
          font-weight: 500;
        }
        .clue-item.completed-clue {
          opacity: 0.6;
          text-decoration: line-through;
          color: var(--correct, #3a7a2a);
        }
        [data-theme="shyama"] .clue-item.completed-clue {
          color: #34d399;
        }
        
        /* ── SUCCESS BANNER ── */
        .success-overlay {
          text-align: center;
          background: #e8f5e0;
          color: #2e5a20;
          border: 1.5px solid rgba(58, 122, 42, 0.35);
          border-radius: 4px;
          padding: 1.8rem;
          margin-bottom: 2rem;
          animation: scaleUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .success-overlay h2 {
          font-family: 'Cinzel', serif;
          margin-bottom: 0.4rem;
        }
        .btn-reset {
          font-family: 'Cinzel', serif;
          background: var(--saffron, #c8722a);
          color: #fff;
          padding: 0.6rem 1.6rem;
          border: none;
          border-radius: 3px;
          cursor: pointer;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          box-shadow: 0 2px 8px rgba(200,114,42,0.25);
          transition: all 0.2s ease;
        }
        .btn-reset:hover {
          background: #e8954a;
          box-shadow: 0 4px 12px rgba(200,114,42,0.35);
        }
        
        /* ── SHYAMA DARK MODE ── */
        [data-theme="shyama"] .crossword-container {
          background-color: #060b13;
          color: #f1f5f9;
        }
        [data-theme="shyama"] .control-strip,
        [data-theme="shyama"] .grid-panel,
        [data-theme="shyama"] .clue-group {
          background: #0e1320;
          border-color: rgba(16, 185, 129, 0.15);
        }
        [data-theme="shyama"] .progress-bar-outer {
          background: rgba(255, 255, 255, 0.1);
        }
        [data-theme="shyama"] .progress-bar-inner {
          background: #10b981;
        }
        [data-theme="shyama"] .progress-display {
          color: #94a3b8;
        }
        [data-theme="shyama"] .timer-btn {
          border-color: #10b981;
          color: #10b981;
        }
        [data-theme="shyama"] .timer-btn:hover {
          background: #10b981;
          color: #060b13;
        }
        [data-theme="shyama"] .paused-mask {
          background: rgba(14, 19, 32, 0.95);
        }
        [data-theme="shyama"] .grid-cell.active-cell {
          background-color: #161c2d;
          border-color: rgba(16, 185, 129, 0.2);
          color: #f1f5f9;
        }
        [data-theme="shyama"] .cell-input {
          color: #f1f5f9;
        }
        [data-theme="shyama"] .grid-cell.inactive-cell {
          background-image: radial-gradient(#10b981 1px, transparent 1px);
        }
        [data-theme="shyama"] .grid-cell.active-path {
          background-color: #1e293b;
        }
        [data-theme="shyama"] .clue-item.selected {
          background-color: #1e293b;
          border-left-color: var(--saffron, #10b981);
        }
        
        /* Correct cells soft green validation */
        .grid-cell.correct-cell {
          background-color: #e2f3d6 !important;
          border-color: rgba(58, 122, 42, 0.35) !important;
        }
        [data-theme="shyama"] .grid-cell.correct-cell {
          background-color: #0c2b1a !important;
          border-color: rgba(16, 185, 129, 0.45) !important;
        }

        /* Active Clue Banner Styles */
        .active-clue-banner {
          background: var(--parchment, #f0e6cc);
          border: 1.5px solid var(--saffron, #c8722a);
          border-radius: 4px;
          padding: 1.25rem;
          margin-bottom: 2rem;
          box-shadow: 0 4px 15px rgba(30, 20, 8, 0.06);
          position: relative;
        }
        [data-theme="shyama"] .active-clue-banner {
          background: #0e1320;
          border-color: #10b981;
        }
        .active-clue-title {
          font-family: 'Cinzel', serif;
          font-size: 0.95rem;
          color: var(--saffron, #c8722a);
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 0.3rem;
        }
        [data-theme="shyama"] .active-clue-title {
          color: #10b981;
        }
        .active-clue-text {
          font-size: 1.15rem;
          line-height: 1.45;
          margin-bottom: 1rem;
        }
        .hint-actions {
          display: flex;
          gap: 0.75rem;
          flex-wrap: wrap;
        }
        .hint-btn {
          font-family: 'Cinzel', serif;
          font-size: 0.75rem;
          padding: 0.4rem 0.9rem;
          border-radius: 3px;
          cursor: pointer;
          transition: all 0.2s ease;
          border: 1px solid;
          background: transparent;
        }
        .hint-btn.context-btn {
          border-color: var(--saffron, #c8722a);
          color: var(--saffron, #c8722a);
        }
        .hint-btn.context-btn:hover {
          background: var(--saffron, #c8722a);
          color: #fff;
        }
        [data-theme="shyama"] .hint-btn.context-btn {
          border-color: #10b981;
          color: #10b981;
        }
        [data-theme="shyama"] .hint-btn.context-btn:hover {
          background: #10b981;
          color: #060b13;
        }
        .hint-btn.letter-btn {
          border-color: #3f51b5;
          color: #3f51b5;
        }
        .hint-btn.letter-btn:hover {
          background: #3f51b5;
          color: #fff;
        }
        [data-theme="shyama"] .hint-btn.letter-btn {
          border-color: #6366f1;
          color: #6366f1;
        }
        [data-theme="shyama"] .hint-btn.letter-btn:hover {
          background: #6366f1;
          color: #fff;
        }
        .hint-btn.word-btn {
          border-color: #9c27b0;
          color: #9c27b0;
        }
        .hint-btn.word-btn:hover {
          background: #9c27b0;
          color: #fff;
        }
        [data-theme="shyama"] .hint-btn.word-btn {
          border-color: #a855f7;
          color: #a855f7;
        }
        [data-theme="shyama"] .hint-btn.word-btn:hover {
          background: #a855f7;
          color: #fff;
        }

        .verse-context-display {
          margin-top: 1rem;
          padding-top: 0.8rem;
          border-top: 1px dashed rgba(212, 168, 67, 0.25);
        }
        .verse-context-display h4 {
          font-family: 'Cinzel', serif;
          font-size: 0.85rem;
          margin-bottom: 0.3rem;
          color: var(--ink-soft, #6b4e26);
        }
        [data-theme="shyama"] .verse-context-display h4 {
          color: #94a3b8;
        }
        .verse-context-display p {
          font-style: italic;
          line-height: 1.5;
        }

        /* Success Study Card Styles */
        .success-study-card {
          background: var(--parchment, #f0e6cc);
          border: 2px solid var(--saffron, #c8722a);
          border-radius: 6px;
          padding: 2rem;
          margin-bottom: 2.5rem;
          text-align: center;
          box-shadow: 0 6px 25px rgba(30, 20, 8, 0.1);
        }
        [data-theme="shyama"] .success-study-card {
          background: #0e1320;
          border-color: #10b981;
        }
        .success-study-card h2 {
          font-family: 'Cinzel', serif;
          font-size: 2rem;
          color: var(--saffron, #c8722a);
          margin-bottom: 0.5rem;
        }
        [data-theme="shyama"] .success-study-card h2 {
          color: #10b981;
        }
        .xp-gain-badge {
          display: inline-block;
          background: #e8f5e0;
          color: #2e5a20;
          font-family: 'Cinzel', serif;
          font-weight: 600;
          padding: 0.5rem 1.25rem;
          border-radius: 20px;
          margin: 1rem 0;
          border: 1px solid rgba(46, 90, 32, 0.2);
          font-size: 1.1rem;
        }
        [data-theme="shyama"] .xp-gain-badge {
          background: #0c2b1a;
          color: #34d399;
          border-color: rgba(52, 211, 153, 0.2);
        }
        .verses-study-section {
          text-align: left;
          margin-top: 2rem;
          border-top: 2px solid rgba(212, 168, 67, 0.2);
          padding-top: 1.5rem;
        }
        .verses-study-section h3 {
          font-family: 'Cinzel', serif;
          color: var(--saffron, #c8722a);
          font-size: 1.3rem;
          margin-bottom: 0.5rem;
        }
        [data-theme="shyama"] .verses-study-section h3 {
          color: #10b981;
        }
        .study-intro {
          font-size: 0.95rem;
          color: var(--ink-soft, #6b4e26);
          margin-bottom: 1.25rem;
        }
        [data-theme="shyama"] .study-intro {
          color: #94a3b8;
        }
        .verses-review-list {
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }
        .verse-review-card {
          background: rgba(255,255,255,0.5);
          border: 1px solid rgba(212, 168, 67, 0.15);
          padding: 1.25rem;
          border-radius: 4px;
        }
        [data-theme="shyama"] .verse-review-card {
          background: rgba(22, 28, 45, 0.5);
          border-color: rgba(16, 185, 129, 0.1);
        }
        .verse-ref {
          font-family: 'Cinzel', serif;
          font-size: 0.85rem;
          font-weight: 600;
          color: var(--saffron, #c8722a);
          margin-bottom: 0.4rem;
        }
        [data-theme="shyama"] .verse-ref {
          color: #10b981;
        }
        .verse-body {
          font-style: italic;
          line-height: 1.5;
          margin-bottom: 0.8rem;
          font-size: 1.05rem;
        }
        .highlighted-study-word {
          background-color: var(--gold-pale, #f5e9c8);
          font-weight: 600;
          padding: 0.1rem 0.3rem;
          border-radius: 2px;
          color: var(--ink, #1e1408);
          border-bottom: 1.5px solid var(--saffron, #c8722a);
        }
        [data-theme="shyama"] .highlighted-study-word {
          background-color: #1e293b;
          color: #f1f5f9;
          border-bottom-color: #10b981;
        }
        .verse-words-list {
          display: flex;
          flex-wrap: wrap;
          gap: 0.6rem;
        }
        .verse-word-pill {
          background: rgba(212, 168, 67, 0.08);
          border: 1px solid rgba(212, 168, 67, 0.15);
          padding: 0.25rem 0.6rem;
          border-radius: 12px;
          font-size: 0.82rem;
        }
        [data-theme="shyama"] .verse-word-pill {
          background: rgba(16, 185, 129, 0.08);
          border-color: rgba(16, 185, 129, 0.15);
        }
      ` }} />

      <div className="crossword-container">
        <header className="cw-header">
          <h1>Śrī Brahma-saṁhitā Crossword</h1>
          <p>Expand your scriptural vocabulary. Tap a cell or select a clue below to begin.</p>
          <div style={{ marginTop: "0.5rem" }}>
            <span className="rank-badge" style={{ display: "inline-block", padding: "0.3rem 0.8rem", borderRadius: "12px", background: "var(--parchment, #f0e6cc)", border: "1px solid rgba(212, 168, 67, 0.25)", fontSize: "0.85rem", fontFamily: "Cinzel, serif", fontWeight: 600, color: "var(--ink, #1e1408)" }}>
              📜 Bhakti Rank: {(() => {
                if (typeof window === "undefined") return "Jijñāsu";
                const taken = parseInt(localStorage.getItem("bhakti_quizzes_taken") || "0", 10);
                if (taken < 3) return "Jijñāsu";
                const avg = bhaktiXp / taken;
                if (avg >= 6.0) return "Upāsaka";
                if (avg >= 4.0) return "Svādhyāya-rati";
                if (avg >= 2.0) return "Tattva-vit";
                return "Jijñāsu";
              })()} ({bhaktiXp} XP)
            </span>
          </div>
          {loadingSource !== "loading" && (
            <p style={{ fontSize: "0.78rem", marginTop: "0.5rem", opacity: 0.65 }}>
              {loadingSource === "generated"
                ? `📖 ${cluePool.length} clues from generated scripture dataset`
                : "🌱 Using seed clue set — run generate_crossword.py to expand"}
            </p>
          )}
        </header>

        {/* TIMER AND CONTROLS */}
        <div className="control-strip">
          <div className="timer-display" title="Elapsed Time">
            ⏱️ {formatTime(seconds)}
          </div>

          <div className="progress-display">
            <span>Solved: {solved}/{total}</span>
            <div className="progress-bar-outer">
              <div className="progress-bar-inner" style={{ width: `${percentage}%` }}></div>
            </div>
            <span>{percentage}%</span>
          </div>

          <div style={{ fontFamily: "Cinzel, serif", fontWeight: 600, color: "var(--saffron, #c8722a)" }}>
            🏆 Reward: {Math.max(10 - hintPenalty, 0)} XP
          </div>

          <div className="action-buttons">
            <button className="timer-btn" onClick={handleUndo} disabled={historyIndex <= 0} title="Undo (Ctrl+Z)">
              ↶ Undo
            </button>
            <button className="timer-btn" onClick={handleRedo} disabled={historyIndex >= history.length - 1} title="Redo (Ctrl+Y)">
              ↷ Redo
            </button>
            <button className="timer-btn" onClick={() => setPaused(!paused)}>
              {paused ? "▶ Resume" : "⏸ Pause"}
            </button>
            <button className="timer-btn" onClick={initializeNewPuzzle}>
              🔄 New
            </button>
          </div>
        </div>

        {success && (
          <div className="success-study-card divine-aura">
            <h2>🪷 Puzzle Completed! 🪷</h2>
            <p style={{ fontStyle: "italic", fontSize: "1.1rem" }}>
              Solved successfully in <strong>{formatTime(seconds)}</strong>! All glories to your deep absorption.
            </p>

            <div className="xp-gain-badge">
              🏆 +{Math.max(10 - hintPenalty, 0)} Bhakti XP Gained!
            </div>

            <div className="verses-study-section">
              <h3>📖 Scripture Study & Review</h3>
              <p className="study-intro">Contemplate the verses and words you have successfully placed in this crossword:</p>

              <div className="verses-review-list">
                {(() => {
                  const verseMap: Record<string, { text: string; words: PlacedWord[] }> = {};
                  layout.placedWords.forEach((w) => {
                    if (w.verseKey && w.verseText) {
                      if (!verseMap[w.verseKey]) {
                        verseMap[w.verseKey] = { text: w.verseText, words: [] };
                      }
                      verseMap[w.verseKey].words.push(w);
                    }
                  });

                  return Object.entries(verseMap).map(([key, data]) => {
                    let highlightedText = data.text;
                    data.words.forEach((w) => {
                      const regexStr = w.word.split("").join("[\\s\\-_]*");
                      try {
                        const regex = new RegExp(`(${regexStr})`, "gi");
                        highlightedText = highlightedText.replace(regex, `<span class="highlighted-study-word">$1</span>`);
                      } catch (e) {
                        highlightedText = highlightedText.replace(new RegExp(`(${w.word})`, "gi"), `<span class="highlighted-study-word">$1</span>`);
                      }
                    });

                    return (
                      <div key={key} className="verse-review-card">
                        <div className="verse-ref">Text {key}</div>
                        <p className="verse-body" dangerouslySetInnerHTML={{ __html: highlightedText }} />
                        <div className="verse-words-list">
                          {data.words.map((w) => (
                            <span key={w.word} className="verse-word-pill" title={w.clue}>
                              🔑 <strong>{w.word}</strong>: {w.clue}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            <button className="btn-reset" style={{ marginTop: "2rem" }} onClick={initializeNewPuzzle}>
              Begin Next Puzzle
            </button>
          </div>
        )}

        {/* ACTIVE CLUE & HINTS BANNER */}
        {selectedClue && !success && (
          <div className="active-clue-banner divine-aura">
            <div className="active-clue-title">
              Selected Clue: <strong>{selectedClue.number} {selectedClue.direction.toUpperCase()}</strong>
            </div>
            <div className="active-clue-text">{selectedClue.clue}</div>

            <div className="hint-actions">
              <button
                className="hint-btn context-btn"
                onClick={handleSeeVerseContext}
              >
                📖 See Verse (-5 XP)
              </button>
              <button
                className="hint-btn letter-btn"
                onClick={handleRevealLetter}
              >
                💡 Reveal Letter (-1 XP)
              </button>
              <button
                className="hint-btn word-btn"
                onClick={handleRevealWord}
              >
                🔑 Reveal Word (-{selectedClue.word.length} XP)
              </button>
            </div>

            {showVerseContextId === `${selectedClue.number}-${selectedClue.direction}` && (
              <div className="verse-context-display">
                <h4>Scriptural Context:</h4>
                <p>{getBlankedVerseText(selectedClue)}</p>
              </div>
            )}
          </div>
        )}

        <div className="cw-layout">
          {/* GRID PANEL */}
          <div className="grid-panel">
            {paused && (
              <div className="paused-mask">
                <p>Puzzle Paused</p>
                <button className="btn-reset" onClick={() => setPaused(false)}>
                  Resume Study
                </button>
              </div>
            )}

            <div className="crossword-grid">
              {Array.from({ length: layout.rows }).map((_, rIdx) => {
                const r = rIdx;
                return Array.from({ length: layout.cols }).map((_, cIdx) => {
                  const c = cIdx;
                  const key = `${r},${c}`;
                  const cell = layout.grid[key];

                  if (!cell) {
                    return <div key={key} className="grid-cell inactive-cell" />;
                  }

                  const isActivePath = isCellInActivePath(r, c);
                  const isCorrect = isCellInCorrectWord(r, c);

                  return (
                    <div
                      key={key}
                      className={`grid-cell active-cell ${isActivePath ? "active-path" : ""} ${isCorrect ? "correct-cell" : ""}`}
                      onDoubleClick={() => toggleDirectionAtCell(r, c)}
                    >
                      {cell.number && (
                        <span className="cell-number">{cell.number}</span>
                      )}
                      <input
                        ref={(el) => {
                          inputRefs.current[key] = el;
                        }}
                        type="text"
                        maxLength={1}
                        disabled={paused || success}
                        className="cell-input"
                        value={userAnswers[key] || ""}
                        onFocus={() => handleCellFocus(r, c)}
                        onKeyDown={(e) => handleKeyDown(r, c, e)}
                        onChange={(e) => handleInputChange(r, c, e.target.value)}
                      />
                    </div>
                  );
                });
              })}
            </div>
          </div>

          {/* CLUES PANEL */}
          <div className="clues-panel">
            {/* ACROSS */}
            <div className="clue-group">
              <h3>Across</h3>
              <div className="clue-list">
                {layout.placedWords
                  .filter((w) => w.direction === "across")
                  .sort((a, b) => a.number - b.number)
                  .map((clue) => {
                    const isSelected = selectedClue?.number === clue.number && selectedClue.direction === "across";
                    const isCorrect = isWordCorrect(clue);
                    return (
                      <div
                        id={`clue-${clue.number}-across`}
                        key={`${clue.number}-across`}
                        className={`clue-item ${isSelected ? "selected" : ""} ${isCorrect ? "completed-clue" : ""}`}
                        onClick={() => {
                          setSelectedClue(clue);
                          inputRefs.current[`${clue.row},${clue.col}`]?.focus();
                        }}
                      >
                        <strong>{clue.number}.</strong> {clue.clue} {isCorrect && <span style={{ color: "var(--correct, #3a7a2a)", marginLeft: "0.5rem" }}>✓</span>}
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* DOWN */}
            <div className="clue-group">
              <h3>Down</h3>
              <div className="clue-list">
                {layout.placedWords
                  .filter((w) => w.direction === "down")
                  .sort((a, b) => a.number - b.number)
                  .map((clue) => {
                    const isSelected = selectedClue?.number === clue.number && selectedClue.direction === "down";
                    const isCorrect = isWordCorrect(clue);
                    return (
                      <div
                        id={`clue-${clue.number}-down`}
                        key={`${clue.number}-down`}
                        className={`clue-item ${isSelected ? "selected" : ""} ${isCorrect ? "completed-clue" : ""}`}
                        onClick={() => {
                          setSelectedClue(clue);
                          inputRefs.current[`${clue.row},${clue.col}`]?.focus();
                        }}
                      >
                        <strong>{clue.number}.</strong> {clue.clue} {isCorrect && <span style={{ color: "var(--correct, #3a7a2a)", marginLeft: "0.5rem" }}>✓</span>}
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: "3rem" }}>
          <Link href="/" style={{ color: "var(--saffron, #c8722a)", textDecoration: "none", fontSize: "0.95rem", fontFamily: "Cinzel, serif", letterSpacing: "0.05em" }}>
            ← Back to Library
          </Link>
        </div>
      </div>
    </>
  );
}
