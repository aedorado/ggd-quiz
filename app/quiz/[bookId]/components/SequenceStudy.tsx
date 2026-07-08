"use client";

import React, { useState, useEffect } from "react";

interface RawQuestion {
  question: string;
  options: string[];
  correct_answer: string;
  explanation: string;
  difficulty?: string;
  tags?: string[];
}

interface VerseItem {
  verseNumber: string;
  verseText: string;
  questions: RawQuestion[];
}

interface SequenceStudyProps {
  bookId: string;
  bookTitle: string;
  rawQuestionsData: Record<string, { verse_text?: string; paragraph_text?: string; questions: RawQuestion[] }>;
  playCorrectSound: () => void;
  playWrongSound: () => void;
  triggerParticles: () => void;
  addXp: (
    xpEarned: number,
    actionType: "quiz" | "game" | "nectar",
    description: string,
    metadata?: any
  ) => void;
  onClose: () => void;
}

const LETTERS = ["A", "B", "C", "D"];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Custom parser to sort verse numbers numerically (e.g. 1.1, 1.2, 1.10, 2)
function compareVerseNumbers(a: string, b: string): number {
  const partsA = a.split('.').map(p => parseInt(p, 10) || 0);
  const partsB = b.split('.').map(p => parseInt(p, 10) || 0);

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const valA = partsA[i] !== undefined ? partsA[i] : 0;
    const valB = partsB[i] !== undefined ? partsB[i] : 0;
    if (valA !== valB) {
      return valA - valB;
    }
  }
  return 0;
}

