"use client";

import React, { useState, useEffect } from "react";

interface IdentityMapping {
  gaura_name: string;
  previous_forms: string[];
  verse_ref: string;
  verse_text: string;
}

interface MemoryCard {
  id: string;
  text: string;
  type: "gaura" | "prev";
  mappingId: string;
  isFlipped: boolean;
  isMatched: boolean;
}

interface MemoryMatchProps {
  playCorrectSound: () => void;
  playWrongSound: () => void;
  triggerParticles: () => void;
  onClose: () => void;
  onComplete: (xpEarned: number) => void;
}

const MAX_SHOW_IN_GAME = 10;

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

export default function MemoryMatch({
  playCorrectSound,
  playWrongSound,
  triggerParticles,
  onClose,
  onComplete,
}: MemoryMatchProps) {
  const [identities, setIdentities] = useState<IdentityMapping[]>([]);
  const [memoryCards, setMemoryCards] = useState<MemoryCard[]>([]);
  const [flippedCards, setFlippedCards] = useState<number[]>([]);
  const [matchedPairs, setMatchedPairs] = useState<string[]>([]);
  const [memoryMoves, setMemoryMoves] = useState(0);
  const [memoryTime, setMemoryTime] = useState(0);
  const [memoryActive, setMemoryActive] = useState(false);
  const [matchedVersePopup, setMatchedVersePopup] = useState<IdentityMapping | null>(null);

  // Fetch identities on mount
  useEffect(() => {
    async function loadIdentities() {
      try {
        const res = await fetch("/ggd/identities.json");
        if (res.ok) {
          const idData = await res.json();
          const flatIdentities: IdentityMapping[] = [];
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
          const loaded = flatIdentities.length > 0 ? flatIdentities : FALLBACK_IDENTITIES;
          setIdentities(loaded);
          setupGame(loaded);
        } else {
          setIdentities(FALLBACK_IDENTITIES);
          setupGame(FALLBACK_IDENTITIES);
        }
      } catch (e) {
        console.warn("Failed to load GGD identities, using fallbacks:", e);
        setIdentities(FALLBACK_IDENTITIES);
        setupGame(FALLBACK_IDENTITIES);
      }
    }
    loadIdentities();
  }, []);

  // Timer Effect
  useEffect(() => {
    let interval: any;
    if (memoryActive) {
      interval = setInterval(() => {
        setMemoryTime((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [memoryActive]);

  const setupGame = (activeIdentities: IdentityMapping[]) => {
    const shuffledIdentities = shuffle(activeIdentities);
    const selected = shuffledIdentities.slice(0, Math.min(MAX_SHOW_IN_GAME, shuffledIdentities.length));

    const cards: MemoryCard[] = [];
    selected.forEach((item, index) => {
      const prevForm = item.previous_forms[Math.floor(Math.random() * item.previous_forms.length)];

      cards.push({
        id: `gaura-${index}-${item.gaura_name}`,
        text: item.gaura_name,
        type: "gaura",
        mappingId: item.gaura_name,
        isFlipped: false,
        isMatched: false
      });
      cards.push({
        id: `prev-${index}-${prevForm}`,
        text: prevForm,
        type: "prev",
        mappingId: item.gaura_name,
        isFlipped: false,
        isMatched: false
      });
    });

    setMemoryCards(shuffle(cards));
    setFlippedCards([]);
    setMatchedPairs([]);
    setMemoryMoves(0);
    setMemoryTime(0);
    setMemoryActive(true);
    setMatchedVersePopup(null);
  };

  const handleCardClick = (cardIndex: number) => {
    if (!memoryActive) return;
    if (flippedCards.length >= 2) return;
    if (memoryCards[cardIndex].isMatched || memoryCards[cardIndex].isFlipped) return;

    const updatedCards = [...memoryCards];
    updatedCards[cardIndex].isFlipped = true;
    setMemoryCards(updatedCards);

    const newFlipped = [...flippedCards, cardIndex];
    setFlippedCards(newFlipped);

    if (newFlipped.length === 2) {
      setMemoryMoves((prev) => prev + 1);
      const firstCard = memoryCards[newFlipped[0]];
      const secondCard = memoryCards[newFlipped[1]];

      if (firstCard.mappingId === secondCard.mappingId) {
        // MATCH!
        setTimeout(() => {
          const matchedCards = updatedCards.map((c, idx) => {
            if (idx === newFlipped[0] || idx === newFlipped[1]) {
              return { ...c, isMatched: true };
            }
            return c;
          });
          setMemoryCards(matchedCards);
          setFlippedCards([]);
          const nextMatchedPairs = [...matchedPairs, firstCard.mappingId];
          setMatchedPairs(nextMatchedPairs);

          const matchedIdentity = identities.find(id => id.gaura_name === firstCard.mappingId);
          if (matchedIdentity) {
            setMatchedVersePopup(matchedIdentity);
          }

          playCorrectSound();
          triggerParticles();

          const allMatched = matchedCards.every(c => c.isMatched);
          if (allMatched) {
            setMemoryActive(false);
            onComplete(5); // Award 5 XP
          }
        }, 500);
      } else {
        // NO MATCH
        playWrongSound();
        setTimeout(() => {
          const resetCards = updatedCards.map((c, idx) => {
            if (idx === newFlipped[0] || idx === newFlipped[1]) {
              return { ...c, isFlipped: false };
            }
            return c;
          });
          setMemoryCards(resetCards);
          setFlippedCards([]);
        }, 1200);
      }
    }
  };

  return (
    <div className="quiz-card divine-aura fade-in" style={{ maxWidth: "800px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem", color: "var(--ink-mid)", fontSize: "0.9rem" }}>
        <span>Moves: <strong>{memoryMoves}</strong></span>
        <span>Time: <strong>{Math.floor(memoryTime / 60)}:{(memoryTime % 60).toString().padStart(2, '0')}</strong></span>
        <span>Completion: <strong>{Math.round((matchedPairs.length / MAX_SHOW_IN_GAME) * 100)}%</strong></span>
      </div>

      <div className="memory-grid" style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
        gap: "0.8rem",
        margin: "1.5rem 0"
      }}>
        {memoryCards.map((card, idx) => {
          const isFlippedOrMatched = card.isFlipped || card.isMatched;
          return (
            <div
              key={card.id}
              onClick={() => handleCardClick(idx)}
              style={{
                height: "100px",
                perspective: "1000px",
                cursor: isFlippedOrMatched ? "default" : "pointer"
              }}
            >
              <div style={{
                position: "relative",
                width: "100%",
                height: "100%",
                textAlign: "center",
                transition: "transform 0.6s",
                transformStyle: "preserve-3d",
                transform: isFlippedOrMatched ? "rotateY(180deg)" : "rotateY(0deg)",
                borderRadius: "8px",
                boxShadow: "0 4px 6px rgba(0,0,0,0.05)"
              }}>
                {/* Card Front (Back of card conceptually, when hidden) */}
                <div style={{
                  position: "absolute",
                  width: "100%",
                  height: "100%",
                  backfaceVisibility: "hidden",
                  backgroundColor: "var(--accent-tint, #fef6ec)",
                  border: "2px solid var(--accent, #bf6a1f)",
                  borderRadius: "8px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "2rem",
                  color: "var(--accent)"
                }}>
                  🪷
                </div>

                {/* Card Back (Revealed content) */}
                <div style={{
                  position: "absolute",
                  width: "100%",
                  height: "100%",
                  backfaceVisibility: "hidden",
                  backgroundColor: card.isMatched ? "var(--correct-bg)" : "var(--ivory)",
                  border: card.isMatched ? "2px solid var(--correct)" : "2px solid var(--border)",
                  color: card.isMatched ? "var(--correct)" : "var(--ink)",
                  borderRadius: "8px",
                  transform: "rotateY(180deg)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0.4rem",
                  fontWeight: "600",
                  textAlign: "center"
                }}>
                  <span style={{
                    fontSize: "0.6rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    color: "var(--ink-soft)",
                    marginBottom: "0.15rem",
                    display: "block",
                    lineHeight: "1"
                  }}>
                    {card.type === "gaura" ? "Associate" : "Previous Form"}
                  </span>
                  <div style={{
                    fontSize: card.text.length > 35 ? "0.65rem" : card.text.length > 20 ? "0.72rem" : "0.85rem",
                    lineHeight: "1.2",
                    wordBreak: "break-word",
                    overflowWrap: "anywhere",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexGrow: 1,
                    width: "100%",
                    maxHeight: "65px",
                    overflow: "hidden"
                  }}>
                    {card.text}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!memoryActive && matchedPairs.length === MAX_SHOW_IN_GAME && (
        <div style={{ textAlign: "center", padding: "1rem" }}>
          <h3 style={{ color: "#2e7d32", marginBottom: "0.5rem" }}>🎉 All Matches Found!</h3>
          <p style={{ color: "var(--ink-soft)", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
            Completed in {memoryMoves} moves and {Math.floor(memoryTime / 60)}m {memoryTime % 60}s. You earned 5 XP!
          </p>
          <div style={{ display: "flex", gap: "1rem", justifyContent: "center" }}>
            <button className="btn btn-primary" onClick={() => setupGame(identities)}>
              Play Again
            </button>
            <button className="btn btn-secondary" onClick={onClose}>
              Back
            </button>
          </div>
        </div>
      )}
      {memoryActive && (
        <div style={{ textAlign: "center", marginTop: "1rem" }}>
          <button className="btn btn-secondary" onClick={onClose}>
            Quit Game
          </button>
        </div>
      )}

      {/* ── SUCCESS/LEARNING POPUP MODAL ── */}
      {matchedVersePopup && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0,0,0,0.5)",
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          animation: "fadeIn 0.3s ease-out"
        }}>
          <div className="divine-aura" style={{
            backgroundColor: "var(--ivory)",
            borderRadius: "12px",
            padding: "1.8rem",
            maxWidth: "500px",
            width: "100%",
            maxHeight: "85vh",
            overflowY: "auto",
            boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
            textAlign: "center"
          }}>
            <span style={{ fontSize: "2rem" }}>🪷</span>
            <h3 style={{ color: "var(--saffron)", margin: "0.5rem 0" }}>Divine Match!</h3>
            <div style={{ fontWeight: "700", marginBottom: "1rem", fontSize: "1.1rem", color: "var(--ink)" }}>
              {matchedVersePopup.gaura_name} ↔ {matchedVersePopup.previous_forms.join(" / ")}
            </div>
            <div style={{
              backgroundColor: "var(--parchment)",
              borderRadius: "8px",
              padding: "1rem",
              fontSize: "0.85rem",
              fontStyle: "italic",
              color: "var(--ink-mid)",
              marginBottom: "1.2rem",
              lineHeight: "1.4"
            }}>
              {matchedVersePopup.verse_text.split("\n").map((line, lIdx) => (
                <React.Fragment key={lIdx}>
                  {line}
                  <br />
                </React.Fragment>
              ))}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--ink-soft)", marginBottom: "1.2rem" }}>
              Reference: <strong>Verse {matchedVersePopup.verse_ref}</strong>
            </div>
            <button className="btn btn-primary" onClick={() => setMatchedVersePopup(null)}>
              Continue
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
