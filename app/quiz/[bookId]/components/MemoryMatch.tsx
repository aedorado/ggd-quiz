"use client";

import React, { useState, useEffect } from "react";
import { GAMIFICATION_CONFIG } from "../../../utils/gamificationConfig";

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
  bookId: string;
  playCorrectSound: () => void;
  playWrongSound: () => void;
  triggerParticles: () => void;
  onClose: () => void;
  onComplete: (xpEarned: number, turns: number, seconds: number) => void;
}

const MAX_SHOW_IN_GAME = GAMIFICATION_CONFIG.gameUnlocks.memory.cardsCount || 10;

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

export function resolveVerseForEntityForm(
  bookId: string,
  entityName: string,
  chosenForm: string,
  idData: any
): { verseRef: string; verseText: string; otherVerses: string } {
  if (!idData || !idData.entities || !idData.verses) {
    return { verseRef: "", verseText: "", otherVerses: "" };
  }

  // Find the entity key in idData.entities
  const entityEntry = Object.entries(idData.entities).find(
    ([_, ent]: [string, any]) => ent.name === entityName
  );
  if (!entityEntry) {
    return { verseRef: "", verseText: "", otherVerses: "" };
  }
  const [entityId, entity] = entityEntry as [string, any];

  let matchedVerseRef = "";

    // Look up in incarnation_of
    if (entity.incarnation_of) {
      const match = entity.incarnation_of.find((inc: any) => {
        const prevId = typeof inc === "object" && inc !== null ? inc.id : inc;
        const pEnt = idData.entities[prevId];
        return (pEnt && pEnt.name === chosenForm) || prevId === chosenForm;
      });
      if (match) {
        matchedVerseRef = typeof match === "object" && match !== null ? match.verse : "";
      }
    } else if (bookId === "vvs" || bookId === "rkgd") {
    // First, check if it's an attribute
    if (entity.attributes) {
      const match = entity.attributes.find((a: any) => a.att === chosenForm);
      if (match) {
        matchedVerseRef = match.verse;
      }
    }
    
    if (!matchedVerseRef && entity.relations) {
      // Find relation key
      const match = entity.relations.find((rel: any) => {
        const formattedRel = rel.type.replace(/_/g, " ");
        const capitalizedRel = formattedRel.charAt(0).toUpperCase() + formattedRel.slice(1);
        const targetEntity = idData.entities[rel.target_id];
        const targetName = targetEntity ? targetEntity.name : rel.target_id;
        return chosenForm === `${capitalizedRel}: ${targetName}`;
      });
      if (match) {
        matchedVerseRef = match.verse;
      }
    }
  }

  // Fallback to first mentioned verse if not found
  if (!matchedVerseRef) {
    matchedVerseRef = entity.mentioned_in && entity.mentioned_in.length > 0 ? entity.mentioned_in[0] : "";
  }

  const rawVerse = idData.verses[matchedVerseRef];
  const verseText = rawVerse ? rawVerse.text || rawVerse.content || "" : "";

  // Get other verses
  const otherVersesList = entity.mentioned_in
    ? entity.mentioned_in.filter((v: string) => v !== matchedVerseRef)
    : [];

  return {
    verseRef: matchedVerseRef,
    verseText,
    otherVerses: otherVersesList.length > 0 ? otherVersesList.join(", ") : ""
  };
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}


