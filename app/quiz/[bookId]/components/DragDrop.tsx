"use client";

import React, { useState, useEffect } from "react";
import { GAMIFICATION_CONFIG } from "../../../utils/gamificationConfig";

interface IdentityMapping {
  gaura_name: string;
  previous_forms: string[];
  verse_ref: string;
  verse_text: string;
  chosen_prev_form?: string;
  matched_verses?: Array<{ ref: string; text: string }>;
  other_verses?: string;
}

interface DragTarget {
  gaura_name: string;
  correct_prev_form: string;
  matched_prev_form: string | null;
  isMatched: boolean;
  verse_ref: string;
  verse_text: string;
}

interface DragItem {
  text: string;
  mappingId: string;
  isMatched: boolean;
}

interface DragDropProps {
  bookId: string;
  playCorrectSound: () => void;
  playWrongSound: () => void;
  triggerParticles: () => void;
  onClose: () => void;
  onComplete: (xpEarned: number, moves: number, seconds: number) => void;
}

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
): { verseRef: string; verseText: string; matchedVerses: Array<{ ref: string; text: string }>; otherVerses: string } {
  if (!idData || !idData.entities || !idData.verses) {
    return { verseRef: "", verseText: "", matchedVerses: [], otherVerses: "" };
  }

  // Find the entity key in idData.entities
  const entityEntry = Object.entries(idData.entities).find(
    ([_, ent]: [string, any]) => ent.name === entityName
  );
  if (!entityEntry) {
    return { verseRef: "", verseText: "", matchedVerses: [], otherVerses: "" };
  }
  const [entityId, entity] = entityEntry as [string, any];

  let matchedVerses: Array<{ ref: string; text: string }> = [];

  // Look up in incarnation_of
  if (entity.incarnation_of) {
    const match = entity.incarnation_of.find((inc: any) => {
      const prevId = typeof inc === "object" && inc !== null ? inc.id : inc;
      const pEnt = idData.entities[prevId];
      return (pEnt && pEnt.name === chosenForm) || prevId === chosenForm;
    });
    if (match) {
      const ref = typeof match === "object" && match !== null ? match.verse : "";
      const rawVerse = idData.verses[ref];
      if (rawVerse) {
        matchedVerses.push({ ref, text: rawVerse.text || rawVerse.content || "" });
      }
    }
  } else if (bookId === "vvs" || bookId === "rkgd") {
    // First, check if it's an attribute
    if (entity.attributes) {
      const matches = entity.attributes.filter((a: any) => a.att === chosenForm);
      matches.forEach((match: any) => {
        const ref = match.verse;
        const rawVerse = idData.verses[ref];
        if (rawVerse) {
          matchedVerses.push({ ref, text: rawVerse.text || rawVerse.content || "" });
        }
      });
    }
    
    if (matchedVerses.length === 0 && entity.relations) {
      // Find relation key
      const matches = entity.relations.filter((rel: any) => {
        const formattedRel = rel.type.replace(/_/g, " ");
        const capitalizedRel = formattedRel.charAt(0).toUpperCase() + formattedRel.slice(1);
        const targetEntity = idData.entities[rel.target_id];
        const targetName = targetEntity ? targetEntity.name : rel.target_id;
        return chosenForm === `${capitalizedRel}: ${targetName}`;
      });
      matches.forEach((match: any) => {
        const ref = match.verse;
        const rawVerse = idData.verses[ref];
        if (rawVerse) {
          matchedVerses.push({ ref, text: rawVerse.text || rawVerse.content || "" });
        }
      });
    }
  }

  // Fallback to first mentioned verse if not found
  if (matchedVerses.length === 0) {
    const fallbackRef = entity.mentioned_in && entity.mentioned_in.length > 0 ? entity.mentioned_in[0] : "";
    if (fallbackRef) {
      const rawVerse = idData.verses[fallbackRef];
      matchedVerses.push({ ref: fallbackRef, text: rawVerse ? rawVerse.text || rawVerse.content || "" : "" });
    }
  }

  const primaryRef = matchedVerses[0]?.ref || "";
  const primaryText = matchedVerses[0]?.text || "";

  // Get other verses (all mentioned_in minus the ones that matched the chosen form)
  const matchedRefsSet = new Set(matchedVerses.map(v => v.ref));
  const otherVersesList = entity.mentioned_in
    ? entity.mentioned_in.filter((v: string) => !matchedRefsSet.has(v))
    : [];

  return {
    verseRef: primaryRef,
    verseText: primaryText,
    matchedVerses,
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


export default function DragDrop({
  bookId,
  playCorrectSound,
  playWrongSound,
  triggerParticles,
  onClose,
  onComplete,
}: DragDropProps) {
  const [rawIdData, setRawIdData] = useState<any>(null);
  const [identities, setIdentities] = useState<IdentityMapping[]>([]);
  const [dragTargets, setDragTargets] = useState<DragTarget[]>([]);
  const [dragItems, setDragItems] = useState<DragItem[]>([]);
  const [dragDropTime, setDragDropTime] = useState(0);
  const [dragDropActive, setDragDropActive] = useState(false);
  const [dragDropMoves, setDragDropMoves] = useState(0);
  const [draggedItem, setDraggedItem] = useState<DragItem | null>(null);
  const [selectedPrevItem, setSelectedPrevItem] = useState<DragItem | null>(null);
  const [matchedVersePopup, setMatchedVersePopup] = useState<IdentityMapping | null>(null);
  const [dragOverTargetName, setDragOverTargetName] = useState<string | null>(null);
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
                  let firstVerseRef = "";
                  const firstInc = entity.incarnation_of[0];
                  if (firstInc) {
                    if (typeof firstInc === "object" && firstInc !== null) {
                      firstVerseRef = firstInc.verse || "";
                    }
                    if (!firstVerseRef && entity.incarnation_of_verses) {
                      const firstIncId = typeof firstInc === "object" && firstInc !== null ? firstInc.id : firstInc;
                      const incVerses = entity.incarnation_of_verses[firstIncId];
                      if (incVerses && incVerses.length > 0) {
                        firstVerseRef = incVerses[0];
                      } else if (typeof incVerses === "string") {
                        firstVerseRef = incVerses;
                      }
                    }
                  }
                  if (!firstVerseRef) {
                    firstVerseRef = entity.mentioned_in && entity.mentioned_in.length > 0 ? entity.mentioned_in[0] : "";
                  }

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
    if (dragDropActive) {
      interval = setInterval(() => {
        setDragDropTime((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [dragDropActive]);

  const setupGame = (activeIdentities: IdentityMapping[]) => {
    const shuffledIdentities = shuffle(activeIdentities);
    const targetCount = GAMIFICATION_CONFIG.gameUnlocks["drag-drop"].pairsCount || 6;

    const targets: DragTarget[] = [];
    const items: DragItem[] = [];
    const chosenGauraNames = new Set<string>();
    const chosenPrevForms = new Set<string>();

    // Step 1: Try to build pairs with unique gaura_name AND unique previous form
    for (const item of shuffledIdentities) {
      if (targets.length >= targetCount) break;
      if (chosenGauraNames.has(item.gaura_name)) continue;

      const availablePrevForms = item.previous_forms.filter(f => !chosenPrevForms.has(f));
      if (availablePrevForms.length === 0) continue;

      const prevForm = availablePrevForms[Math.floor(Math.random() * availablePrevForms.length)];

      chosenGauraNames.add(item.gaura_name);
      chosenPrevForms.add(prevForm);

      targets.push({
        gaura_name: item.gaura_name,
        correct_prev_form: prevForm,
        matched_prev_form: null,
        isMatched: false,
        verse_ref: item.verse_ref,
        verse_text: item.verse_text
      });

      items.push({
        text: prevForm,
        mappingId: item.gaura_name,
        isMatched: false
      });
    }

    // Step 2: If we still need more pairs, relax previous form uniqueness (but keep gaura_name unique)
    if (targets.length < targetCount) {
      for (const item of shuffledIdentities) {
        if (targets.length >= targetCount) break;
        if (chosenGauraNames.has(item.gaura_name)) continue;

        const prevForm = item.previous_forms[Math.floor(Math.random() * item.previous_forms.length)];

        chosenGauraNames.add(item.gaura_name);
        chosenPrevForms.add(prevForm);

        targets.push({
          gaura_name: item.gaura_name,
          correct_prev_form: prevForm,
          matched_prev_form: null,
          isMatched: false,
          verse_ref: item.verse_ref,
          verse_text: item.verse_text
        });

        items.push({
          text: prevForm,
          mappingId: item.gaura_name,
          isMatched: false
        });
      }
    }

    setDragTargets(targets);
    setDragItems(shuffle(items));
    setDragDropTime(0);
    setDragDropActive(true);
    setDragDropMoves(0);
    setMatchedVersePopup(null);
    setSelectedPrevItem(null);
    setDragOverTargetName(null);
  };

  const handleDragStart = (e: React.DragEvent, item: DragItem) => {
    setDraggedItem(item);
    e.dataTransfer.setData("text/plain", item.text);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDragEnter = (e: React.DragEvent, targetName: string) => {
    e.preventDefault();
    if (!dragDropActive) return;
    const target = dragTargets.find(t => t.gaura_name === targetName);
    if (target && !target.isMatched) {
      setDragOverTargetName(targetName);
    }
  };

  const handleDragLeave = () => {
    setDragOverTargetName(null);
  };

  const handleDragEnd = () => {
    setDraggedItem(null);
    setDragOverTargetName(null);
  };

  const handleDrop = (e: React.DragEvent, targetName: string) => {
    e.preventDefault();
    setDragOverTargetName(null);
    if (!draggedItem || !dragDropActive) return;

    setDragDropMoves((prev) => prev + 1);

    const targetIdx = dragTargets.findIndex(t => t.gaura_name === targetName);
    if (targetIdx === -1 || dragTargets[targetIdx].isMatched) return;

    if (draggedItem.mappingId === targetName) {
      // MATCH!
      playCorrectSound();
      triggerParticles();

      const updatedTargets = [...dragTargets];
      updatedTargets[targetIdx].matched_prev_form = draggedItem.text;
      updatedTargets[targetIdx].isMatched = true;
      setDragTargets(updatedTargets);

      const updatedItems = dragItems.map(item => {
        if (item.text === draggedItem.text) {
          return { ...item, isMatched: true };
        }
        return item;
      });
      setDragItems(updatedItems);

      const resolved = resolveVerseForEntityForm(bookId, targetName, draggedItem.text, rawIdData);
      const matchedIdentity = identities.find(id => id.gaura_name === targetName);
      if (matchedIdentity) {
        setMatchedVersePopup({
          ...matchedIdentity,
          verse_ref: resolved.verseRef || matchedIdentity.verse_ref,
          verse_text: resolved.verseText || matchedIdentity.verse_text,
          matched_verses: resolved.matchedVerses,
          other_verses: resolved.otherVerses || (matchedIdentity as any).other_verses
        } as any);
        setActiveSlideIdx(0);
      }

      const allMatched = updatedTargets.every(t => t.isMatched);
      if (allMatched) {
        setDragDropActive(false);
        onComplete(15, dragDropMoves, dragDropTime); // Base 15 XP
      }
    } else {
      playWrongSound();
    }
    setDraggedItem(null);
  };

  const handleItemClick = (item: DragItem) => {
    if (item.isMatched || !dragDropActive) return;
    if (selectedPrevItem?.text === item.text) {
      setSelectedPrevItem(null);
    } else {
      setSelectedPrevItem(item);
    }
  };

  const handleTargetClick = (targetName: string) => {
    const targetIdx = dragTargets.findIndex(t => t.gaura_name === targetName);
    if (targetIdx === -1) return;

    if (dragTargets[targetIdx].isMatched) {
      const matchedTarget = dragTargets[targetIdx];
      const resolved = resolveVerseForEntityForm(bookId, targetName, matchedTarget.matched_prev_form || "", rawIdData);
      const matchedIdentity = identities.find(id => id.gaura_name === targetName);
      if (matchedIdentity) {
        setMatchedVersePopup({
          ...matchedIdentity,
          verse_ref: resolved.verseRef || matchedIdentity.verse_ref,
          verse_text: resolved.verseText || matchedIdentity.verse_text,
          matched_verses: resolved.matchedVerses,
          other_verses: resolved.otherVerses || (matchedIdentity as any).other_verses
        } as any);
        setActiveSlideIdx(0);
      }
      return;
    }

    if (!selectedPrevItem || !dragDropActive) return;

    setDragDropMoves((prev) => prev + 1);

    if (selectedPrevItem.mappingId === targetName) {
      // MATCH!
      playCorrectSound();
      triggerParticles();

      const updatedTargets = [...dragTargets];
      updatedTargets[targetIdx].matched_prev_form = selectedPrevItem.text;
      updatedTargets[targetIdx].isMatched = true;
      setDragTargets(updatedTargets);

      const updatedItems = dragItems.map(item => {
        if (item.text === selectedPrevItem.text) {
          return { ...item, isMatched: true };
        }
        return item;
      });
      setDragItems(updatedItems);

      const resolved = resolveVerseForEntityForm(bookId, targetName, selectedPrevItem.text, rawIdData);
      const matchedIdentity = identities.find(id => id.gaura_name === targetName);
      if (matchedIdentity) {
        setMatchedVersePopup({
          ...matchedIdentity,
          verse_ref: resolved.verseRef || matchedIdentity.verse_ref,
          verse_text: resolved.verseText || matchedIdentity.verse_text,
          matched_verses: resolved.matchedVerses,
          other_verses: resolved.otherVerses || (matchedIdentity as any).other_verses
        } as any);
        setActiveSlideIdx(0);
      }

      const allMatched = updatedTargets.every(t => t.isMatched);
      if (allMatched) {
        setDragDropActive(false);
        onComplete(15, dragDropMoves, dragDropTime); // Base 15 XP
      }
    } else {
      playWrongSound();
    }

    setSelectedPrevItem(null);
  };

  return (
    <div className="quiz-card divine-aura fade-in" style={{ maxWidth: "800px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem", color: "var(--ink-mid)", fontSize: "0.9rem" }}>
        <span>Moves: <strong>{dragDropMoves}</strong></span>
        <span>Time: <strong>{Math.floor(dragDropTime / 60)}:{(dragDropTime % 60).toString().padStart(2, '0')}</strong></span>
        <span>Completion: <strong>{Math.round((dragTargets.filter(t => t.isMatched).length / (GAMIFICATION_CONFIG.gameUnlocks["drag-drop"].pairsCount || 6)) * 100)}%</strong></span>
      </div>

      <p style={{ color: "var(--ink-soft)", fontSize: "0.85rem", fontStyle: "italic", marginBottom: "1rem", textAlign: "center" }}>
        {(bookId === "vvs" || bookId === "rkgd")
          ? "Drag attributes/relations onto the entities, or tap an attribute then tap an entity to match them!"
          : "Drag previous forms onto the Caitanya associates, or tap a form then tap an associate to match them!"}
      </p>

      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "1.5rem",
        margin: "1.5rem 0"
      }}>
        {/* Left Column: Targets (Gaura associates) */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
          <div style={{ fontWeight: "700", color: "var(--accent)", borderBottom: "1px solid var(--border-color)", paddingBottom: "0.4rem" }}>
            {(bookId === "vvs" || bookId === "rkgd") ? "Vraja Entities" : "Gaura Associates"}
          </div>
          {dragTargets.map((target) => {
            const isDragOver = dragOverTargetName === target.gaura_name;
            return (
              <div
                key={target.gaura_name}
                onDragOver={handleDragOver}
                onDragEnter={(e) => handleDragEnter(e, target.gaura_name)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, target.gaura_name)}
                onClick={() => handleTargetClick(target.gaura_name)}
                style={{
                  padding: "0.8rem",
                  backgroundColor: target.isMatched
                    ? "var(--correct-bg)"
                    : isDragOver
                      ? "var(--gold-pale)"
                      : "var(--ivory)",
                  border: target.isMatched
                    ? "2px solid var(--correct)"
                    : isDragOver
                      ? "2px solid var(--saffron)"
                      : "2px dashed var(--border)",
                  borderRadius: "8px",
                  minHeight: "75px",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  cursor: "pointer",
                  transition: "all 0.25s"
                }}
              >
                <span style={{ fontWeight: "600", fontSize: "0.9rem", pointerEvents: "none" }}>{target.gaura_name}</span>
                {target.isMatched ? (
                  <span style={{ fontSize: "0.8rem", color: "var(--correct)", marginTop: "0.2rem", pointerEvents: "none" }}>
                    Matched with: <strong style={{ pointerEvents: "none" }}>{target.matched_prev_form}</strong>
                  </span>
                ) : (
                  <span style={{ fontSize: "0.75rem", color: "var(--ink-soft)", marginTop: "0.2rem", pointerEvents: "none" }}>
                    {(bookId === "vvs" || bookId === "rkgd") ? "Drop matching attribute / relation here" : "Drop matching previous form here"}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Right Column: Draggable Previous Forms */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem" }}>
          <div style={{ fontWeight: "700", color: "var(--accent)", borderBottom: "1px solid var(--border-color)", paddingBottom: "0.4rem" }}>
            {(bookId === "vvs" || bookId === "rkgd") ? "Attributes / Relations" : "Previous Forms"}
          </div>
          {dragItems.map((item) => {
            const isSelected = selectedPrevItem?.text === item.text;
            return (
              <div
                key={item.text}
                draggable={!item.isMatched}
                onDragStart={(e) => handleDragStart(e, item)}
                onDragEnd={handleDragEnd}
                onClick={() => handleItemClick(item)}
                style={{
                  padding: "0.8rem",
                  backgroundColor: item.isMatched ? "var(--correct-bg)" : isSelected ? "var(--gold-pale)" : "var(--ivory)",
                  border: item.isMatched ? "1px solid var(--correct)" : isSelected ? "2px solid var(--saffron)" : "1px solid var(--border)",
                  borderRadius: "8px",
                  cursor: item.isMatched ? "default" : "grab",
                  opacity: item.isMatched ? 0.5 : 1,
                  fontWeight: "600",
                  fontSize: "0.85rem",
                  textAlign: "center",
                  transition: "all 0.2s",
                  color: "var(--ink)"
                }}
              >
                {item.text}
              </div>
            );
          })}
        </div>
      </div>

      {!dragDropActive && dragTargets.every(t => t.isMatched) && (
        <div style={{ textAlign: "center", padding: "1rem" }}>
          <h3 style={{ color: "#2e7d32", marginBottom: "0.5rem" }}>🎉 All Mappings Locked!</h3>
          <p style={{ color: "var(--ink-soft)", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
            Completed in {dragDropMoves} moves and {Math.floor(dragDropTime / 60)}m {dragDropTime % 60}s. You earned Gunja Berries (GB)!
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
      {dragDropActive && (
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
