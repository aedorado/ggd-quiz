"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

interface QuizClientProps {
  bookId: string;
}

interface Question {
  question: string;
  options: string[];
  correct: string;
  explanation: string;
  difficulty: string;
  tags: string[];
  verse_text?: string;
  verse_number: string;
}

interface UserAnswer {
  question: string;
  selected: string;
  correct: string;
  options: string[];
  explanation: string;
  tags: string[];
  difficulty: string;
  verse_text?: string;
  verse_number: string;
  isCorrect: boolean;
}

interface BookMeta {
  title: string;
  subtitle?: string;
  desc?: string;
  quiz_desc?: string;
  verse?: string;
  output_file?: string;
}

// Helpers
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const LETTERS = ["A", "B", "C", "D"];

export default function QuizClient({ bookId }: QuizClientProps) {
  // States
  const [screen, setScreen] = useState<"loading" | "error" | "landing" | "quiz" | "results">("loading");
  const [meta, setMeta] = useState<BookMeta | null>(null);
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [quizQuestions, setQuizQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<UserAnswer[]>([]);
  const [answered, setAnswered] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [openAccordions, setOpenAccordions] = useState<Record<number, boolean>>({});

  // Option order preservation
  const [shuffledOptions, setShuffledOptions] = useState<string[]>([]);

  useEffect(() => {
    async function loadQuizData() {
      try {
        const configRes = await fetch("/books.json");
        const configData = await configRes.json();
        const bookMeta = configData[bookId];

        if (!bookMeta || bookMeta.status !== "ready") {
          setScreen("error");
          return;
        }
        setMeta(bookMeta);

        let questionsFile = bookMeta.output_file || `/${bookId}/questions.json`;
        if (questionsFile.startsWith("public/")) {
          questionsFile = "/" + questionsFile.slice(7);
        }

        const questionsRes = await fetch(questionsFile);
        if (!questionsRes.ok) {
          throw new Error(`HTTP error ${questionsRes.status}`);
        }
        const data = await questionsRes.json();

        const parsed = Object.entries(data).flatMap(([verseKey, section]: any) =>
          section.questions.map((q: any) => ({
            question: q.question,
            options: q.options,
            correct: q.correct_answer,
            explanation: q.explanation,
            difficulty: q.difficulty || "medium",
            tags: q.tags || [],
            verse_text: section.verse_text,
            verse_number: verseKey,
          }))
        );

        setAllQuestions(parsed);
        setScreen("landing");
      } catch (err) {
        console.error("Failed to load quiz data:", err);
        setScreen("error");
      }
    }
    loadQuizData();
  }, [bookId]);

  // Set up options order when question changes
  useEffect(() => {
    if (quizQuestions.length > 0 && quizQuestions[currentIndex]) {
      setShuffledOptions(shuffle(quizQuestions[currentIndex].options));
    }
  }, [currentIndex, quizQuestions]);

  const startQuiz = () => {
    if (allQuestions.length === 0) return;
    const shuffled = shuffle(allQuestions).slice(0, Math.min(5, allQuestions.length));
    setQuizQuestions(shuffled);
    setCurrentIndex(0);
    setUserAnswers([]);
    setAnswered(false);
    setSelectedOption(null);
    setOpenAccordions({});
    setScreen("quiz");
  };

  const handleSelectOption = (selected: string) => {
    if (answered) return;
    setAnswered(true);
    setSelectedOption(selected);

    const currentQ = quizQuestions[currentIndex];
    const isCorrect = selected === currentQ.correct;

    const answerRecord: UserAnswer = {
      question: currentQ.question,
      selected,
      correct: currentQ.correct,
      options: currentQ.options,
      explanation: currentQ.explanation,
      tags: currentQ.tags,
      difficulty: currentQ.difficulty,
      verse_text: currentQ.verse_text,
      verse_number: currentQ.verse_number,
      isCorrect,
    };

    setUserAnswers((prev) => [...prev, answerRecord]);

    setTimeout(() => {
      if (currentIndex + 1 < quizQuestions.length) {
        setCurrentIndex((prev) => prev + 1);
        setAnswered(false);
        setSelectedOption(null);
      } else {
        setScreen("results");
      }
    }, isCorrect ? 900 : 1400);
  };

  const toggleAccordion = (index: number) => {
    setOpenAccordions((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const getScoreLabel = (score: number, total: number) => {
    const pct = score / total;
    if (pct === 1) return "Perfect — all glories to your study!";
    if (pct >= 0.8) return "Excellent — very well done!";
    if (pct >= 0.6) return "Good effort — keep deepening your study.";
    if (pct >= 0.4) return "A beginning — continue to hear and contemplate.";
    return "Keep reading — the nectar awaits within.";
  };

  if (screen === "loading") {
    return (
      <>
        <nav>
          <div className="nav-brand">
            <span className="om">ॐ</span>
            <Link href="/" className="name">
              Tattva Darpaṇa
            </Link>
          </div>
        </nav>
        <div className="quiz-container">
          <header className="site-header">
            <span className="om">ॐ</span>
            <h1>Loading...</h1>
            <p className="subtitle">Please wait</p>
            <div className="divider"></div>
          </header>
        </div>
      </>
    );
  }

  if (screen === "error" || !meta) {
    return (
      <>
        <nav>
          <div className="nav-brand">
            <span className="om">ॐ</span>
            <Link href="/" className="name">
              Tattva Darpaṇa
            </Link>
          </div>
          <Link href="/" className="nav-back-btn">
            ← Back
          </Link>
        </nav>
        <div className="quiz-container">
          <div className="error-container">
            <h2>Error: No book selected or data missing.</h2>
            <Link href="/" className="btn btn-secondary" style={{ marginTop: "1rem" }}>
              Back to Library
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <nav>
        <div className="nav-brand">
          <span className="om">ॐ</span>
          <Link href="/" className="name">
            Tattva Darpaṇa
          </Link>
        </div>
        {screen !== "quiz" && (
          <Link href="/" className="nav-back-btn">
            ← Back
          </Link>
        )}
      </nav>

      <div className="quiz-container">
        {/* ── HEADER ── */}
        <header className="site-header">
          <span className="om">ॐ</span>
          <h1>{meta.title}</h1>
          {meta.subtitle && <p className="subtitle">{meta.subtitle}</p>}
          <div className="divider"></div>
        </header>

        {/* ── LANDING SCREEN ── */}
        {screen === "landing" && (
          <div className="quiz-card screen-landing fade-in">
            <h2>Test Your Knowledge</h2>
            <p>{meta.quiz_desc || meta.desc}</p>
            {meta.verse && <div className="verse-box">{meta.verse}</div>}
            <div className="landing-actions" style={{ display: "flex", gap: "1rem", justifyContent: "center", marginTop: "1.5rem" }}>
              <button className="btn btn-primary" onClick={startQuiz}>
                Begin Quiz
              </button>
              <Link href="/" className="btn btn-secondary">
                Back to Library
              </Link>
            </div>
          </div>
        )}

      {/* ── ACTIVE QUIZ SCREEN ── */}
      {screen === "quiz" && quizQuestions[currentIndex] && (
        <div className="quiz-card fade-in">
          <div className="progress-label">
            Question {currentIndex + 1} of {quizQuestions.length}
          </div>
          <div className="progress-bar-wrap">
            <div
              className="progress-bar-fill"
              style={{
                width: `${((currentIndex + 1) / quizQuestions.length) * 100}%`,
              }}
            ></div>
          </div>

          <div className="question-tags">
            {quizQuestions[currentIndex].tags.map((tag, i) => (
              <span key={i} className="tag">
                {tag}
              </span>
            ))}
            <span
              className={`tag difficulty-${quizQuestions[currentIndex].difficulty}`}
            >
              {quizQuestions[currentIndex].difficulty}
            </span>
          </div>

          <div className="question-text">
            {quizQuestions[currentIndex].question}
          </div>

          <div className="options-list">
            {shuffledOptions.map((opt, i) => {
              const currentQ = quizQuestions[currentIndex];
              const isSelected = selectedOption === opt;
              const isCorrectOpt = opt === currentQ.correct;

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
                  key={i}
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
        </div>
      )}

      {/* ── RESULTS SCREEN ── */}
      {screen === "results" && (
        <div className="quiz-card fade-in">
          <div className="result-summary">
            <div className="result-score">
              {userAnswers.filter((a) => a.isCorrect).length}{" "}
              <span>/ {userAnswers.length}</span>
            </div>
            <div className="result-label">
              {getScoreLabel(
                userAnswers.filter((a) => a.isCorrect).length,
                userAnswers.length
              )}
            </div>
          </div>
          <div className="divider"></div>

          <div id="results-list">
            {userAnswers.map((a, i) => {
              const isOpen = !!openAccordions[i];
              const icon = a.isCorrect ? "✓" : "✗";
              const iconColor = a.isCorrect ? "var(--correct)" : "var(--wrong)";

              return (
                <div
                  key={i}
                  className={`result-item ${isOpen ? "open" : ""}`}
                >
                  <div
                    className="result-item-header"
                    onClick={() => toggleAccordion(i)}
                  >
                    <span className="result-status" style={{ color: iconColor }}>
                      {icon}
                    </span>
                    <span className="result-q-text">
                      {i + 1}. {a.question}
                    </span>
                    <span className="result-chevron">▼</span>
                  </div>

                  <div className="result-body">
                    <div className="result-answer-line">
                      <strong>Your answer:</strong> {a.selected}
                    </div>
                    {!a.isCorrect && (
                      <div className="result-answer-line">
                        <strong>Correct answer:</strong> {a.correct}
                      </div>
                    )}

                    {a.verse_text && (
                      <div className="result-verse-box">
                        <strong>Reference — {a.verse_number}:</strong>
                        <br />
                        {a.verse_text.split("\n").map((line, lIdx) => (
                          <React.Fragment key={lIdx}>
                            {line}
                            <br />
                          </React.Fragment>
                        ))}
                      </div>
                    )}

                    <div className="result-explanation">{a.explanation}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="results-actions">
            <button className="btn btn-primary" onClick={startQuiz}>
              Try Again
            </button>
            <Link href="/" className="btn btn-secondary">
              Back to Library
            </Link>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
