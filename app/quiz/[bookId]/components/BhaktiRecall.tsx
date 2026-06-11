"use client";

import React, { useState, useEffect, useRef } from "react";
import { GAMIFICATION_CONFIG } from "../../../utils/gamificationConfig";

interface IdentityMapping {
  gaura_name: string;
  previous_forms: string[];
  verse_ref: string;
  verse_text: string;
}

interface BhaktiRecallProps {
  bookId: string;
  playCorrectSound: () => void;
  playWrongSound: () => void;
  triggerParticles: () => void;
  onClose: () => void;
  onComplete: (xpEarned: number, retries: number, seconds: number) => void;
}

const CARDS_PER_ROUND = 10;

const FALLBACK_IDENTITIES: IdentityMapping[] = [
  {
    gaura_name: "Gadadhara Pandita",
    previous_forms: ["Radharani"],
    verse_ref: "147",
    verse_text: "Srimati Radharani, who is the personification of pure love for Lord Krsna and who is the queen of Vrndavana, appeared as Sri Gadadhara Pandita, who was very dear to Lord Caitanya."
  },
  {
    gaura_name: "Advaita Acarya",
    previous_forms: ["Mahavishnu", "Sadasiva"],
    verse_ref: "11",
    verse_text: "The bhaktavatara (devotional manifestation) is Lord Advaita Acarya, who is not different from Lord Sadasiva."
  },
  {
    gaura_name: "Srivasa Pandita",
    previous_forms: ["Narada Muni"],
    verse_ref: "90",
    verse_text: "Intelligent Srivasa Pandita had previously been Narada Muni, the best of the sages."
  },
  {
    gaura_name: "Murari Gupta",
    previous_forms: ["Hanuman"],
    verse_ref: "91",
    verse_text: "The devotee named Murari Gupta in Lord Caitanya's pastimes had previously been Hanuman."
  },
  {
    gaura_name: "Saci-devi",
    previous_forms: ["Yasoda-devi"],
    verse_ref: "37",
    verse_text: "Srimati Yasoda-devi and Vraja's king Nanda appeared during Lord Caitanya's pastimes as Srimati Saci-devi and Sriman Jagannatha Purandara."
  },
  {
    gaura_name: "Jagannatha Purandara",
    previous_forms: ["Nanda Maharaja"],
    verse_ref: "37",
    verse_text: "Srimati Yasoda-devi and Vraja's king Nanda appeared during Lord Caitanya's pastimes as Srimati Saci-devi and Sriman Jagannatha Purandara."
  },
  {
    gaura_name: "Nityananda Prabhu",
    previous_forms: ["Balarama", "Sankarsana", "Ananta Sesa"],
    verse_ref: "11",
    verse_text: "The bhakta-svarupa (devotional incarnation) is Lord Nityananda, who formerly appeared in Vrajabhumi as Lord Balarama."
  },
  {
    gaura_name: "Sivananda Sena",
    previous_forms: ["Sivanandana"],
    verse_ref: "4",
    verse_text: "With great devotion, I offer my respectful obeisances to my father, Sri Sivanandana..."
  },
  {
    gaura_name: "Haridasa Thakura",
    previous_forms: ["Prahlada Maharaja", "Brahma Mahatapah"],
    verse_ref: "93",
    verse_text: "Rcika Muni's son Brahma Mahatapah, and Prahlada Maharaja combined to appear as Haridasa Thakur in Lord Caitanya's pastimes."
  },
  {
    gaura_name: "Caitanya Mahaprabhu",
    previous_forms: ["Krsna"],
    verse_ref: "11",
    verse_text: "In this Panca-tattva, the bhakta-rupa (form of a devotee) is Lord Caitanya Mahaprabhu, who formerly appeared as Lord Krsna, the son of Nanda Maharaja."
  }
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function BhaktiRecall({
  bookId,
  playCorrectSound,
  playWrongSound,
  triggerParticles,
  onClose,
  onComplete,
}: BhaktiRecallProps) {
  // Game setup states
  const [gameState, setGameState] = useState<"setup" | "active" | "finished">("setup");
  const [direction, setDirection] = useState<"gaura-to-prev" | "prev-to-gaura" | "random">("gaura-to-prev");
  const [timeAttack, setTimeAttack] = useState(false);

  // Deck states
  const [identities, setIdentities] = useState<IdentityMapping[]>([]);
  const [deck, setDeck] = useState<IdentityMapping[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  // Scoring / metrics
  const [hardCount, setHardCount] = useState(0);
  const [goodCount, setGoodCount] = useState(0);
  const [easyCount, setEasyCount] = useState(0);
  const [totalTimer, setTotalTimer] = useState(0);
  const [cardTimer, setCardTimer] = useState(12);

  // Dynamic state per card
  const [cardDirection, setCardDirection] = useState<"gaura" | "prev">("gaura");

  // Timers refs
  const totalTimerRef = useRef<any>(null);
  const cardTimerRef = useRef<any>(null);

  // Fetch identities on mount
  useEffect(() => {
    async function loadIdentities() {
      try {
        const res = await fetch(`/${bookId}/identities.json`);
        if (res.ok) {
          const idData = await res.json();
          const flatIdentities: IdentityMapping[] = [];
          
          if (bookId === "vvs") {
            if (idData.entities) {
              Object.entries(idData.entities).forEach(([entityId, entity]: [string, any]) => {
                const firstVerseRef = entity.mentioned_in && entity.mentioned_in.length > 0 ? entity.mentioned_in[0] : "";
                const rawVerse = idData.verses ? idData.verses[firstVerseRef] : null;
                const verseText = rawVerse ? rawVerse.text : "";
                
                const descriptors: string[] = [...(entity.attributes || [])];
                
                if (entity.relations) {
                  Object.entries(entity.relations).forEach(([relType, targetId]: [string, any]) => {
                    const targetEntity = idData.entities[targetId];
                    const targetName = targetEntity ? targetEntity.name : targetId;
                    const formattedRel = relType.replace(/_/g, " ");
                    const capitalizedRel = formattedRel.charAt(0).toUpperCase() + formattedRel.slice(1);
                    descriptors.push(`${capitalizedRel}: ${targetName}`);
                  });
                }
                
                flatIdentities.push({
                  gaura_name: entity.name,
                  previous_forms: descriptors.length > 0 ? descriptors : [entity.type || "Vraja Entity"],
                  verse_ref: entity.mentioned_in ? entity.mentioned_in.join(", ") : "",
                  verse_text: verseText
                });
              });
            }
          } else {
            // Default GGD parsing
            Object.entries(idData).forEach(([verseRef, val]: [string, any]) => {
              if (val && Array.isArray(val.identities)) {
                val.identities.forEach((id: any) => {
                  flatIdentities.push({
                    gaura_name: id.gaura_name,
                    previous_forms: id.previous_forms,
                    verse_ref: verseRef,
                    verse_text: val.verse_text || ""
                  });
                });
              }
            });
          }
          setIdentities(flatIdentities.length > 0 ? flatIdentities : FALLBACK_IDENTITIES);
        } else {
          setIdentities(FALLBACK_IDENTITIES);
        }
      } catch (e) {
        console.warn(`Failed to load ${bookId} identities for Recall, using fallbacks:`, e);
        setIdentities(FALLBACK_IDENTITIES);
      }
    }
    loadIdentities();

    return () => {
      clearInterval(totalTimerRef.current);
      clearInterval(cardTimerRef.current);
    };
  }, [bookId]);

  // Timer effects
  useEffect(() => {
    if (gameState === "active") {
      totalTimerRef.current = setInterval(() => {
        setTotalTimer((t) => t + 1);
      }, 1000);
    } else {
      clearInterval(totalTimerRef.current);
    }
    return () => clearInterval(totalTimerRef.current);
  }, [gameState]);

  useEffect(() => {
    if (gameState === "active" && timeAttack && !isFlipped) {
      setCardTimer(12);
      cardTimerRef.current = setInterval(() => {
        setCardTimer((ct) => {
          if (ct <= 1) {
            clearInterval(cardTimerRef.current);
            setIsFlipped(true); // Auto reveal on timeout
            playWrongSound();
            return 0;
          }
          return ct - 1;
        });
      }, 1000);
    } else {
      clearInterval(cardTimerRef.current);
    }
    return () => clearInterval(cardTimerRef.current);
  }, [gameState, currentIdx, isFlipped, timeAttack]);

  const startGame = () => {
    const shuffled = shuffle(identities);
    const selected = shuffled.slice(0, Math.min(CARDS_PER_ROUND, shuffled.length)).map(item => {
      const chosen = item.previous_forms[Math.floor(Math.random() * item.previous_forms.length)];
      return {
        ...item,
        chosen_prev_form: chosen
      };
    });
    setDeck(selected as any);
    setCurrentIdx(0);
    setIsFlipped(false);
    setHardCount(0);
    setGoodCount(0);
    setEasyCount(0);
    setTotalTimer(0);
    setGameState("active");
    determineCardDirection(selected[0]);
  };

  const determineCardDirection = (card: IdentityMapping) => {
    if (direction === "random") {
      setCardDirection(Math.random() > 0.5 ? "gaura" : "prev");
    } else {
      setCardDirection(direction === "gaura-to-prev" ? "gaura" : "prev");
    }
  };

  const censorText = (text: string, toCensor: string[]) => {
    let censored = text;
    toCensor.forEach(word => {
      // Create a regex to match the name/words case-insensitively
      const escaped = word.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(escaped, "gi");
      censored = censored.replace(regex, " [ 🪷 ______ 🪷 ] ");
    });
    return censored;
  };

  const getCensoredVerse = (card: IdentityMapping) => {
    if (!card) return "";
    const namesToCensor = [card.gaura_name, ...card.previous_forms];
    return censorText(card.verse_text, namesToCensor);
  };

  const handleRate = (rating: "hard" | "good" | "easy") => {
    clearInterval(cardTimerRef.current);

    if (rating === "hard") {
      playWrongSound();
      setHardCount(prev => prev + 1);
      // Put card at the end of the deck to practice again
      const currentCard = deck[currentIdx];
      setDeck(prev => [...prev, currentCard]);
    } else {
      playCorrectSound();
      if (rating === "easy") {
        setEasyCount(prev => prev + 1);
        triggerParticles();
      } else {
        setGoodCount(prev => prev + 1);
      }
    }

    if (currentIdx + 1 < deck.length) {
      setIsFlipped(false);
      setCurrentIdx(prev => prev + 1);
      determineCardDirection(deck[currentIdx + 1]);
    } else {
      finishGame();
    }
  };

  const finishGame = () => {
    setGameState("finished");
    clearInterval(totalTimerRef.current);
    clearInterval(cardTimerRef.current);

    // Calculate XP
    const baseXP = GAMIFICATION_CONFIG.xpRewards.recallBase || 15;
    const isPerfect = hardCount === 0;
    const perfectBonus = isPerfect ? (GAMIFICATION_CONFIG.xpRewards.recallPerfectBonus || 10) : 0;
    const totalXP = baseXP + perfectBonus + (easyCount * 2);

    onComplete(totalXP, hardCount, totalTimer);
  };

  return (
    <div className="quiz-card divine-aura fade-in" style={{ maxWidth: "850px" }}>
      {/* ── SETUP SCREEN ── */}
      {gameState === "setup" && (
        <div style={{ textAlign: "center", padding: "0.5rem" }}>
          <span style={{ fontSize: "2.5rem", display: "block", marginBottom: "0.3rem" }}>🎴</span>
          <h2 style={{ color: "var(--saffron)", marginBottom: "0.5rem" }}>Bhakti Recall</h2>
          <p style={{ color: "var(--ink-soft)", fontSize: "0.9rem", marginBottom: "1.2rem", lineHeight: "1.4" }}>
            {bookId === "vvs"
              ? "Master the attributes and relations of Vraja's eternal associates and locations using active recall flashcards."
              : "Master the identities of Gaura-lila associates and their original Vraja-lila forms using active recall flashcards."}
          </p>

          <div style={{ textAlign: "left", maxWidth: "340px", margin: "0 auto 1.5rem auto" }}>
            <div style={{ marginBottom: "0.8rem" }}>
              <label style={{ fontWeight: "600", color: "var(--ink)", display: "block", marginBottom: "0.3rem", fontSize: "0.85rem" }}>
                Recall Direction:
              </label>
              <div style={{ display: "flex", gap: "0.4rem" }}>
                <button
                  className={`btn ${direction === "gaura-to-prev" ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => setDirection("gaura-to-prev")}
                  style={{ flex: 1, fontSize: "0.8rem", padding: "0.4rem" }}
                >
                  {bookId === "vvs" ? "Entity ➔ Clue" : "Gaura ➔ Vraja"}
                </button>
                <button
                  className={`btn ${direction === "prev-to-gaura" ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => setDirection("prev-to-gaura")}
                  style={{ flex: 1, fontSize: "0.8rem", padding: "0.4rem" }}
                >
                  {bookId === "vvs" ? "Clue ➔ Entity" : "Vraja ➔ Gaura"}
                </button>
                <button
                  className={`btn ${direction === "random" ? "btn-primary" : "btn-secondary"}`}
                  onClick={() => setDirection("random")}
                  style={{ flex: 1, fontSize: "0.8rem", padding: "0.4rem" }}
                >
                  Mix
                </button>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontWeight: "600", color: "var(--ink)", fontSize: "0.85rem" }}>Time-Attack Challenge:</span>
              <button
                className={`btn ${timeAttack ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setTimeAttack(!timeAttack)}
                style={{ padding: "0.3rem 0.8rem", fontSize: "0.8rem" }}
              >
                {timeAttack ? "ON (12s)" : "OFF"}
              </button>
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.8rem", justifyContent: "center" }}>
            <button className="btn btn-primary" onClick={startGame} style={{ padding: "0.6rem 1.5rem", fontSize: "0.9rem" }}>
              Start Recall Session
            </button>
            <button className="btn btn-secondary" onClick={onClose} style={{ padding: "0.6rem 1.5rem", fontSize: "0.9rem" }}>
              Back
            </button>
          </div>
        </div>
      )}

      {/* ── ACTIVE GAMEPLAY SCREEN ── */}
      {gameState === "active" && deck[currentIdx] && (
        <div>
          {/* Header Info */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.2rem", fontSize: "0.85rem", color: "var(--ink-soft)" }}>
            <span>Card <strong>{currentIdx + 1}</strong> of <strong>{deck.length}</strong></span>
            {timeAttack && (
              <span style={{
                color: cardTimer <= 3 ? "var(--wrong, #b71c1c)" : "var(--saffron)",
                fontWeight: "700",
                fontSize: "1rem"
              }}>
                ⏱️ {cardTimer}s
              </span>
            )}
            <span>Time: <strong>{Math.floor(totalTimer / 60)}:{(totalTimer % 60).toString().padStart(2, '0')}</strong></span>
          </div>

          {/* Time bar indicator */}
          {timeAttack && !isFlipped && (
            <div style={{
              width: "100%",
              height: "4px",
              backgroundColor: "rgba(0,0,0,0.05)",
              borderRadius: "2px",
              overflow: "hidden",
              marginBottom: "1.5rem"
            }}>
              <div style={{
                width: `${(cardTimer / 12) * 100}%`,
                height: "100%",
                backgroundColor: cardTimer <= 3 ? "var(--wrong, #b71c1c)" : "var(--saffron)",
                transition: "width 1s linear"
              }} />
            </div>
          )}

          {/* The Gorgeous 3D Flashcard */}
          <div style={{
            perspective: "1000px",
            width: "100%",
            height: "410px",
            marginBottom: "2rem"
          }}>
            <div style={{
              position: "relative",
              width: "100%",
              height: "100%",
              transition: "transform 0.6s",
              transformStyle: "preserve-3d",
              transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
              cursor: "pointer"
            }} onClick={() => !isFlipped && setIsFlipped(true)}>

              {/* CARD FRONT */}
              <div style={{
                position: "absolute",
                width: "100%",
                height: "100%",
                backfaceVisibility: "hidden",
                backgroundColor: "var(--ivory, #fdfbf7)",
                border: "2px solid var(--border, #e5d5c0)",
                borderRadius: "12px",
                padding: "1.4rem 2rem",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "space-between",
                boxShadow: "0 8px 16px rgba(0,0,0,0.05)"
              }}>
                <span style={{ fontSize: "1.6rem" }}>🪷</span>

                <div style={{ textAlign: "center", width: "100%", flexGrow: 1, display: "flex", flexDirection: "column", justifyContent: "center", margin: "0.5rem 0", overflowY: "auto" }}>
                  <span style={{ fontSize: "0.75rem", textTransform: "uppercase", color: "var(--ink-soft)", letterSpacing: "1px", display: "block", marginBottom: "0.4rem" }}>
                    Identify this associate's {bookId === "vvs"
                      ? (cardDirection === "gaura" ? "Attribute / Relation" : "Entity Name")
                      : (cardDirection === "gaura" ? "Vraja form" : "Gaura form")}
                  </span>
                  <h3 style={{ fontSize: "2.1rem", color: "var(--saffron)", margin: "0 0 1.2rem 0", lineHeight: "1.2" }}>
                    {cardDirection === "gaura" ? deck[currentIdx].gaura_name : ((deck[currentIdx] as any).chosen_prev_form || deck[currentIdx].previous_forms.join(" / "))}
                  </h3>

                  {/* Scriptural Hint */}
                  <div style={{
                    backgroundColor: "var(--parchment, #fbf8f3)",
                    padding: "1rem 1.4rem",
                    borderRadius: "8px",
                    border: "1px dashed #dfd0be",
                    fontSize: "0.88rem",
                    fontStyle: "italic",
                    lineHeight: "1.45",
                    color: "var(--ink-mid)",
                    maxHeight: "150px",
                    overflowY: "auto",
                    margin: "0 auto",
                    width: "100%"
                  }}>
                    "{getCensoredVerse(deck[currentIdx])}"
                  </div>
                </div>

                <span style={{ fontSize: "0.8rem", color: "var(--accent)" }}>
                  Click card to reveal answer
                </span>
              </div>

              {/* CARD BACK */}
              <div style={{
                position: "absolute",
                width: "100%",
                height: "100%",
                backfaceVisibility: "hidden",
                backgroundColor: "var(--correct-bg, #f4fbf7)",
                border: "2px solid var(--correct, #2e7d32)",
                borderRadius: "12px",
                padding: "1.4rem 2rem",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "space-between",
                transform: "rotateY(180deg)",
                boxShadow: "0 8px 16px rgba(0,0,0,0.05)"
              }}>
                <span style={{ fontSize: "1.6rem" }}>📜</span>

                <div style={{ textAlign: "center", width: "100%", flexGrow: 1, display: "flex", flexDirection: "column", justifyContent: "center", margin: "0.5rem 0", overflowY: "auto" }}>
                  <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "1.2rem", flexWrap: "wrap", marginBottom: "0.8rem" }}>
                    <div>
                      <span style={{ fontSize: "0.7rem", color: "var(--ink-soft)", textTransform: "uppercase", display: "block", marginBottom: "0.2rem" }}>
                        {bookId === "vvs" ? "Entity Name" : "Gaura Lila"}
                      </span>
                      <div style={{ fontWeight: "700", color: "var(--ink)", fontSize: "1.25rem" }}>{deck[currentIdx].gaura_name}</div>
                    </div>
                    <span style={{ color: "var(--saffron)", fontWeight: "bold", fontSize: "1.3rem" }}>↔</span>
                    <div>
                      <span style={{ fontSize: "0.7rem", color: "var(--ink-soft)", textTransform: "uppercase", display: "block", marginBottom: "0.2rem" }}>
                        {bookId === "vvs" ? "Attribute / Relation" : "Vraja Lila"}
                      </span>
                      <div style={{ fontWeight: "700", color: "var(--ink)", fontSize: "1.25rem" }}>
                        {((deck[currentIdx] as any).chosen_prev_form || deck[currentIdx].previous_forms.join(" / "))}
                      </div>
                      {bookId !== "vvs" && deck[currentIdx].previous_forms.length > 1 && (
                        <div style={{ fontSize: "0.65rem", color: "var(--ink-soft)", marginTop: "0.2rem" }}>
                          Alternative forms: {deck[currentIdx].previous_forms.filter(f => f !== (deck[currentIdx] as any).chosen_prev_form).join(", ")}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{
                    backgroundColor: "var(--ivory)",
                    padding: "1rem 1.4rem",
                    borderRadius: "8px",
                    fontSize: "0.88rem",
                    lineHeight: "1.45",
                    color: "var(--ink-mid)",
                    maxHeight: "150px",
                    overflowY: "auto",
                    textAlign: "left",
                    width: "100%"
                  }}>
                    {deck[currentIdx].verse_text}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "var(--ink-soft)", marginTop: "0.5rem" }}>
                    Reference: Verse {deck[currentIdx].verse_ref}
                  </div>
                </div>

                <span style={{ fontSize: "0.85rem", color: "var(--correct)", fontWeight: "600" }}>
                  Now rate your recall below
                </span>
              </div>

            </div>
          </div>

          {/* Rating Control Buttons */}
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.6rem"
          }}>
            {!isFlipped ? (
              <button className="btn btn-primary" onClick={() => setIsFlipped(true)} style={{ width: "100%", padding: "0.6rem" }}>
                Reveal Card
              </button>
            ) : (
              <div style={{ display: "flex", gap: "0.4rem" }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => handleRate("hard")}
                  style={{
                    flex: 1,
                    backgroundColor: "#ffebee",
                    color: "#c62828",
                    borderColor: "#ef9a9a",
                    fontWeight: "600",
                    padding: "0.6rem"
                  }}
                >
                  ❌ Hard
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => handleRate("good")}
                  style={{
                    flex: 1,
                    backgroundColor: "#e8f5e9",
                    color: "#2e7d32",
                    borderColor: "#a5d6a7",
                    fontWeight: "600",
                    padding: "0.6rem"
                  }}
                >
                  🪷 Good
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => handleRate("easy")}
                  style={{
                    flex: 1,
                    fontWeight: "600",
                    padding: "0.6rem"
                  }}
                >
                  ⚡ Easy
                </button>
              </div>
            )}

            <button className="btn btn-secondary" onClick={onClose} style={{ marginTop: "0.2rem", padding: "0.5rem" }}>
              Quit Session
            </button>
          </div>
        </div>
      )}

      {/* ── FINISHED SCREEN ── */}
      {gameState === "finished" && (
        <div style={{ textAlign: "center", padding: "1rem" }}>
          <span style={{ fontSize: "3rem" }}>🎉</span>
          <h2 style={{ color: "var(--correct)", margin: "0.5rem 0" }}>Session Complete!</h2>
          <p style={{ color: "var(--ink-soft)", fontSize: "0.9rem", marginBottom: "2rem" }}>
            {bookId === "vvs"
              ? "You reviewed the card deck and reinforced your memory of Vraja's eternal associates, locations, and pastimes."
              : "You reviewed the card deck and reinforced your memory of Lord Caitanya's divine associates."}
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
              <span style={{ color: "var(--ink-soft)", fontSize: "0.8rem", display: "block" }}>Difficult Cards Retried:</span>
              <strong style={{ fontSize: "1.1rem" }}>{hardCount}</strong>
            </div>
            <div>
              <span style={{ color: "var(--ink-soft)", fontSize: "0.8rem", display: "block" }}>Good Recalls:</span>
              <strong style={{ fontSize: "1.1rem", color: "var(--correct)" }}>{goodCount}</strong>
            </div>
            <div>
              <span style={{ color: "var(--ink-soft)", fontSize: "0.8rem", display: "block" }}>Easy Recalls:</span>
              <strong style={{ fontSize: "1.1rem", color: "var(--accent)" }}>{easyCount}</strong>
            </div>
          </div>

          <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
            <button className="btn btn-primary" onClick={startGame}>
              Play Again
            </button>
            <button className="btn btn-secondary" onClick={onClose}>
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
