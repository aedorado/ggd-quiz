"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import { GAMIFICATION_CONFIG } from "../../../utils/gamificationConfig";

interface Verse {
  verse_number: string;
  devanagari: string;
  verse_text: string;
  translation: string;
  purport?: string;
}

interface BankItem {
  id: string;
  text: string;
  isUsed: boolean;
}

interface AssembledItem {
  id: string;
  text: string;
}

interface SlokaBuilderProps {
  bookId: string;
  playCorrectSound: () => void;
  playWrongSound: () => void;
  triggerParticles: () => void;
  onClose: () => void;
  onComplete: (xpEarned: number, moves: number, seconds: number) => void;
}

const VERSES_PER_ROUND = 5;

// Shuffles an array in place
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Cleans words by removing Sanskrit-specific punctuation, numerals, and brackets
const cleanWords = (text: string, isDevanagari: boolean): string[] => {
  if (!text) return [];
  const tokens = text.split(/[\s\-]+/);
  return tokens
    .map(token => {
      let cleaned = token.trim();
      if (isDevanagari) {
        // Remove danda (।), double danda (॥), Sanskrit numerals (०-९), and brackets/punctuation
        cleaned = cleaned.replace(/[।॥०१२३४५६७८९\(\)\[\]\{\}\.,;:!\?\"']/g, "");
      } else {
        // For Roman transliteration, remove brackets and standard punctuation (preserve internal hyphens)
        cleaned = cleaned.replace(/[\(\)\[\]\{\}\.,;:!\?\"']/g, "");
      }
      return cleaned;
    })
    .filter(w => w.length > 0);
};

// Split text by newlines first to preserve verse lines
const parseVerseLines = (text: string, isDevanagari: boolean): string[][] => {
  if (!text) return [];
  const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
  return lines.map(line => cleanWords(line, isDevanagari)).filter(words => words.length > 0);
};

export default function SlokaBuilder({
  bookId,
  playCorrectSound,
  playWrongSound,
  triggerParticles,
  onClose,
  onComplete,
}: SlokaBuilderProps) {
  const [gameState, setGameState] = useState<"loading" | "error" | "active" | "finished">("loading");
  const [isDevanagari, setIsDevanagari] = useState(false);

  const [allVerses, setAllVerses] = useState<Verse[]>([]);
  const [roundVerses, setRoundVerses] = useState<Verse[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);

  // Game states per verse
  const [wordBank, setWordBank] = useState<BankItem[]>([]);
  const [assembled, setAssembled] = useState<(AssembledItem | null)[]>([]);
  const [isChecked, setIsChecked] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [isSwapped, setIsSwapped] = useState(false);

  // Scoring States
  const [slokaXp, setSlokaXp] = useState(GAMIFICATION_CONFIG.xpRewards.builderBase || 10);
  const [roundXpEarned, setRoundXpEarned] = useState(0);

  // Metrics
  const [hintCount, setHintCount] = useState(0);
  const [mistakeCount, setMistakeCount] = useState(0);
  const [totalTimer, setTotalTimer] = useState(0);
  const timerRef = useRef<any>(null);

  // Drag and Drop Visual States
  const [dragOverSlotIdx, setDragOverSlotIdx] = useState<number | null>(null);
  const [isDragOverBank, setIsDragOverBank] = useState<boolean>(false);

  // Compute structured lines and corresponding flat start indices
  const { correctLines, lineStartIndices } = useMemo(() => {
    const verse = roundVerses[currentIdx];
    if (!verse) return { correctLines: [], lineStartIndices: [] };

    const targetText = isDevanagari ? (verse.devanagari || verse.verse_text) : verse.verse_text;
    const lines = parseVerseLines(targetText, isDevanagari);

    const indices: number[] = [];
    let sum = 0;
    lines.forEach(line => {
      indices.push(sum);
      sum += line.length;
    });

    return { correctLines: lines, lineStartIndices: indices };
  }, [roundVerses, currentIdx, isDevanagari]);

  // Load verses from JSON data source
  useEffect(() => {
    async function loadBookData() {
      try {
        const url = `/${bookId}/${bookId === "bg" ? "gita" : bookId}.json`;
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`HTTP error ${res.status}`);
        }
        const data = await res.json();

        const flatVerses: Verse[] = [];

        if (bookId === "bg") {
          // Parse chapters structure
          Object.values(data).forEach((ch: any) => {
            if (ch && Array.isArray(ch.verses)) {
              flatVerses.push(...ch.verses);
            }
          });
        } else {
          // Standard array structure (like bs.json list or books with simple structures)
          if (Array.isArray(data)) {
            data.forEach((v: any, index) => {
              flatVerses.push({
                verse_number: v.text_number || String(index + 1),
                devanagari: v.devanagari || "",
                verse_text: v.verse_text || v.content || "",
                translation: v.translation || v.content || "",
              });
            });
          } else if (typeof data === "object") {
            Object.entries(data).forEach(([key, val]: [string, any]) => {
              flatVerses.push({
                verse_number: key,
                devanagari: val.devanagari || "",
                verse_text: val.verse_text || val.text || "",
                translation: val.translation || val.content || "",
              });
            });
          }
        }

        // Filter out verses that are too long/short or missing target fields
        const validVerses = flatVerses.filter(v => {
          const text = v.verse_text || v.devanagari;
          if (!text) return false;
          const words = cleanWords(text, false);
          // Playable ranges: between 4 and 18 words
          return words.length >= 4 && words.length <= 18;
        });

        if (validVerses.length === 0) {
          throw new Error("No playable verses found (4-18 words target).");
        }

        setAllVerses(validVerses);
        startRound(validVerses);
      } catch (err) {
        console.error("Failed to load verses for SlokaBuilder:", err);
        setGameState("error");
      }
    }
    loadBookData();

    return () => clearInterval(timerRef.current);
  }, [bookId]);

  // Global Timer
  useEffect(() => {
    if (gameState === "active") {
      timerRef.current = setInterval(() => {
        setTotalTimer(t => t + 1);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [gameState]);

  const startRound = (versesPool: Verse[]) => {
    const selected = shuffle(versesPool).slice(0, Math.min(VERSES_PER_ROUND, versesPool.length));
    setRoundVerses(selected);
    setCurrentIdx(0);
    setTotalTimer(0);
    setHintCount(0);
    setMistakeCount(0);
    setRoundXpEarned(0);
    setGameState("active");
    setupVerse(selected[0], isDevanagari);
  };

  const setupVerse = (verse: Verse, useDevanagari: boolean, keepSwapped = false) => {
    const targetText = useDevanagari ? (verse.devanagari || verse.verse_text) : verse.verse_text;
    const words = cleanWords(targetText, useDevanagari);

    const bank = words.map((w, idx) => ({
      id: `${w}-${idx}`,
      text: w,
      isUsed: false,
    }));

    setWordBank(shuffle(bank));
    setAssembled(new Array(words.length).fill(null));
    setIsChecked(false);
    setIsCorrect(false);
    if (keepSwapped) {
      setSlokaXp(0);
      setIsSwapped(true);
    } else {
      setSlokaXp(GAMIFICATION_CONFIG.xpRewards.builderBase || 10);
      setIsSwapped(false);
    }
  };

  // Switch Script and Reset Current Progress
  const handleScriptToggle = (checkedDevanagari: boolean) => {
    setIsDevanagari(checkedDevanagari);
    if (gameState === "active" && roundVerses[currentIdx]) {
      setupVerse(roundVerses[currentIdx], checkedDevanagari, isSwapped);
    }
  };

  // Move word from Bank to first empty slot in Assembly Area
  const handleWordSelect = (item: BankItem) => {
    if (isChecked && isCorrect) return; // Locked on success

    const firstEmptyIdx = assembled.findIndex(slot => slot === null);
    if (firstEmptyIdx === -1) return; // All slots filled

    // Mark as used in Bank
    setWordBank(prev => prev.map(b => b.id === item.id ? { ...b, isUsed: true } : b));

    // Place at first empty slot
    setAssembled(prev => {
      const next = [...prev];
      next[firstEmptyIdx] = { id: item.id, text: item.text };
      return next;
    });

    // Clear check state
    setIsChecked(false);
  };

  // Move word from a specific Slot back to Bank
  const handleWordRemove = (item: AssembledItem, slotIdx: number) => {
    if (isChecked && isCorrect) return; // Locked on success

    // Mark as unused in Bank
    setWordBank(prev => prev.map(b => b.id === item.id ? { ...b, isUsed: false } : b));

    // Clear that specific slot
    setAssembled(prev => {
      const next = [...prev];
      next[slotIdx] = null;
      return next;
    });

    // Clear check state
    setIsChecked(false);
  };

  // Check user answer
  const handleCheck = () => {
    const verse = roundVerses[currentIdx];
    const targetText = isDevanagari ? (verse.devanagari || verse.verse_text) : verse.verse_text;
    const targetWords = cleanWords(targetText, isDevanagari);

    if (assembled.some(slot => slot === null)) {
      playWrongSound();
      setMistakeCount(prev => prev + 1);
      setIsCorrect(false);
      setIsChecked(true);
      return;
    }

    const userWords = assembled.map(a => a ? a.text : "");
    const matchesAll = userWords.every((word, idx) => word === targetWords[idx]);

    if (matchesAll) {
      playCorrectSound();
      triggerParticles();
      setIsCorrect(true);
      setIsChecked(true);
      setRoundXpEarned(prev => prev + slokaXp);
    } else {
      playWrongSound();
      setMistakeCount(prev => prev + 1);
      setIsCorrect(false);
      setIsChecked(true);
    }
  };

  // Reveal correct word in a random empty or incorrect space
  const handleHint = () => {
    if (isChecked && isCorrect) return;

    const verse = roundVerses[currentIdx];
    const targetText = isDevanagari ? (verse.devanagari || verse.verse_text) : verse.verse_text;
    const targetWords = cleanWords(targetText, isDevanagari);

    // Find all slots that are not currently correct
    const incorrectIndices: number[] = [];
    targetWords.forEach((correctWord, idx) => {
      const current = assembled[idx];
      if (!current || current.text !== correctWord) {
        incorrectIndices.push(idx);
      }
    });

    if (incorrectIndices.length === 0) return; // All slots already correct

    // Select a random slot index to correct
    const targetSlotIdx = incorrectIndices[Math.floor(Math.random() * incorrectIndices.length)];
    const correctWord = targetWords[targetSlotIdx];

    // If there is currently an incorrect item sitting in targetSlotIdx, return it to the bank first
    const occupiedItem = assembled[targetSlotIdx];
    let updatedBank = [...wordBank];
    if (occupiedItem) {
      updatedBank = updatedBank.map(b => b.id === occupiedItem.id ? { ...b, isUsed: false } : b);
    }

    // Try to find an unused correct word card in the bank
    const bankItemIdx = updatedBank.findIndex(b => b.text === correctWord && !b.isUsed);
    if (bankItemIdx !== -1) {
      const bankItem = updatedBank[bankItemIdx];

      // Lock as used in the bank
      updatedBank[bankItemIdx] = { ...bankItem, isUsed: true };
      setWordBank(updatedBank);

      // Populate specifically at the target slot
      setAssembled(prev => {
        const next = [...prev];
        next[targetSlotIdx] = { id: bankItem.id, text: bankItem.text };
        return next;
      });

      // Deduct reward points for this shloka
      setSlokaXp(prev => Math.max(0, prev - 1));
      setHintCount(prev => prev + 1);
      setIsChecked(false);
    } else {
      // The correct word card is already placed in the workspace but at an incorrect position
      // Find where it is currently placed incorrectly
      const wrongPosIdx = assembled.findIndex((slot, idx) =>
        slot !== null && slot.text === correctWord && targetWords[idx] !== correctWord
      );

      if (wrongPosIdx !== -1) {
        const itemToMove = assembled[wrongPosIdx];

        // Move the item from the wrong slot directly to the correct hint slot
        setAssembled(prev => {
          const next = [...prev];
          next[wrongPosIdx] = null;
          next[targetSlotIdx] = itemToMove;
          return next;
        });

        // Set updated bank state (returning the replaced targetSlotIdx item to the bank)
        setWordBank(updatedBank);
        setSlokaXp(prev => Math.max(0, prev - 1));
        setHintCount(prev => prev + 1);
        setIsChecked(false);
      }
    }
  };

  // Reset current verse progress
  const handleReset = () => {
    setupVerse(roundVerses[currentIdx], isDevanagari, isSwapped);
  };

  // Change the current shloka, reward goes to 0 XP, can be done unlimited times
  const handleChangeShloka = () => {
    if (isChecked && isCorrect) return;

    // Filter allVerses to find ones not currently in roundVerses
    const usedVerseNumbers = new Set(roundVerses.map(v => v.verse_number));
    let available = allVerses.filter(v => !usedVerseNumbers.has(v.verse_number));

    // If no unused verses are available, allow any verse except the current one
    if (available.length === 0) {
      available = allVerses.filter(v => v.verse_number !== currentVerse.verse_number);
    }

    if (available.length === 0) return;

    const newVerse = available[Math.floor(Math.random() * available.length)];

    // Update roundVerses at currentIdx
    setRoundVerses(prev => {
      const next = [...prev];
      next[currentIdx] = newVerse;
      return next;
    });

    setupVerse(newVerse, isDevanagari, true);
  };

  // Next Verse or Complete Game
  const handleNext = () => {
    if (currentIdx + 1 < roundVerses.length) {
      setCurrentIdx(prev => prev + 1);
      setupVerse(roundVerses[currentIdx + 1], isDevanagari, false);
    } else {
      finishGame();
    }
  };

  const finishGame = () => {
    setGameState("finished");
    onComplete(roundXpEarned, mistakeCount + hintCount, totalTimer);
  };

  // ── DRAG AND DROP HANDLERS ──

  const handleDragStartFromBank = (e: React.DragEvent, itemId: string) => {
    if (isChecked && isCorrect) return;
    e.dataTransfer.setData("type", "bank");
    e.dataTransfer.setData("itemId", itemId);
  };

  const handleDragStartFromSlot = (e: React.DragEvent, itemId: string, slotIdx: number) => {
    if (isChecked && isCorrect) return;
    e.dataTransfer.setData("type", "slot");
    e.dataTransfer.setData("itemId", itemId);
    e.dataTransfer.setData("sourceSlotIdx", String(slotIdx));
  };

  const handleDragEnterSlot = (e: React.DragEvent, slotIdx: number) => {
    e.preventDefault();
    if (isChecked && isCorrect) return;
    setDragOverSlotIdx(slotIdx);
  };

  const handleDragLeaveSlot = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverSlotIdx(null);
  };

  const handleDropOnSlot = (e: React.DragEvent, targetSlotIdx: number) => {
    if (isChecked && isCorrect) return;
    e.preventDefault();
    setDragOverSlotIdx(null);
    const type = e.dataTransfer.getData("type");
    const itemId = e.dataTransfer.getData("itemId");

    if (type === "bank") {
      const item = wordBank.find(b => b.id === itemId);
      if (!item || item.isUsed) return;

      const occupied = assembled[targetSlotIdx];

      // Update Bank item locks
      setWordBank(prev => prev.map(b => {
        if (b.id === itemId) return { ...b, isUsed: true };
        if (occupied && b.id === occupied.id) return { ...b, isUsed: false };
        return b;
      }));

      // Update Assembly array
      setAssembled(prev => {
        const next = [...prev];
        next[targetSlotIdx] = { id: item.id, text: item.text };
        return next;
      });
      setIsChecked(false);
    } else if (type === "slot") {
      const sourceSlotIdxStr = e.dataTransfer.getData("sourceSlotIdx");
      if (!sourceSlotIdxStr) return;
      const sourceSlotIdx = parseInt(sourceSlotIdxStr, 10);
      if (sourceSlotIdx === targetSlotIdx) return;

      setAssembled(prev => {
        const next = [...prev];
        const itemToMove = next[sourceSlotIdx];
        const occupied = next[targetSlotIdx];

        next[targetSlotIdx] = itemToMove;
        next[sourceSlotIdx] = occupied;
        return next;
      });
      setIsChecked(false);
    }
  };

  const handleDragEnterBank = (e: React.DragEvent) => {
    e.preventDefault();
    if (isChecked && isCorrect) return;
    setIsDragOverBank(true);
  };

  const handleDragLeaveBank = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOverBank(false);
  };

  const handleDropOnBank = (e: React.DragEvent) => {
    if (isChecked && isCorrect) return;
    e.preventDefault();
    setIsDragOverBank(false);
    const type = e.dataTransfer.getData("type");
    const itemId = e.dataTransfer.getData("itemId");
    const sourceSlotIdxStr = e.dataTransfer.getData("sourceSlotIdx");

    if (type === "slot" && sourceSlotIdxStr) {
      const sourceSlotIdx = parseInt(sourceSlotIdxStr, 10);
      const item = assembled[sourceSlotIdx];
      if (item && item.id === itemId) {
        handleWordRemove(item, sourceSlotIdx);
      }
    }
  };

  if (gameState === "loading") {
    return (
      <div style={{ textAlign: "center", padding: "2rem" }}>
        <h3 style={{ color: "var(--saffron)" }}>Loading Sloka Builder...</h3>
      </div>
    );
  }

  if (gameState === "error") {
    return (
      <div style={{ textAlign: "center", padding: "2rem" }}>
        <h3 style={{ color: "var(--wrong)" }}>Error: Could not load scriptural verses.</h3>
        <button className="btn btn-secondary" onClick={onClose} style={{ marginTop: "1rem" }}>Back</button>
      </div>
    );
  }

  const currentVerse = roundVerses[currentIdx];

  return (
    <div className="quiz-card divine-aura fade-in" style={{ maxWidth: "800px" }}>
      {/* ── GAME STATUS BAR ── */}
      {gameState === "active" && (
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem", color: "var(--ink-mid)", fontSize: "0.88rem" }}>
          <span>Verse <strong>{currentIdx + 1}</strong> of <strong>{roundVerses.length}</strong></span>
          <span>Time: <strong>{Math.floor(totalTimer / 60)}:{(totalTimer % 60).toString().padStart(2, '0')}</strong></span>
          <span style={{ color: "var(--saffron)", fontWeight: "600" }}>Reward: {slokaXp} GB</span>
        </div>
      )}

      {/* ── MAIN CONTENT ── */}
      {gameState === "active" && currentVerse && (
        <div>
          {/* Script Selection Switch */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.2rem", paddingBottom: "0.8rem", borderBottom: "1px solid var(--border)" }}>
            <span style={{ fontSize: "0.8rem", color: "var(--ink-soft)" }}>
              Reference: <strong>Chapter {currentVerse.verse_number.split('.')[0]}, Verse {currentVerse.verse_number}</strong>
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontSize: "0.85rem", fontWeight: "600", color: isDevanagari ? "var(--ink-soft)" : "var(--saffron)" }}>Roman</span>
              <label className="switch" style={{ position: "relative", display: "inline-block", width: "42px", height: "22px" }}>
                <input
                  type="checkbox"
                  checked={isDevanagari}
                  onChange={(e) => handleScriptToggle(e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span className="slider" style={{
                  position: "absolute",
                  cursor: "pointer",
                  top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: "var(--border)",
                  transition: "0.3s",
                  borderRadius: "22px"
                }}>
                  <span style={{
                    position: "absolute",
                    height: "16px",
                    width: "16px",
                    left: isDevanagari ? "22px" : "4px",
                    bottom: "3px",
                    backgroundColor: "white",
                    transition: "0.3s",
                    borderRadius: "50%"
                  }} />
                </span>
              </label>
              <span style={{ fontSize: "0.85rem", fontWeight: "600", color: isDevanagari ? "var(--saffron)" : "var(--ink-soft)" }}>Devanagari</span>
            </div>
          </div>

          {/* CLUE (English Translation) */}
          <div style={{
            backgroundColor: "var(--parchment)",
            borderRadius: "8px",
            padding: "1.2rem 1.6rem",
            fontSize: "1rem",
            color: "var(--ink)",
            lineHeight: "1.5",
            marginBottom: "1.5rem",
            textAlign: "center",
            boxShadow: "inset 0 1px 3px rgba(0,0,0,0.02)"
          }}>
            <span style={{
              display: "block",
              fontSize: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "1px",
              color: "var(--saffron)",
              fontWeight: "700",
              marginBottom: "0.4rem"
            }}>
              English Translation (Clue)
            </span>
            "{currentVerse.translation}"
          </div>

          {/* ASSEMBLY WORKSPACE */}
          <div style={{
            minHeight: "120px",
            border: isChecked
              ? (isCorrect ? "2px solid var(--correct)" : "2px dashed var(--wrong)")
              : "2px dashed var(--border)",
            backgroundColor: isChecked
              ? (isCorrect ? "var(--correct-bg)" : "#fff8f8")
              : "var(--ivory)",
            borderRadius: "10px",
            padding: "1.2rem",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.8rem",
            marginBottom: "1.5rem",
            transition: "all 0.25s ease-in-out"
          }}>
            {correctLines.length === 0 ? (
              <span style={{ color: "var(--ink-soft)", fontSize: "0.9rem", fontStyle: "italic" }}>
                Tap or drag words below to assemble the sloka...
              </span>
            ) : (
              correctLines.map((line, lineIdx) => {
                const startIdx = lineStartIndices[lineIdx];
                return (
                  <div key={`line-${lineIdx}`} style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                    justifyContent: "center",
                    width: "100%"
                  }}>
                    {line.map((_, wordIdx) => {
                      const flatIdx = startIdx + wordIdx;
                      const item = assembled[flatIdx];
                      const isDraggedOver = dragOverSlotIdx === flatIdx;
                      return item ? (
                        <button
                          key={`assembled-${item.id}`}
                          draggable={!(isChecked && isCorrect)}
                          onDragStart={(e) => handleDragStartFromSlot(e, item.id, flatIdx)}
                          onDragOver={(e) => e.preventDefault()}
                          onDragEnter={(e) => handleDragEnterSlot(e, flatIdx)}
                          onDragLeave={handleDragLeaveSlot}
                          onDrop={(e) => handleDropOnSlot(e, flatIdx)}
                          onClick={() => handleWordRemove(item, flatIdx)}
                          className="btn"
                          style={{
                            backgroundColor: isDraggedOver ? "var(--gold-pale)" : "var(--parchment)",
                            color: "var(--ink)",
                            border: isDraggedOver ? "2px solid var(--saffron)" : "1px solid var(--border)",
                            padding: "0.4rem 0.8rem",
                            fontSize: "0.95rem",
                            borderRadius: "6px",
                            cursor: (isChecked && isCorrect) ? "default" : "grab",
                            boxShadow: isDraggedOver ? "0 0 10px rgba(232, 149, 74, 0.4)" : "0 2px 4px rgba(0,0,0,0.03)",
                            whiteSpace: "nowrap",
                            height: "38px",
                            transform: isDraggedOver ? "scale(1.05)" : "scale(1)",
                            transition: "all 0.15s ease"
                          }}
                          onMouseEnter={(e) => {
                            if (!isDraggedOver) e.currentTarget.style.transform = "scale(1.03)";
                          }}
                          onMouseLeave={(e) => {
                            if (!isDraggedOver) e.currentTarget.style.transform = "scale(1)";
                          }}
                        >
                          {item.text}
                        </button>
                      ) : (
                        <div
                          key={`empty-${lineIdx}-${wordIdx}`}
                          onDragOver={(e) => e.preventDefault()}
                          onDragEnter={(e) => handleDragEnterSlot(e, flatIdx)}
                          onDragLeave={handleDragLeaveSlot}
                          onDrop={(e) => handleDropOnSlot(e, flatIdx)}
                          style={{
                            width: "80px",
                            height: "38px",
                            border: isChecked
                              ? (isCorrect ? "2px solid var(--correct)" : "2px dashed var(--wrong)")
                              : isDraggedOver ? "2px solid var(--saffron)" : "1px dashed var(--border)",
                            backgroundColor: isDraggedOver ? "var(--gold-pale)" : "rgba(0,0,0,0.02)",
                            borderRadius: "6px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "0.75rem",
                            color: isDraggedOver ? "var(--saffron)" : "var(--border)",
                            fontWeight: "500",
                            transform: isDraggedOver ? "scale(1.05)" : "scale(1)",
                            boxShadow: isDraggedOver ? "0 0 10px rgba(232, 149, 74, 0.4)" : "none",
                            transition: "all 0.15s ease"
                          }}
                        >
                          {flatIdx + 1}
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>

          {/* WORD BANK */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDragEnter={handleDragEnterBank}
            onDragLeave={handleDragLeaveBank}
            onDrop={handleDropOnBank}
            style={{
              minHeight: "80px",
              display: "flex",
              flexWrap: "wrap",
              gap: "0.5rem",
              justifyContent: "center",
              alignItems: "center",
              padding: "1rem",
              backgroundColor: isDragOverBank ? "var(--gold-pale)" : "rgba(0,0,0,0.02)",
              border: isDragOverBank ? "1px dashed var(--saffron)" : "1px solid transparent",
              borderRadius: "10px",
              transition: "all 0.15s ease",
              marginBottom: "2rem"
            }}
          >
            {wordBank.map((item) => (
              <button
                key={item.id}
                disabled={item.isUsed || (isChecked && isCorrect)}
                draggable={!item.isUsed && !(isChecked && isCorrect)}
                onDragStart={(e) => handleDragStartFromBank(e, item.id)}
                onClick={() => handleWordSelect(item)}
                className="btn"
                style={{
                  backgroundColor: item.isUsed ? "rgba(0,0,0,0.05)" : "var(--ivory)",
                  color: item.isUsed ? "transparent" : "var(--ink)",
                  border: item.isUsed ? "1px solid transparent" : "1px solid var(--border)",
                  padding: "0.4rem 0.8rem",
                  fontSize: "0.95rem",
                  borderRadius: "6px",
                  cursor: item.isUsed ? "default" : (isChecked && isCorrect) ? "default" : "grab",
                  boxShadow: item.isUsed ? "none" : "0 2px 4px rgba(0,0,0,0.03)",
                  transition: "all 0.2s",
                  opacity: item.isUsed ? 0.35 : 1,
                  userSelect: item.isUsed ? "none" : "auto"
                }}
                onMouseEnter={(e) => {
                  if (!item.isUsed) {
                    e.currentTarget.style.borderColor = "var(--saffron)";
                    e.currentTarget.style.transform = "translateY(-1px)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!item.isUsed) {
                    e.currentTarget.style.borderColor = "var(--border)";
                    e.currentTarget.style.transform = "translateY(0)";
                  }
                }}
              >
                {item.text}
              </button>
            ))}
          </div>

          {/* ACTION BAR */}
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.8rem", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button className="btn btn-secondary" onClick={onClose}>
                Quit
              </button>
              <button className="btn btn-secondary" onClick={handleReset} disabled={assembled.every(slot => slot === null) || (isChecked && isCorrect)}>
                Reset
              </button>
              <button className="btn btn-secondary" onClick={handleChangeShloka} disabled={isChecked && isCorrect}>
                🔄 Change Shloka
              </button>
              <button className="btn btn-secondary" onClick={handleHint} disabled={(isChecked && isCorrect) || slokaXp === 0}>
                💡 Hint
              </button>
            </div>

            {isChecked && isCorrect ? (
              <button className="btn btn-primary" onClick={handleNext} style={{ backgroundColor: "var(--correct)" }}>
                {currentIdx + 1 === roundVerses.length ? "Finish Round" : "Next Sloka →"}
              </button>
            ) : (
              <button className="btn btn-primary" onClick={handleCheck} disabled={assembled.every(slot => slot === null)}>
                Check Sequence
              </button>
            )}
          </div>

          {/* Feedback Display */}
          {isChecked && (
            <div style={{
              marginTop: "1rem",
              padding: "0.8rem",
              borderRadius: "8px",
              textAlign: "center",
              fontWeight: "600",
              fontSize: "0.95rem",
              color: isCorrect ? "var(--correct)" : "var(--wrong)",
              backgroundColor: isCorrect ? "var(--correct-bg)" : "#ffebee"
            }}>
              {isCorrect ? `🎉 Beautifully Done! You compiled the verse correctly and earned ${slokaXp} GB!` : "❌ Order incorrect. Review and try again, or use a Hint!"}
            </div>
          )}
        </div>
      )}

      {/* ── COMPLETED SCREEN ── */}
      {gameState === "finished" && (
        <div style={{ textAlign: "center", padding: "1.5rem" }}>
          <span style={{ fontSize: "3rem" }}>🪷</span>
          <h2 style={{ color: "var(--correct)", margin: "0.5rem 0" }}>Round Complete!</h2>
          <p style={{ color: "var(--ink-soft)", fontSize: "0.92rem", marginBottom: "2rem" }}>
            You completed sequencing all 5 verses! Your devotional focus has been rewarded with Gunja Berries (GB).
          </p>

          <div style={{
            backgroundColor: "var(--parchment)",
            borderRadius: "12px",
            padding: "1.5rem",
            marginBottom: "2rem",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "1rem",
            textAlign: "left"
          }}>
            <div>
              <span style={{ color: "var(--ink-soft)", fontSize: "0.8rem", display: "block" }}>Time Taken:</span>
              <strong style={{ fontSize: "1.1rem" }}>{Math.floor(totalTimer / 60)}m {totalTimer % 60}s</strong>
            </div>
            <div>
              <span style={{ color: "var(--ink-soft)", fontSize: "0.8rem", display: "block" }}>Hints Applied:</span>
              <strong style={{ fontSize: "1.1rem" }}>{hintCount}</strong>
            </div>
            <div>
              <span style={{ color: "var(--ink-soft)", fontSize: "0.8rem", display: "block" }}>Mistakes Corrected:</span>
              <strong style={{ fontSize: "1.1rem", color: mistakeCount > 0 ? "var(--wrong)" : "var(--correct)" }}>{mistakeCount}</strong>
            </div>
            <div>
              <span style={{ color: "var(--ink-soft)", fontSize: "0.8rem", display: "block" }}>Total GB Earned:</span>
              <strong style={{ fontSize: "1.1rem", color: "var(--accent)" }}>{roundXpEarned} GB</strong>
            </div>
          </div>

          <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
            <button className="btn btn-primary" onClick={() => startRound(allVerses)}>
              Play Again
            </button>
            <button className="btn btn-secondary" onClick={onClose}>
              Back to Library
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