export default function SequenceStudy({
  bookId,
  bookTitle,
  rawQuestionsData,
  playCorrectSound,
  playWrongSound,
  triggerParticles,
  addXp,
  onClose,
}: SequenceStudyProps) {
  // Parse and sort verses
  const [parsedVerses, setParsedVerses] = useState<VerseItem[]>([]);
  const [currentVerseIndex, setCurrentVerseIndex] = useState<number>(0);
  const [highestCompletedIndex, setHighestCompletedIndex] = useState<number>(-1);
  const [mode, setMode] = useState<"intro" | "study" | "completed">("intro");

  // Active question state
  const [questionIndex, setQuestionIndex] = useState<number>(0);
  const [answered, setAnswered] = useState<boolean>(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [shuffledOptions, setShuffledOptions] = useState<string[]>([]);
  const [incorrectAttempts, setIncorrectAttempts] = useState<number>(0);
  const [isReplayingQuestions, setIsReplayingQuestions] = useState<boolean>(false);

  const PROGRESS_KEY = `tattva_sequence_progress_${bookId}`;
  const HIGHEST_KEY = `tattva_sequence_highest_${bookId}`;

  // Parse questions JSON on mount
  useEffect(() => {
    if (!rawQuestionsData) return;

    const items = Object.entries(rawQuestionsData)
      .map(([verseNumber, val]) => ({
        verseNumber,
        verseText: val.verse_text || val.paragraph_text || "",
        questions: val.questions || [],
      }))
      .sort((a, b) => compareVerseNumbers(a.verseNumber, b.verseNumber));

    setParsedVerses(items);

    // Read saved progress
    const savedProgress = localStorage.getItem(PROGRESS_KEY);
    const savedHighest = localStorage.getItem(HIGHEST_KEY);

    if (savedProgress !== null) {
      const idx = parseInt(savedProgress, 10);
      if (idx >= 0 && idx < items.length) {
        setCurrentVerseIndex(idx);
      }
    }

    if (savedHighest !== null) {
      const highest = parseInt(savedHighest, 10);
      setHighestCompletedIndex(highest);
    }
  }, [rawQuestionsData, bookId]);

  // Reset replay state when current verse index changes
  useEffect(() => {
    setIsReplayingQuestions(false);
  }, [currentVerseIndex]);

  // Shuffle options when index changes
  const activeVerse = parsedVerses[currentVerseIndex];
  const activeQuestion = activeVerse?.questions?.[questionIndex];

  useEffect(() => {
    if (activeQuestion) {
      setShuffledOptions(shuffle(activeQuestion.options));
      setAnswered(false);
      setSelectedOption(null);
    }
  }, [currentVerseIndex, questionIndex, activeQuestion]);

  const handleSelectOption = (selected: string) => {
    if (answered || !activeQuestion) return;
    setAnswered(true);
    setSelectedOption(selected);

    const isCorrect = selected === activeQuestion.correct_answer;

    if (isCorrect) {
      playCorrectSound();
      triggerParticles();
      // Reward standard 5 XP for correct answer
      // Only reward XP if this is the active study verse (not a replay/review)
      const isReplay = currentVerseIndex <= highestCompletedIndex;
      if (!isReplay) {
        addXp(5, "quiz", `Correctly answered question in Sequence Study for ${bookTitle}`);
      }
    } else {
      playWrongSound();
      setIncorrectAttempts(prev => prev + 1);
    }
  };

  const handleNextQuestion = () => {
    if (!activeVerse) return;
    if (questionIndex + 1 < activeVerse.questions.length) {
      setQuestionIndex(prev => prev + 1);
    }
  };

  const handleRevealVerse = () => {
    // If we've completed all questions (or there are none), trigger verse reveal completion XP
    // Only reward the 10 XP if this is the first time completing this verse
    if (currentVerseIndex > highestCompletedIndex) {
      addXp(10, "game", `Unlocked and studied Verse ${activeVerse.verseNumber} of ${bookTitle}`);
      const newHighest = currentVerseIndex;
      setHighestCompletedIndex(newHighest);
      localStorage.setItem(HIGHEST_KEY, newHighest.toString());
    }
  };

  const handleProceedNextVerse = () => {
    // If we are proceeding from the active study verse, mark it as completed first
    if (currentVerseIndex > highestCompletedIndex) {
      handleRevealVerse();
    }
    const nextIdx = currentVerseIndex + 1;
    if (nextIdx < parsedVerses.length) {
      setCurrentVerseIndex(nextIdx);
      localStorage.setItem(PROGRESS_KEY, nextIdx.toString());
      setQuestionIndex(0);
      setIncorrectAttempts(0);
    } else {
      setMode("completed");
    }
  };

  const handleRestart = () => {
    if (confirm("Are you sure you want to restart your study pathway? Your progress will be reset to Verse 1.")) {
      setCurrentVerseIndex(0);
      setHighestCompletedIndex(-1);
      setQuestionIndex(0);
      setIncorrectAttempts(0);
      localStorage.setItem(PROGRESS_KEY, "0");
      localStorage.setItem(HIGHEST_KEY, "-1");
      setMode("study");
    }
  };

  const handleResume = () => {
    setMode("study");
  };

  if (parsedVerses.length === 0) {
    return (
      <div className="quiz-card divine-aura fade-in" style={{ textAlign: "center" }}>
        <h2>Loading Pathway...</h2>
      </div>
    );
  }

  // 1. INTRO / PROGRESS LOADING SCREEN
  if (mode === "intro") {
    const hasProgress = currentVerseIndex > 0;
    const progressPercent = Math.round((currentVerseIndex / parsedVerses.length) * 100);

    return (
      <div className="quiz-card screen-landing divine-aura fade-in">
        <span className="om">ॐ</span>
        <h2 className="sequence-card-title">Sequential Study Pathway</h2>
        <p>
          Embark on a step-by-step journey through the verses of <strong>{bookTitle}</strong>.
          Study each verse's questions, then unlock and contemplate its translation.
        </p>

        {hasProgress ? (
          <div className="verse-box" style={{ textAlign: "center" }}>
            <p style={{ margin: "0 0 0.5rem", fontSize: "1.05rem", fontWeight: "600" }}>
              Saved Progress Found
            </p>
            <p style={{ margin: 0, color: "var(--ink-mid)" }}>
              Verse <strong>{parsedVerses[currentVerseIndex].verseNumber}</strong> of {parsedVerses.length} ({progressPercent}% Complete)
            </p>
          </div>
        ) : (
          <div className="verse-box" style={{ textAlign: "center", fontStyle: "normal" }}>
            <p style={{ margin: 0, color: "var(--ink-soft)" }}>
              No progress found. Ready to start from Verse 1!
            </p>
          </div>
        )}

        <div style={{ display: "flex", gap: "1rem", justifyContent: "center", marginTop: "2rem", flexWrap: "wrap" }}>
          {hasProgress && (
            <button
              className="btn btn-primary"
              onClick={handleResume}
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: "44px", padding: "0 1.8rem" }}
            >
              Resume Pathway
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={() => {
              // Reset to beginning
              setCurrentVerseIndex(0);
              setHighestCompletedIndex(-1);
              setQuestionIndex(0);
              setIncorrectAttempts(0);
              localStorage.setItem(PROGRESS_KEY, "0");
              localStorage.setItem(HIGHEST_KEY, "-1");
              setMode("study");
            }}
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: "44px", padding: "0 1.8rem" }}
          >
            {hasProgress ? "Restart from Beginning" : "Begin Pathway"}
          </button>
          <button
            className="btn btn-secondary"
            onClick={onClose}
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: "44px", padding: "0 1.8rem" }}
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  // 2. COMPLETED SCREEN
  if (mode === "completed") {
    return (
      <div className="quiz-card screen-landing divine-aura fade-in">
        <span className="om">ॐ</span>
        <h2 className="sequence-card-title">Pathway Completed!</h2>
        <div className="verse-box" style={{ textAlign: "center" }}>
          <p style={{ fontSize: "1.1rem", margin: "0 0 0.5rem 0", color: "var(--saffron)", fontWeight: "600" }}>
            Haribol! 🎉
          </p>
          <p style={{ margin: 0, color: "var(--ink-mid)" }}>
            You have successfully completed the entire sequential study of <strong>{bookTitle}</strong>!
          </p>
        </div>
        <p>Total Verses Mastered: {parsedVerses.length}</p>

        <div style={{ display: "flex", gap: "1rem", justifyContent: "center", marginTop: "2rem", flexWrap: "wrap" }}>
          <button
            className="btn btn-primary"
            onClick={() => {
              setCurrentVerseIndex(0);
              setQuestionIndex(0);
              localStorage.setItem(PROGRESS_KEY, "0");
              setMode("study");
            }}
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: "44px", padding: "0 1.8rem" }}
          >
            Study Again
          </button>
          <button
            className="btn btn-secondary"
            onClick={onClose}
            style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: "44px", padding: "0 1.8rem" }}
          >
            Main Menu
          </button>
        </div>
      </div>
    );
  }

  // 3. ACTIVE STUDY STATE
  const progressPercent = Math.round((currentVerseIndex / parsedVerses.length) * 100);
  const totalQuestions = activeVerse.questions.length;
  const isCompletedVerse = currentVerseIndex <= highestCompletedIndex;
  const isQuestionPhase = activeVerse.questions.length > 0 && (isReplayingQuestions || !isCompletedVerse) && questionIndex < totalQuestions;

  return (
    <div className="quiz-card divine-aura fade-in">
      {/* HEADER PROGRESS AND CONTROLS */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <div className="progress-label" style={{ margin: 0 }}>
          Verse {activeVerse.verseNumber} of {parsedVerses.length} ({progressPercent}% Completed)
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="sound-toggle-btn" onClick={onClose} style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}>
            Exit
          </button>
        </div>
      </div>

      <div className="progress-bar-wrap" style={{ marginBottom: "1rem" }}>
        <div
          className="progress-bar-fill"
          style={{
            width: `${((currentVerseIndex) / parsedVerses.length) * 100}%`,
          }}
        ></div>
      </div>

      {/* VERSE NAVIGATION BAR */}
      <div className="seq-navigation-bar">
        <div className="seq-select-wrap">
          <span className="seq-select-label">Go to:</span>
          <select
            className="seq-select"
            value={currentVerseIndex}
            onChange={(e) => {
              const idx = parseInt(e.target.value, 10);
              setCurrentVerseIndex(idx);
              localStorage.setItem(PROGRESS_KEY, idx.toString());
              setQuestionIndex(0);
              setIncorrectAttempts(0);
            }}
          >
            {parsedVerses.map((v, idx) => {
              const isCompleted = idx <= highestCompletedIndex;
              const isActiveStudy = idx === highestCompletedIndex + 1;
              const isLocked = idx > highestCompletedIndex + 1;

              if (isLocked) return null;

              let label = `Verse ${v.verseNumber}`;
              if (isCompleted) label += " (✓)";
              else if (isActiveStudy) label += " (Active 📖)";

              return (
                <option key={idx} value={idx}>
                  {label}
                </option>
              );
            })}
          </select>
        </div>

        <div className="seq-nav-btn-group">
          <button
            className="seq-nav-arrow-btn"
            onClick={() => {
              if (currentVerseIndex > 0) {
                const prevIdx = currentVerseIndex - 1;
                setCurrentVerseIndex(prevIdx);
                localStorage.setItem(PROGRESS_KEY, prevIdx.toString());
                setQuestionIndex(0);
                setIncorrectAttempts(0);
              }
            }}
            disabled={currentVerseIndex === 0}
          >
            ◀ Prev
          </button>
          <button
            className="seq-nav-arrow-btn"
            onClick={() => {
              if (currentVerseIndex <= highestCompletedIndex && currentVerseIndex + 1 < parsedVerses.length) {
                const nextIdx = currentVerseIndex + 1;
                setCurrentVerseIndex(nextIdx);
                localStorage.setItem(PROGRESS_KEY, nextIdx.toString());
                setQuestionIndex(0);
                setIncorrectAttempts(0);
              }
            }}
            disabled={currentVerseIndex > highestCompletedIndex || currentVerseIndex + 1 >= parsedVerses.length}
          >
            Next ▶
          </button>
        </div>
      </div>

      {isQuestionPhase && activeQuestion ? (
        // A) QUESTION PHASE
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div className="progress-label" style={{ fontSize: "0.8rem", color: "var(--ink-soft)", margin: 0 }}>
              Question {questionIndex + 1} of {totalQuestions} for this Verse {isCompletedVerse && "(Replay)"}
            </div>
            {isCompletedVerse && (
              <button
                onClick={() => setIsReplayingQuestions(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--ink-soft)",
                  textDecoration: "underline",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                  padding: 0
                }}
              >
                Cancel Replay
              </button>
            )}
          </div>

          <div className="question-tags" style={{ marginTop: "0.5rem" }}>
            <span className="tag" style={{ borderStyle: "double", borderWidth: "3px" }}>
              {bookId.toUpperCase()} {activeVerse.verseNumber}
            </span>
            {(activeQuestion.tags || []).map((tag, i) => (
              <span key={i} className="tag">
                {tag}
              </span>
            ))}
            {activeQuestion.difficulty && (
              <span className={`tag difficulty-${activeQuestion.difficulty}`}>
                {activeQuestion.difficulty}
              </span>
            )}
          </div>

          <div className="question-text" style={{ marginTop: "1rem" }}>
            {activeQuestion.question}
          </div>

          <div className="options-list">
            {shuffledOptions.map((opt, i) => {
              const isSelected = selectedOption === opt;
              const isCorrectOpt = opt === activeQuestion.correct_answer;

              let optClass = "option-btn";
              if (answered) {
                optClass += " disabled";
                if (isCorrectOpt) {
                  optClass += " correct";
                } else if (isSelected) {
                  optClass += " wrong";
                }
              } else if (isSelected) {
                optClass += " selected";
              }

              return (
                <button
                  key={`${questionIndex}-${opt}`}
                  className={optClass}
                  onClick={() => handleSelectOption(opt)}
                  disabled={answered}
                >
                  <span className="opt-letter">{LETTERS[i]}</span>
                  <span>{opt}</span>
                </button>
              );
            })}
          </div>

          {answered && (
            <div
              style={{
                backgroundColor: "var(--parchment-dk)",
                borderLeft: "4px solid var(--saffron)",
                padding: "1.2rem 1.5rem",
                marginTop: "1.5rem",
                borderRadius: "4px",
                boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
                textAlign: "left"
              }}
              className="explanation-box"
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  fontFamily: "'Cinzel', serif",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  color: "var(--gold)",
                  textTransform: "uppercase",
                  marginBottom: "0.5rem"
                }}
              >
                <span style={{ fontSize: "1rem" }}>✨</span>
                <span>Insight</span>
              </div>
              <div
                style={{
                  fontSize: "0.95rem",
                  lineHeight: "1.6",
                  color: "var(--ink-mid)"
                }}
              >
                {activeQuestion.explanation}
              </div>
            </div>
          )}

          {answered && (
            <div style={{ marginTop: "1.5rem", display: "flex", justifyContent: "flex-end", gap: "1rem" }}>
              {isCompletedVerse && (
                <button
                  className="btn btn-secondary"
                  onClick={() => setIsReplayingQuestions(false)}
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: "44px", padding: "0 1.5rem" }}
                >
                  Back to Translation
                </button>
              )}
              {questionIndex + 1 < totalQuestions ? (
                <button
                  className="btn btn-primary"
                  onClick={handleNextQuestion}
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: "44px", padding: "0 1.8rem" }}
                >
                  Next Question
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    if (isCompletedVerse) {
                      setIsReplayingQuestions(false);
                    } else {
                      handleRevealVerse();
                      setQuestionIndex(prev => prev + 1);
                    }
                  }}
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: "44px", padding: "0 1.8rem" }}
                >
                  {isCompletedVerse ? "Finish Replay" : "Reveal Verse"}
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        // B) VERSE REVEAL PHASE
        <div>
          {isCompletedVerse && (
            <div style={{ textAlign: "center", marginBottom: "1rem", color: "var(--gold)", fontSize: "0.9rem", fontStyle: "italic" }}>
              ✨ Reviewing Completed Verse
            </div>
          )}

          <div className="verse-reveal-card">
            <div className="verse-reveal-number">
              Verse {activeVerse.verseNumber}
            </div>

            {/* Elegant divider */}
            <div style={{ display: "flex", justifyContent: "center", margin: "0.5rem 0 1.2rem 0" }}>
              <svg style={{ width: "20px", height: "20px", fill: "var(--gold)" }} viewBox="0 0 24 24">
                <path d="M12,3C12,3 9,8 9,11C9,12.66 10.34,14 12,14C13.66,14 15,12.66 15,11C15,8 12,3 12,3M12,6.5C12.83,8.5 13.5,10.5 13.5,11C13.5,11.83 12.83,12.5 12,12.5C11.17,12.5 10.5,11.83 10.5,11C10.5,10.5 11.17,8.5 12,6.5" />
              </svg>
            </div>

            <div className="verse-reveal-text">
              {activeVerse.verseText || "Translation text not available."}
            </div>
          </div>

          {totalQuestions > 0 ? (
            <p className="seq-progress-text">
              {isCompletedVerse
                ? `✨ Verse containing ${totalQuestions} questions.`
                : `✨ You successfully answered ${totalQuestions} questions for this verse and unlocked its realization! (+10 GB)`}
            </p>
          ) : (
            <p className="seq-progress-text">
              {isCompletedVerse
                ? "📖 This verse contains no questions."
                : "📖 This verse contains no questions. Contemplate the translation and continue. (+10 GB)"}
            </p>
          )}

          <div style={{ display: "flex", justifyContent: "center", gap: "1rem", marginTop: "1.5rem", flexWrap: "wrap" }}>
            {isCompletedVerse && totalQuestions > 0 && (
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setIsReplayingQuestions(true);
                  setQuestionIndex(0);
                  setAnswered(false);
                  setSelectedOption(null);
                  setIncorrectAttempts(0);
                }}
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: "44px", padding: "0 1.8rem" }}
              >
                🔄 Replay Questions
              </button>
            )}
            <button
              className="btn btn-primary"
              onClick={handleProceedNextVerse}
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: "44px", padding: "0 2.2rem", minWidth: "200px" }}
            >
              {currentVerseIndex + 1 < parsedVerses.length ? "Proceed to Next Verse" : "Complete Pathway"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
