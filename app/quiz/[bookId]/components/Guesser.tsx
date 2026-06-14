"use client";

import React, { useState, useEffect } from "react";
import { GAMIFICATION_CONFIG } from "../../../utils/gamificationConfig";

interface Entity {
  name: string;
  type: string;
  lila: string;
  attributes?: { att: string; verse: string }[];
  relations?: { type: string; target_id: string; verse: string }[];
  incarnation_of?: any[];
  mentioned_in?: string[];
}

interface GuesserProps {
  bookId: string;
  playCorrectSound: () => void;
  playWrongSound: () => void;
  triggerParticles: () => void;
  onClose: () => void;
  onComplete: (xpEarned: number, moves: number, seconds: number) => void;
}

interface GuessRound {
  correctEntityId: string;
  correctName: string;
  clues: string[];
  options: string[];
  explanation: string;
  clueVerses: { text: string; ref: string }[];
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function Guesser({
  bookId,
  playCorrectSound,
  playWrongSound,
  triggerParticles,
  onClose,
  onComplete,
}: GuesserProps) {
  const [rounds, setRounds] = useState<GuessRound[]>([]);
  const [currentRoundIdx, setCurrentRoundIdx] = useState(0);
  const [revealedCluesCount, setRevealedCluesCount] = useState(1);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [score, setScore] = useState(0); // number of correct answers
  const [totalXpEarned, setTotalXpEarned] = useState(0);
  const [showExplanation, setShowExplanation] = useState(false);

  // Timer Effect
  useEffect(() => {
    let interval: any;
    if (isActive) {
      interval = setInterval(() => {
        setSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isActive]);

  // Load identities & construct rounds
  useEffect(() => {
    async function loadIdentities() {
      try {
        const res = await fetch(`/${bookId}/identities.json`);
        if (!res.ok) throw new Error("Failed to load identities");
        const data = await res.json();

        const entities: Record<string, Entity> = data.entities || {};
        const verses: Record<string, { text?: string; content?: string }> = data.verses || {};

        // Filter valid personalities
        const allPersonalities = Object.entries(entities).filter(
          ([_, ent]) => ent.type === "personality" && ent.name
        );

        interface CluePoolItem {
          text: string;
          verseRef: string;
        }

        // Helper to normalize text (remove diacritics/accents like ā, ī, ū, ś, ḍ, etc. and strip non-alphanumeric characters)
        const cleanText = (t: string) => {
          return t
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "") // remove diacritics
            .replace(/[-_]/g, " ")
            .replace(/[^a-zA-Z0-9 ]/g, "")
            .toLowerCase()
            .trim();
        };

        const targetPersonalities: { id: string; entity: Entity; uniqueClues: CluePoolItem[] }[] = [];

        for (const [id, entity] of allPersonalities) {
          const cluePool: CluePoolItem[] = [];

          // 1. Gather attribute clues
          if (entity.attributes) {
            entity.attributes.forEach((attr) => {
              if (attr.att) {
                cluePool.push({
                  text: attr.att.charAt(0).toUpperCase() + attr.att.slice(1),
                  verseRef: attr.verse || entity.mentioned_in?.[0] || ""
                });
              }
            });
          }

          // 2. Gather relation clues
          if (entity.relations) {
            entity.relations.forEach((rel) => {
              const target = entities[rel.target_id]?.name || rel.target_id;
              const relType = rel.type.replace(/_/g, " ");
              const connectWord = relType.endsWith(" of") ? "" : " of";
              cluePool.push({
                text: `Known relation: ${relType}${connectWord} ${target}`,
                verseRef: rel.verse || entity.mentioned_in?.[0] || ""
              });
            });
          }

          // 3. Gather incarnation clues
          if (entity.incarnation_of) {
            entity.incarnation_of.forEach((inc) => {
              const prevId = typeof inc === "object" && inc !== null ? inc.id : inc;
              const verse = typeof inc === "object" && inc !== null ? inc.verse : (entity.mentioned_in?.[0] || "");
              const prevName = entities[prevId]?.name || prevId;
              cluePool.push({
                text: `Formerly / eternally appeared as ${prevName}`,
                verseRef: verse || ""
              });
            });
          }

          // First shuffle all clues in the pool to guarantee complete random selection during deduplication
          const shuffledRawPool = shuffle(cluePool);

          // Filter out substring overlaps and redundant duplicates
          const uniqueCluePool: CluePoolItem[] = [];
          shuffledRawPool.forEach((item) => {
            const normalized = cleanText(item.text);
            const wordsNew = normalized.split(/\s+/).filter(w => w.length > 2 && w !== "lord" && w !== "lila" && w !== "known" && w !== "relation");

            const isDuplicate = uniqueCluePool.some((existing) => {
              const normExisting = cleanText(existing.text);
              // Check substring inclusion
              if (normExisting.includes(normalized) || normalized.includes(normExisting)) {
                return true;
              }
              const wordsExisting = normExisting.split(/\s+/).filter(w => w.length > 2 && w !== "lord" && w !== "lila" && w !== "known" && w !== "relation");

              // If they share 50% or more of their unique meaningful words, they are duplicates
              const minLen = Math.min(wordsExisting.length, wordsNew.length);
              if (minLen > 0 && wordsExisting.filter(w => wordsNew.includes(w)).length >= minLen * 0.5) {
                return true;
              }
              return false;
            });

            if (!isDuplicate) {
              uniqueCluePool.push(item);
            }
          });

          // Only keep personalities with at least 3 unique, high-quality clues to avoid any generic fallbacks
          if (uniqueCluePool.length >= 3) {
            targetPersonalities.push({
              id,
              entity,
              uniqueClues: uniqueCluePool
            });
          }
        }

        if (targetPersonalities.length < 5) {
          throw new Error("Not enough personalities with sufficient clues to play this book");
        }

        const generatedRounds: GuessRound[] = [];
        const shuffledTargets = shuffle(targetPersonalities).slice(0, 5);

        for (const targetItem of shuffledTargets) {
          const { id, entity, uniqueClues } = targetItem;

          // Pick 3 unique clues randomly
          const selectedClues = shuffle(uniqueClues).slice(0, 3);

          // Get distractor options (3 other personalities from the book)
          const distractors = allPersonalities
            .filter(([pId, _]) => pId !== id)
            .map(([_, pEnt]) => pEnt.name);
          const shuffledDistractors = shuffle(distractors).slice(0, 3);
          const options = shuffle([...shuffledDistractors, entity.name]);

          // Fetch all unique verses matching our 3 selected clues
          const clueVerses: { text: string; ref: string }[] = [];
          selectedClues.forEach((c) => {
            if (c.verseRef) {
              const vObj = verses[c.verseRef];
              const vText = vObj ? (vObj.text || (vObj as any).content || "") : "";
              if (vText && !clueVerses.some((v) => v.ref === c.verseRef)) {
                clueVerses.push({
                  text: vText,
                  ref: c.verseRef
                });
              }
            }
          });

          generatedRounds.push({
            correctEntityId: id,
            correctName: entity.name,
            clues: selectedClues.map(c => c.text),
            options,
            explanation: `Identified in the book: ${entity.name}.`,
            clueVerses
          });
        }

        setRounds(generatedRounds);
        setIsActive(true);
      } catch (err) {
        console.error("Guesser initialization error:", err);
      }
    }

    loadIdentities();
  }, [bookId]);

  const handleRevealClue = () => {
    if (revealedCluesCount < 3) {
      setRevealedCluesCount((prev) => prev + 1);
    }
  };

  const handleSelectOption = (option: string) => {
    if (selectedOption) return; // already answered

    setSelectedOption(option);
    const round = rounds[currentRoundIdx];
    const correct = option === round.correctName;
    setIsCorrect(correct);

    if (correct) {
      playCorrectSound();
      triggerParticles();
      setScore((prev) => prev + 1);

      // Score depending on how many clues were revealed
      let xp = 10;
      if (revealedCluesCount === 1) xp = 25; // Clue 1 guess!
      else if (revealedCluesCount === 2) xp = 15; // Clue 2 guess!
      setTotalXpEarned((prev) => prev + xp);
    } else {
      playWrongSound();
    }
    setShowExplanation(true);
  };

  const handleNextRound = () => {
    setSelectedOption(null);
    setIsCorrect(null);
    setRevealedCluesCount(1);
    setShowExplanation(false);

    if (currentRoundIdx + 1 < rounds.length) {
      setCurrentRoundIdx((prev) => prev + 1);
    } else {
      setIsActive(false);
      onComplete(totalXpEarned, score, seconds);
    }
  };

  if (rounds.length === 0) {
    return (
      <div className="quiz-card divine-aura fade-in" style={{ textAlign: "center", padding: "2rem" }}>
        <h3>Loading Clues & Identities...</h3>
      </div>
    );
  }

  const round = rounds[currentRoundIdx];
  const isFinished = !isActive && currentRoundIdx + 1 === rounds.length && selectedOption !== null;

  return (
    <div className="quiz-card divine-aura fade-in" style={{ maxWidth: "700px", margin: "0 auto 4rem auto", paddingBottom: "3rem", borderRadius: "16px", boxShadow: "0 12px 40px rgba(0,0,0,0.12)" }}>
      {/* Game Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "var(--ink-mid)", fontSize: "0.9rem", marginBottom: "1.5rem", borderBottom: "1.5px solid var(--border)", paddingBottom: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "1.2rem" }}>🪷</span>
          <span>Round: <strong style={{ color: "var(--saffron)", fontSize: "1.1rem" }}>{currentRoundIdx + 1} / {rounds.length}</strong></span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
          <span>Time: <strong style={{ fontFamily: "monospace", fontSize: "1rem" }}>{Math.floor(seconds / 60)}:{(seconds % 60).toString().padStart(2, "0")}</strong></span>
          <span style={{ backgroundColor: "rgba(200, 114, 42, 0.1)", padding: "0.3rem 0.8rem", borderRadius: "20px", border: "1px solid rgba(200, 114, 42, 0.25)" }}>
            Gunja Berries: <strong style={{ color: "var(--saffron)" }}>+{totalXpEarned} GB</strong>
          </span>
        </div>
      </div>

      {/* Stakes / Reward Potential Meter */}
      <div style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.78rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ink-soft)", marginBottom: "0.5rem" }}>
          <span>Current Guess Stakes:</span>
          <span style={{ fontWeight: "700", color: "var(--saffron)" }}>
            {revealedCluesCount === 1 ? "★ SUPREME RECALL ★" : revealedCluesCount === 2 ? "★ STEADY STUDY ★" : "★ RESOLVED INQUIRY ★"}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem" }}>
          <div style={{
            height: "8px",
            borderRadius: "4px",
            backgroundColor: revealedCluesCount === 1 ? "var(--saffron)" : "var(--border)",
            transition: "background-color 0.3s",
            opacity: revealedCluesCount >= 1 ? 1 : 0.4
          }} title="Clue 1 Guess: 25 GB potential" />
          <div style={{
            height: "8px",
            borderRadius: "4px",
            backgroundColor: revealedCluesCount === 2 ? "var(--saffron)" : "var(--border)",
            transition: "background-color 0.3s",
            opacity: revealedCluesCount >= 2 ? 1 : 0.4
          }} title="Clue 2 Guess: 15 GB potential" />
          <div style={{
            height: "8px",
            borderRadius: "4px",
            backgroundColor: revealedCluesCount === 3 ? "var(--saffron)" : "var(--border)",
            transition: "background-color 0.3s",
            opacity: revealedCluesCount >= 3 ? 1 : 0.4
          }} title="Clue 3 Guess: 10 GB potential" />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--ink-faint)", marginTop: "0.4rem" }}>
          <span style={{ fontWeight: revealedCluesCount === 1 ? "700" : "normal", color: revealedCluesCount === 1 ? "var(--ink)" : "inherit" }}>1 Clue: +25 GB</span>
          <span style={{ fontWeight: revealedCluesCount === 2 ? "700" : "normal", color: revealedCluesCount === 2 ? "var(--ink)" : "inherit" }}>2 Clues: +15 GB</span>
          <span style={{ fontWeight: revealedCluesCount === 3 ? "700" : "normal", color: revealedCluesCount === 3 ? "var(--ink)" : "inherit" }}>3 Clues: +10 GB</span>
        </div>
      </div>

      {/* Clues Box: Rendered as interactive scrolls/parchment cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginBottom: "2.5rem" }}>
        <h4 style={{ color: "var(--saffron)", marginTop: 0, marginBottom: "0.2rem", fontSize: "1.1rem", fontFamily: "'Cinzel', serif", letterSpacing: "0.05em" }}>
          🕵️ Identity Clues
        </h4>

        {round.clues.map((clue, idx) => {
          const isRevealed = idx < revealedCluesCount;
          const isUnlockable = idx === revealedCluesCount && !selectedOption;

          return (
            <div
              key={idx}
              onClick={() => isUnlockable && handleRevealClue()}
              className={`clue-scroll-card fade-in ${isUnlockable ? "unlockable" : ""}`}
              style={{
                position: "relative",
                backgroundColor: isRevealed ? "var(--ivory)" : "var(--parchment-dk)",
                borderRadius: "12px",
                border: isRevealed ? "1px solid var(--border)" : "2px dashed var(--border)",
                padding: "1.2rem 1.5rem",
                boxShadow: isRevealed ? "0 4px 12px rgba(0,0,0,0.02)" : "none",
                cursor: isUnlockable ? "pointer" : "default",
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                display: "flex",
                alignItems: "center",
                gap: "1rem",
                overflow: "hidden"
              }}
            >
              {/* Left Clue Icon */}
              <div style={{
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                backgroundColor: isRevealed ? "rgba(200, 114, 42, 0.1)" : "rgba(0,0,0,0.05)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1rem",
                color: "var(--saffron)",
                flexShrink: 0
              }}>
                {idx === 0 ? "🕯️" : idx === 1 ? "📜" : "👑"}
              </div>

              {/* Clue Text / Blur Overlay */}
              <div style={{
                flexGrow: 1,
                fontSize: "0.98rem",
                lineHeight: "1.5",
                color: isRevealed ? "var(--ink)" : "var(--ink-soft)",
                filter: isRevealed ? "none" : "blur(5px)",
                userSelect: isRevealed ? "auto" : "none",
                transition: "filter 0.4s ease"
              }}>
                {clue}
              </div>

              {/* Locked overlay prompt */}
              {!isRevealed && (
                <div style={{
                  position: "absolute",
                  inset: 0,
                  backgroundColor: "rgba(240, 230, 204, 0.3)",
                  backdropFilter: "blur(2px)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.5rem",
                  fontSize: "0.85rem",
                  fontWeight: "600",
                  color: "var(--saffron)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  padding: "0 1rem",
                  textAlign: "center"
                }}>
                  {isUnlockable ? (
                    <span className="pulse" style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      🔒 Click to Unveil Clue {idx + 1}
                    </span>
                  ) : (
                    <span>🔒 Locked Clue</span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Options Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.2rem", marginBottom: "2.5rem" }}>
        {round.options.map((option) => {
          const isSelected = selectedOption === option;
          const isCorrectOption = option === round.correctName;

          let optionStyle: React.CSSProperties = {
            padding: "1.2rem 1rem",
            borderRadius: "12px",
            border: "1.5px solid var(--border)",
            backgroundColor: "var(--ivory)",
            cursor: "pointer",
            fontWeight: "600",
            fontSize: "0.95rem",
            fontFamily: "'Cinzel', serif",
            letterSpacing: "0.02em",
            textAlign: "center",
            transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
            color: "var(--ink-mid)",
            boxShadow: "0 3px 8px rgba(0,0,0,0.02)",
            position: "relative",
            overflow: "hidden"
          };

          if (selectedOption) {
            optionStyle.cursor = "default";
            if (isCorrectOption) {
              optionStyle.backgroundColor = "var(--correct-bg)";
              optionStyle.borderColor = "var(--correct)";
              optionStyle.color = "var(--correct-text)";
              optionStyle.boxShadow = "0 0 16px rgba(46, 125, 50, 0.2)";
            } else if (isSelected) {
              optionStyle.backgroundColor = "var(--wrong-bg)";
              optionStyle.borderColor = "var(--wrong)";
              optionStyle.color = "var(--wrong-text)";
            } else {
              optionStyle.opacity = 0.4;
            }
          }

          return (
            <button
              key={option}
              className={`option-choice-btn ${!selectedOption ? "premium-choice-hover" : ""}`}
              style={optionStyle}
              onClick={() => handleSelectOption(option)}
              disabled={!!selectedOption}
            >
              {option}
            </button>
          );
        })}
      </div>

      {/* Reveal Feedback & Explanations */}
      {showExplanation && (
        <div className="fade-in glass-panel" style={{ backgroundColor: "var(--parchment)", borderRadius: "14px", padding: "1.8rem", marginBottom: "2rem", textAlign: "center", border: "1.5px solid var(--border)", boxShadow: "0 8px 30px rgba(0,0,0,0.05)" }}>
          <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", alignItems: "center", marginBottom: "1rem" }}>
            <span style={{ fontSize: "1.6rem" }}>{isCorrect ? "✨" : "🕊️"}</span>
            <h4 style={{ color: isCorrect ? "var(--correct)" : "var(--wrong)", margin: 0, fontSize: "1.3rem", fontWeight: "700", fontFamily: "'Cinzel', serif" }}>
              {isCorrect ? "Divine Match!" : `Celestial Form: ${round.correctName}`}
            </h4>
          </div>

          {round.clueVerses && round.clueVerses.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", margin: "1.2rem 0", textAlign: "left" }}>
              <div style={{ fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--ink-soft)", fontWeight: "600", borderBottom: "1.5px solid var(--border)", paddingBottom: "0.3rem" }}>
                📜 Scriptural Verification (Source Verses):
              </div>
              {round.clueVerses.map((cv, idx) => (
                <div key={idx} style={{ fontStyle: "italic", fontSize: "0.95rem", color: "var(--ink-soft)", padding: "1rem 1.4rem", borderLeft: "3.5px solid var(--saffron)", backgroundColor: "rgba(255,255,255,0.3)", borderRadius: "6px", lineHeight: "1.6" }}>
                  {cv.text.split("\n").map((line, lineIdx) => (
                    <React.Fragment key={lineIdx}>
                      {line}
                      <br />
                    </React.Fragment>
                  ))}
                  <div style={{ fontWeight: "700", marginTop: "0.6rem", color: "var(--saffron)", textAlign: "right" }}>
                    — Verse {cv.ref}
                  </div>
                </div>
              ))}
            </div>
          )}

          <button className="btn btn-primary" onClick={handleNextRound} style={{ marginTop: "1rem", padding: "0.7rem 2.2rem", borderRadius: "8px", fontSize: "0.9rem" }}>
            {currentRoundIdx + 1 === rounds.length ? "Finish Game" : "Next Round"}
          </button>
        </div>
      )}

      {/* Footer Back Button */}
      {!selectedOption && (
        <div style={{ textAlign: "center", marginTop: "0.5rem" }}>
          <button className="btn btn-secondary" onClick={onClose} style={{ fontSize: "0.85rem", padding: "0.5rem 2rem", borderRadius: "6px" }}>
            Quit Game
          </button>
        </div>
      )}
    </div>
  );
}