export default function MemoryMatch({
  bookId,
  playCorrectSound,
  playWrongSound,
  triggerParticles,
  onClose,
  onComplete,
}: MemoryMatchProps) {
  const [rawIdData, setRawIdData] = useState<any>(null);
  const [identities, setIdentities] = useState<IdentityMapping[]>([]);
  const [memoryCards, setMemoryCards] = useState<MemoryCard[]>([]);
  const [flippedCards, setFlippedCards] = useState<number[]>([]);
  const [matchedPairs, setMatchedPairs] = useState<string[]>([]);
  const [memoryMoves, setMemoryMoves] = useState(0);
  const [memoryTime, setMemoryTime] = useState(0);
  const [memoryActive, setMemoryActive] = useState(false);
  const [matchedVersePopup, setMatchedVersePopup] = useState<IdentityMapping | null>(null);
  const [activeSlideIdx, setActiveSlideIdx] = useState(0);

  // Fetch identities on mount
  useEffect(() => {
    async function loadIdentities() {
      try {
        const res = await fetch(`/${bookId}/identities.json`);
        if (res.ok) {
          const idData = await res.json();
          setRawIdData(idData);
          const flatIdentities: IdentityMapping[] = [];

          if (idData.entities) {
            if (bookId === "vvs" || bookId === "rkgd") {
              Object.entries(idData.entities).forEach(([entityId, entity]: [string, any]) => {
                const firstVerseRef = entity.mentioned_in && entity.mentioned_in.length > 0 ? entity.mentioned_in[0] : "";
                const rawVerse = idData.verses ? idData.verses[firstVerseRef] : null;
                const verseText = rawVerse ? rawVerse.text : "";

                const descriptors: string[] = [];
                if (entity.attributes) {
                  entity.attributes.forEach((attr: any) => {
                    descriptors.push(attr.att);
                  });
                }

                if (entity.relations) {
                  entity.relations.forEach((rel: any) => {
                    const targetEntity = idData.entities[rel.target_id];
                    const targetName = targetEntity ? targetEntity.name : rel.target_id;
                    const formattedRel = rel.type.replace(/_/g, " ");
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
            } else {
              // GGD graph-based parsing
              Object.entries(idData.entities).forEach(([entityId, entity]: [string, any]) => {
                if (entity.lila === "gaura" && Array.isArray(entity.incarnation_of) && entity.incarnation_of.length > 0) {
                  const prevForms = entity.incarnation_of.map((inc: any) => {
                    const prevId = typeof inc === "object" && inc !== null ? inc.id : inc;
                    const prevEntity = idData.entities[prevId];
                    return prevEntity ? prevEntity.name : prevId;
                  });

                  // Resolve the specific verse where the incarnation was described
                  const firstInc = entity.incarnation_of[0];
                  const firstVerseRef = typeof firstInc === "object" && firstInc !== null ? (firstInc.verse || "") : "";

                  const rawVerse = idData.verses ? idData.verses[firstVerseRef] : null;
                  const verseText = rawVerse ? rawVerse.text : "";

                  // All other verses where the entity is mentioned (excluding firstVerseRef)
                  const otherVersesList = entity.mentioned_in
                    ? entity.mentioned_in.filter((v: string) => v !== firstVerseRef)
                    : [];

                  flatIdentities.push({
                    gaura_name: entity.name,
                    previous_forms: prevForms,
                    verse_ref: firstVerseRef,
                    verse_text: verseText,
                    other_verses: otherVersesList.length > 0 ? otherVersesList.join(", ") : undefined
                  } as any);
                }
              });
            }
          } else {
            // Default flat legacy parsing
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

          const loaded = flatIdentities.length > 0 ? flatIdentities : FALLBACK_IDENTITIES;
          setIdentities(loaded);
          setupGame(loaded);
        } else {
          setIdentities(FALLBACK_IDENTITIES);
          setupGame(FALLBACK_IDENTITIES);
        }
      } catch (e) {
        console.warn(`Failed to load ${bookId} identities, using fallbacks:`, e);
        setIdentities(FALLBACK_IDENTITIES);
        setupGame(FALLBACK_IDENTITIES);
      }
    }
    loadIdentities();
  }, [bookId]);

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
    const targetCount = Math.min(MAX_SHOW_IN_GAME, shuffledIdentities.length);

    const selected: Array<{ item: IdentityMapping; prevForm: string }> = [];
    const chosenGauraNames = new Set<string>();
    const chosenPrevForms = new Set<string>();

    // Step 1: Try to build pairs with unique gaura_name AND unique previous form
    for (const item of shuffledIdentities) {
      if (selected.length >= targetCount) break;
      if (chosenGauraNames.has(item.gaura_name)) continue;

      const availablePrevForms = item.previous_forms.filter(f => !chosenPrevForms.has(f));
      if (availablePrevForms.length === 0) continue;

      const prevForm = availablePrevForms[Math.floor(Math.random() * availablePrevForms.length)];

      chosenGauraNames.add(item.gaura_name);
      chosenPrevForms.add(prevForm);

      selected.push({ item, prevForm });
    }

    // Step 2: If we still need more pairs, relax previous form uniqueness (but keep gaura_name unique)
    if (selected.length < targetCount) {
      for (const item of shuffledIdentities) {
        if (selected.length >= targetCount) break;
        if (chosenGauraNames.has(item.gaura_name)) continue;

        const prevForm = item.previous_forms[Math.floor(Math.random() * item.previous_forms.length)];

        chosenGauraNames.add(item.gaura_name);
        chosenPrevForms.add(prevForm);

        selected.push({ item, prevForm });
      }
    }

    const cards: MemoryCard[] = [];
    selected.forEach(({ item, prevForm }, index) => {
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
    const card = memoryCards[cardIndex];
    if (card.isMatched) {
      // Find the other matched card to get the prev form text
      const otherCard = memoryCards.find(c => c.mappingId === card.mappingId && c.type === "prev");
      const prevFormText = otherCard ? otherCard.text : "";
      
      const resolved = resolveVerseForEntityForm(bookId, card.mappingId, prevFormText, rawIdData);
      const matchedIdentity = identities.find(id => id.gaura_name === card.mappingId);
      if (matchedIdentity) {
        setMatchedVersePopup({
          ...matchedIdentity,
          matched_prev_form: prevFormText,
          verse_ref: resolved.verseRef || matchedIdentity.verse_ref,
          verse_text: resolved.verseText || matchedIdentity.verse_text,
          matched_verses: resolved.matchedVerses,
          other_verses: resolved.otherVerses || (matchedIdentity as any).other_verses
        } as any);
        setActiveSlideIdx(0);
      }
      return;
    }

    if (!memoryActive) return;
    if (flippedCards.length >= 2) return;
    if (card.isFlipped) return;

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

          const gauraCard = firstCard.type === "gaura" ? firstCard : secondCard;
          const prevCard = firstCard.type === "prev" ? firstCard : secondCard;

          const resolved = resolveVerseForEntityForm(bookId, gauraCard.mappingId, prevCard.text, rawIdData);
          const matchedIdentity = identities.find(id => id.gaura_name === firstCard.mappingId);
          if (matchedIdentity) {
            setMatchedVersePopup({
              ...matchedIdentity,
              matched_prev_form: prevCard.text,
              verse_ref: resolved.verseRef || matchedIdentity.verse_ref,
              verse_text: resolved.verseText || matchedIdentity.verse_text,
              matched_verses: resolved.matchedVerses,
              other_verses: resolved.otherVerses || (matchedIdentity as any).other_verses
            } as any);
            setActiveSlideIdx(0);
          }

          playCorrectSound();
          triggerParticles();

          const allMatched = matchedCards.every(c => c.isMatched);
          if (allMatched) {
            setMemoryActive(false);
            onComplete(15, memoryMoves, memoryTime); // Base 15 XP
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
        }, 2250);
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
                cursor: card.isFlipped && !card.isMatched ? "default" : "pointer"
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
                    {(bookId === "vvs" || bookId === "rkgd")
                      ? (card.type === "gaura" ? "Entity" : "Attribute / Relation")
                      : (card.type === "gaura" ? "Associate" : "Previous Form")}
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
            Completed in {memoryMoves} moves and {Math.floor(memoryTime / 60)}m {memoryTime % 60}s. You earned Gunja Berries (GB)!
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
              {matchedVersePopup.gaura_name} ↔ {(matchedVersePopup as any).matched_prev_form || matchedVersePopup.previous_forms.join(" / ")}
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
              {(matchedVersePopup as any).matched_verses && (matchedVersePopup as any).matched_verses.length > 0
                ? (matchedVersePopup as any).matched_verses[activeSlideIdx].text.split("\n").map((line: string, lIdx: number) => (
                    <React.Fragment key={lIdx}>
                      {line}
                      <br />
                    </React.Fragment>
                  ))
                : matchedVersePopup.verse_text.split("\n").map((line, lIdx) => (
                    <React.Fragment key={lIdx}>
                      {line}
                      <br />
                    </React.Fragment>
                  ))
              }
            </div>

            {(matchedVersePopup as any).matched_verses && (matchedVersePopup as any).matched_verses.length > 1 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", marginTop: "-0.8rem", marginBottom: "1.2rem", padding: "0 1rem" }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setActiveSlideIdx(prev => (prev - 1 + (matchedVersePopup as any).matched_verses.length) % (matchedVersePopup as any).matched_verses.length);
                  }}
                  style={{ padding: "0.2rem 0.6rem", fontSize: "0.8rem" }}
                >
                  ◀ Prev
                </button>
                <span style={{ fontSize: "0.8rem", color: "var(--ink-soft)" }}>
                  Verse {activeSlideIdx + 1} of {(matchedVersePopup as any).matched_verses.length}
                </span>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setActiveSlideIdx(prev => (prev + 1) % (matchedVersePopup as any).matched_verses.length);
                  }}
                  style={{ padding: "0.2rem 0.6rem", fontSize: "0.8rem" }}
                >
                  Next ▶
                </button>
              </div>
            )}

            <div style={{ fontSize: "0.75rem", color: "var(--ink-soft)", marginBottom: "1.2rem" }}>
              Reference: <strong>Verse {(matchedVersePopup as any).matched_verses && (matchedVersePopup as any).matched_verses.length > 0
                ? (matchedVersePopup as any).matched_verses[activeSlideIdx].ref
                : matchedVersePopup.verse_ref}</strong>
              {matchedVersePopup.other_verses && (
                <span> (also mentioned in Verse {matchedVersePopup.other_verses})</span>
              )}
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
