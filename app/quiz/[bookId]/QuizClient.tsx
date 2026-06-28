"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import StandardQuiz from "./components/StandardQuiz";
import QuizResults from "./components/QuizResults";
import MemoryMatch from "./components/MemoryMatch";
import DragDrop from "./components/DragDrop";
import Crossword from "./components/Crossword";
import BhaktiRecall from "./components/BhaktiRecall";
import SlokaBuilder from "./components/ShlokaBuilder";
import Guesser from "./components/Guesser";
import YakshaPrashna from "./components/YakshaPrashna";
import SequenceStudy from "./components/SequenceStudy";
import { useBhaktiProgress } from "../../utils/bhaktiProgress";
import { GAMIFICATION_CONFIG, isGameModeUnlocked } from "../../utils/gamificationConfig";
import SadhanaDashboard from "../../components/SadhanaDashboard";
import LevelUpModal from "../../components/LevelUpModal";

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

interface BookPart {
  id: string;
  name: string;
  desc?: string;
  filter_prefix: string;
  chapters?: {
    id: string;
    name: string;
    desc?: string;
    filter_prefix: string;
  }[];
}

interface BookMeta {
  title: string;
  subtitle?: string;
  desc?: string;
  quiz_desc?: string;
  verse?: string;
  output_file?: string;
  parts?: BookPart[];
  enabled_modes?: string[];
}

interface Particle {
  id: number;
  x: number;
  char: string;
  color: string;
  size: number;
  delay: number;
}

const LotusDivider = () => (
  <div className="lotus-divider">
    <svg className="lotus-svg" viewBox="0 0 24 24">
      <path d="M12,3C12,3 9,8 9,11C9,12.66 10.34,14 12,14C13.66,14 15,12.66 15,11C15,8 12,3 12,3M12,6.5C12.83,8.5 13.5,10.5 13.5,11C13.5,11.83 12.83,12.5 12,12.5C11.17,12.5 10.5,11.83 10.5,11C10.5,10.5 11.17,8.5 12,6.5M7,12C7,12 4.5,14 4.5,16C4.5,17.1 5.4,18 6.5,18C7.6,18 8.5,17.1 8.5,16C8.5,14 7,12 7,12M17,12C17,12 15.5,14 15.5,16C15.5,17.1 16.4,18 17.5,18C18.6,18 19.5,17.1 19.5,16C19.5,14 17,12 17,12Z" />
    </svg>
  </div>
);

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function QuizClient({ bookId }: QuizClientProps) {
  // Screen and Config States
  const [screen, setScreen] = useState<"loading" | "error" | "landing" | "quiz" | "results" | "memory" | "drag-drop" | "crossword" | "recall" | "builder" | "guesser" | "pathfinder" | "sequence">("loading");
  const [meta, setMeta] = useState<BookMeta | null>(null);
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [quizQuestions, setQuizQuestions] = useState<Question[]>([]);
  const [userAnswers, setUserAnswers] = useState<UserAnswer[]>([]);
  const [selectedPartId, setSelectedPartId] = useState<string>("all");
  const [expandedPartId, setExpandedPartId] = useState<string | null>(null);

  // Game sub-modes
  const [selectedSubMode, setSelectedSubMode] = useState<"quiz" | "memory" | "drag-drop" | "crossword" | "recall" | "builder" | "guesser" | "pathfinder" | "sequence">("quiz");

  // Krishna Prema Additions State
  const [particles, setParticles] = useState<Particle[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [ambientEnabled, setAmbientEnabled] = useState(false);

  // Hook-based progress tracking
  const {
    isMounted,
    stats,
    currentRank,
    pendingLevelUp,
    clearLevelUp,
    addXp,
    resetProgress
  } = useBhaktiProgress();

  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [rawQuestionsData, setRawQuestionsData] = useState<any>(null);

  // Load stats on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const sound = localStorage.getItem("quiz_sound_enabled") === "true";
      setSoundEnabled(sound);
    }
  }, []);

  // Web Audio Synthesis for Correct Answer (Bansuri chords)
  const playCorrectSound = () => {
    if (!soundEnabled || typeof window === "undefined") return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const playNote = (freq: number, delay: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);

        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.value = 6.2;
        lfoGain.gain.value = 4.5;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);

        gain.gain.setValueAtTime(0, ctx.currentTime + delay);
        gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + delay + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        lfo.start(ctx.currentTime + delay);
        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + duration);
      };

      playNote(587.33, 0, 0.7);
      playNote(739.99, 0.12, 0.7);
      playNote(880.00, 0.24, 1.1);
    } catch (e) {
      console.error("Audio Context failed:", e);
    }
  };

  // Web Audio Synthesis for Incorrect Answer (Warm mridanga double-beat)
  const playWrongSound = () => {
    if (!soundEnabled || typeof window === "undefined") return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

      const playMridangaBeat = (pitch: number, time: number, duration: number, vol: number) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.type = "triangle";
        osc.frequency.setValueAtTime(pitch, ctx.currentTime + time);
        osc.frequency.exponentialRampToValueAtTime(pitch * 0.4, ctx.currentTime + time + duration);

        filter.type = "lowpass";
        filter.frequency.setValueAtTime(250, ctx.currentTime + time);

        gain.gain.setValueAtTime(vol, ctx.currentTime + time);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + time + duration - 0.01);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + time);
        osc.stop(ctx.currentTime + time + duration);
      };

      playMridangaBeat(130, 0, 0.25, 0.35);
      playMridangaBeat(95, 0.12, 0.4, 0.45);
    } catch (e) {
      console.error(e);
    }
  };

  // Ambient loop (Generative Raga Yaman/Bhupali melody)
  useEffect(() => {
    if (!ambientEnabled || typeof window === "undefined") return;

    let interval: any;
    const notes = [293.66, 329.63, 369.99, 440.00, 493.88, 587.33, 659.25, 739.99, 880.00, 987.77];
    let ctx: AudioContext | null = null;

    const playNote = () => {
      try {
        if (!ctx) {
          ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        if (ctx.state === "suspended") {
          ctx.resume();
        }

        const freq = notes[Math.floor(Math.random() * notes.length)];
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, ctx.currentTime);

        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.value = 5.5 + Math.random() * 1.5;
        lfoGain.gain.value = 2.5;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);

        filter.type = "lowpass";
        filter.frequency.value = 750;

        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 0.9);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 3.1);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        lfo.start();
        osc.start();
        osc.stop(ctx.currentTime + 3.3);
      } catch (e) {
        console.error(e);
      }
    };

    playNote();
    interval = setInterval(playNote, 4200);

    return () => {
      clearInterval(interval);
      if (ctx) {
        ctx.close();
      }
    };
  }, [ambientEnabled]);

  // Puṣpa Vṛṣṭi: Flower and Peacock Feather Rain Generator
  const triggerParticles = useCallback(() => {
    const chars = ["🌸", "🪷", "🌹", "💮", "🦚"];
    const colors = ["#e8954a", "#8b3a5a", "#d4a843", "#ffffff", "#10b981"];
    const newParticles: Particle[] = Array.from({ length: 32 }).map((_, i) => {
      const rand = Math.random();
      let xPos = 0;
      if (rand < 0.4) {
        xPos = Math.random() * 18;
      } else if (rand < 0.8) {
        xPos = 82 + Math.random() * 18;
      } else {
        xPos = 18 + Math.random() * 64;
      }
      return {
        id: Date.now() + i,
        x: xPos,
        char: chars[Math.floor(Math.random() * chars.length)],
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 16 + Math.random() * 24,
        delay: Math.random() * 1.8,
      };
    });
    setParticles(newParticles);

    setTimeout(() => {
      setParticles([]);
    }, 5500);
  }, []);



  // Load Metadata and Questions
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
        setRawQuestionsData(data);

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

  useEffect(() => {
    if (meta) {
      const modes = meta.enabled_modes || ["quiz"];
      if (!modes.includes(selectedSubMode)) {
        setSelectedSubMode(modes[0] as any);
      }
    }
  }, [meta, selectedSubMode]);

  const startQuiz = () => {
    if (allQuestions.length === 0) return;

    let targetQuestions = allQuestions;
    if (meta?.parts && selectedPartId !== "all") {
      let prefix = "";
      for (const part of meta.parts) {
        if (part.id === selectedPartId) {
          prefix = part.filter_prefix;
          break;
        }
        if (part.chapters) {
          const ch = part.chapters.find(c => c.id === selectedPartId);
          if (ch) {
            prefix = ch.filter_prefix;
            break;
          }
        }
      }
      if (prefix) {
        targetQuestions = allQuestions.filter(q => q.verse_number.startsWith(prefix));
      }
    }

    const shuffled = shuffle(targetQuestions).slice(0, Math.min(GAMIFICATION_CONFIG.gameUnlocks.quiz.questionsCount || 7, targetQuestions.length));
    setQuizQuestions(shuffled);
    setUserAnswers([]);
    setScreen("quiz");
  };

  const handleQuizComplete = (answers: UserAnswer[]) => {
    setUserAnswers(answers);

    const correctCount = answers.filter((a) => a.isCorrect).length;
    const isPerfect = correctCount === answers.length && answers.length > 0;

    // +XP per correct answer from config
    const baseXP = correctCount * GAMIFICATION_CONFIG.xpRewards.quizCorrectAnswer;
    // Perfect bonus from config
    const perfectBonus = isPerfect ? GAMIFICATION_CONFIG.xpRewards.quizPerfectScoreBonus : 0;
    const totalXP = baseXP + perfectBonus;

    let description = `Completed ${meta?.title || "Quiz"}: scored ${correctCount}/${answers.length}`;
    if (isPerfect) description += " (Perfect Score Bonus!)";

    addXp(totalXP, "quiz", description, {
      isPerfect,
      bookCount: 1
    });

    setScreen("results");
  };

  const handleGameComplete = (xpEarned: number, moves: number, seconds: number) => {
    let gameType = "Game";
    let extraData: any = {};

    if (screen === "memory") {
      gameType = "Memory Match";
      extraData = { memoryTurns: moves };
      // Base and efficiency bonuses from config
      let bonus = 0;
      if (moves <= 15) {
        bonus = GAMIFICATION_CONFIG.xpRewards.memoryMatchSpeedBonusUnder15Turns;
      } else if (moves <= 22) {
        bonus = GAMIFICATION_CONFIG.xpRewards.memoryMatchSpeedBonusUnder22Turns;
      }
      xpEarned = GAMIFICATION_CONFIG.xpRewards.memoryMatchBase + bonus;
    } else if (screen === "drag-drop") {
      gameType = "Drag & Drop";
      // Base and accuracy bonuses from config
      let bonus = 0;
      const accuracy = moves === 6 ? 100 : Math.round((6 / moves) * 100);
      if (accuracy === 100) {
        bonus = GAMIFICATION_CONFIG.xpRewards.dragDropPerfectBonus;
      }
      extraData = { dragAccuracy: accuracy };
      xpEarned = GAMIFICATION_CONFIG.xpRewards.dragDropBase + bonus;
    } else if (screen === "crossword") {
      gameType = "Crossword";
      extraData = { crosswordHints: moves };
      // Trust the letter-based XP calculated and passed from the CrosswordPOC component
    } else if (screen === "recall") {
      gameType = "Bhakti Recall";
      extraData = { recallRetries: moves };
      let bonus = moves === 0 ? GAMIFICATION_CONFIG.xpRewards.recallPerfectBonus : 0;
      xpEarned = GAMIFICATION_CONFIG.xpRewards.recallBase + bonus;
    } else if (screen === "builder") {
      gameType = "Sloka Builder";
      extraData = { builderMistakesAndHints: moves };
      let bonus = moves === 0 ? GAMIFICATION_CONFIG.xpRewards.builderPerfectBonus : 0;
      xpEarned = xpEarned + bonus;
    } else if (screen === "guesser") {
      gameType = "Mystic Guesser";
      // moves parameter here stores the score (number of correct answers, e.g. 5/5)
      // xpEarned holds the total XP calculated dynamically by the component
      setScreen("landing");
    } else if (screen === "pathfinder") {
      gameType = "Yaksha Prashna";
      extraData = { heartsLeft: moves, potsCollected: seconds };
    }

    let description = `Completed ${gameType} for ${meta?.title || "Book"}`;
    addXp(xpEarned, "game", description, extraData);
  };

  const toggleSound = () => {
    const nextVal = !soundEnabled;
    setSoundEnabled(nextVal);
    if (typeof window !== "undefined") {
      localStorage.setItem("quiz_sound_enabled", nextVal.toString());
    }
  };

  const toggleAmbient = () => {
    setAmbientEnabled(!ambientEnabled);
  };

  if (screen === "loading") {
    return (
      <>
        <nav>
          <div className="nav-brand">
            <span className="om">ॐ</span>
            <Link href="/" className="name">Tattva Darpaṇa</Link>
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
            <Link href="/" className="name">Tattva Darpaṇa</Link>
          </div>
          <Link href="/" className="nav-back-btn">← Back</Link>
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
      {/* ── PUṢPA VRISṬI PARTICLES ── */}
      {particles.length > 0 && (
        <div className="particle-container">
          {particles.map((p) => (
            <span
              key={p.id}
              className="puspa-particle"
              style={{
                left: `${p.x}%`,
                color: p.color,
                fontSize: `${p.size}px`,
                animationDelay: `${p.delay}s`,
              }}
            >
              {p.char}
            </span>
          ))}
        </div>
      )}

      <nav>
        <div className="nav-brand">
          <span className="om">ॐ</span>
          <Link href="/" className="name">Tattva Darpaṇa</Link>
        </div>

        <div className="nav-actions">
          {isMounted && (
            <>
              <span
                className="rank-badge interactive"
                title="Click to view Devotional Dashboard!"
                onClick={() => setDashboardOpen(true)}
              >
                📜 <span className="badge-text-long">{currentRank.title} (Lvl {stats.level})</span>
                <span className="badge-text-short">Lvl {stats.level}</span>
              </span>
            </>
          )}
          {screen !== "quiz" && screen !== "memory" && screen !== "drag-drop" && screen !== "crossword" && (
            <Link href="/" className="nav-back-btn">← Back</Link>
          )}
        </div>
      </nav>

      <div className="quiz-container">
        {/* ── SITE HEADER (Hidden during active crossword for screen space) ── */}
        {screen !== "crossword" && (
          <header className="site-header">
            <span className="om">ॐ</span>
            <h1>{meta.title}</h1>
            {meta.subtitle && <p className="subtitle">{meta.subtitle}</p>}

            <div className="sound-controls" style={{ justifyContent: "center" }}>
              <button
                className={`sound-toggle-btn ${soundEnabled ? "active" : ""}`}
                onClick={toggleSound}
                title="Toggle sound effects (flute, mridanga)"
              >
                {soundEnabled ? "🔊 Sound: On" : "🔇 Sound: Off"}
              </button>
              <button
                className={`sound-toggle-btn ${ambientEnabled ? "active" : ""}`}
                onClick={toggleAmbient}
                title="Toggle ambient flute background soundscape"
              >
                {ambientEnabled ? "🦚 Flute: On" : "🦚 Flute: Off"}
              </button>
            </div>
            <LotusDivider />
          </header>
        )}

        {/* ── LANDING SCREEN ── */}
        {screen === "landing" && (
          <div className="quiz-card screen-landing divine-aura fade-in">
            <h2>Test Your Knowledge</h2>
            <p>{meta.quiz_desc || meta.desc}</p>
            {meta.verse && <div className="verse-box">{meta.verse}</div>}

            {meta.parts && meta.parts.length > 0 && (
              <div className="scope-selector">
                <div className="scope-title">Select Quiz Scope</div>
                <div className="scope-options">
                  <div
                    className={`scope-option ${selectedPartId === "all" ? "selected" : ""}`}
                    onClick={() => {
                      setSelectedPartId("all");
                      setExpandedPartId(null);
                    }}
                  >
                    <span className="scope-name">Complete Book (All)</span>
                    <span className="scope-desc">Questions from all sections of the book.</span>
                  </div>
                  {meta.parts.map((part) => {
                    const hasChapters = part.chapters && part.chapters.length > 0;
                    const isExpanded = expandedPartId === part.id;
                    const isSelected = selectedPartId === part.id;

                    if (!hasChapters) {
                      return (
                        <div
                          key={part.id}
                          className={`scope-option ${isSelected ? "selected" : ""}`}
                          onClick={() => {
                            setSelectedPartId(part.id);
                            setExpandedPartId(null);
                          }}
                        >
                          <span className="scope-name">{part.name}</span>
                          {part.desc && <span className="scope-desc">{part.desc}</span>}
                        </div>
                      );
                    }

                    // Render collapsible part section
                    return (
                      <div key={part.id} className="scope-group" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        <div
                          className={`scope-option ${isExpanded ? "expanded" : ""} ${isSelected ? "selected" : ""}`}
                          onClick={() => {
                            setExpandedPartId(isExpanded ? null : part.id);
                          }}
                          style={{ display: "flex", flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
                        >
                          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                            <span className="scope-name">{part.name}</span>
                            {part.desc && <span className="scope-desc">{part.desc}</span>}
                          </div>
                          <span style={{
                            fontSize: "1.1rem",
                            marginLeft: "1rem",
                            color: "var(--saffron)",
                            transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                            transition: "transform 0.2s",
                            display: "inline-block"
                          }}>
                            ▾
                          </span>
                        </div>

                        {isExpanded && (
                          <div className="chapter-options" style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.5rem",
                            paddingLeft: "1.2rem",
                            borderLeft: "2px solid var(--border)",
                            margin: "0.2rem 0"
                          }}>
                            {/* Option to select the entire part */}
                            <div
                              className={`scope-option ${selectedPartId === part.id ? "selected" : ""}`}
                              onClick={() => setSelectedPartId(part.id)}
                              style={{ padding: "0.6rem 1rem" }}
                            >
                              <span className="scope-name" style={{ fontSize: "0.82rem" }}>All of {part.name}</span>
                              <span className="scope-desc" style={{ fontSize: "0.76rem" }}>Study all chapters in this part.</span>
                            </div>

                            {/* Individual chapters */}
                            {part.chapters?.map((chapter) => (
                              <div
                                key={chapter.id}
                                className={`scope-option ${selectedPartId === chapter.id ? "selected" : ""}`}
                                onClick={() => setSelectedPartId(chapter.id)}
                                style={{ padding: "0.6rem 1rem" }}
                              >
                                <span className="scope-name" style={{ fontSize: "0.82rem" }}>{chapter.name}</span>
                                {chapter.desc && <span className="scope-desc" style={{ fontSize: "0.76rem" }}>{chapter.desc}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {(() => {
              const modes = meta.enabled_modes || ["quiz"];

              return (
                <div className="game-mode-selector" style={{ marginTop: "1.5rem", width: "100%" }}>
                  <div className="scope-title" style={{ marginBottom: "0.8rem", textAlign: "center" }}>Select Game Mode</div>
                  <div style={{ display: "flex", gap: "0.8rem", justifyContent: "center", flexWrap: "wrap", marginBottom: "1.5rem" }}>
                    {modes.map((m) => {
                      const cfg = GAMIFICATION_CONFIG.gameUnlocks[m as "quiz" | "memory" | "drag-drop" | "crossword" | "recall"];
                      const isUnlocked = stats.level >= cfg.unlockLevel;
                      const isSelected = selectedSubMode === m;

                      return (
                        <button
                          key={m}
                          className={`btn game-mode-btn ${isSelected ? "btn-primary active" : "btn-secondary"} ${!isUnlocked ? "locked-mode" : ""}`}
                          disabled={!isUnlocked}
                          onClick={() => isUnlocked && setSelectedSubMode(m as any)}
                          style={{
                            width: "100%",
                            maxWidth: "320px",
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.2rem",
                            padding: "0.8rem",
                            opacity: isUnlocked ? 1 : 0.55,
                            cursor: isUnlocked ? "pointer" : "not-allowed"
                          }}
                          title={isUnlocked ? cfg.description : `Unlocks at Level ${cfg.unlockLevel}`}
                        >
                          <span style={{ fontWeight: "600", fontSize: "0.95rem" }}>
                            {cfg.emoji} {cfg.displayName}
                          </span>
                          <span style={{ fontSize: "0.7rem", opacity: 0.8 }}>
                            {isUnlocked ? cfg.description : `🔒 Level ${cfg.unlockLevel}`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            <div className="landing-actions" style={{ display: "flex", gap: "1rem", justifyContent: "center", marginTop: "1.5rem" }}>
              <button
                className="btn btn-primary"
                disabled={!isGameModeUnlocked(selectedSubMode, stats.level)}
                onClick={() => {
                  if (selectedSubMode === "quiz") startQuiz();
                  else if (selectedSubMode === "memory") setScreen("memory");
                  else if (selectedSubMode === "drag-drop") setScreen("drag-drop");
                  else if (selectedSubMode === "crossword") setScreen("crossword");
                  else if (selectedSubMode === "recall") setScreen("recall");
                  else if (selectedSubMode === "builder") setScreen("builder");
                  else if (selectedSubMode === "guesser") setScreen("guesser");
                  else if (selectedSubMode === "pathfinder") setScreen("pathfinder");
                  else if (selectedSubMode === "sequence") setScreen("sequence");
                }}
              >
                {selectedSubMode === "quiz" ? "Begin Quiz" : "Start Game"}
              </button>
              <Link href="/" className="btn btn-secondary">
                Back to Library
              </Link>
            </div>
          </div>
        )}

        {/* ── ACTIVE STANDARD QUIZ ── */}
        {screen === "quiz" && (
          <StandardQuiz
            questions={quizQuestions}
            playCorrectSound={playCorrectSound}
            playWrongSound={playWrongSound}
            triggerParticles={triggerParticles}
            onComplete={handleQuizComplete}
            bookId={bookId}
          />
        )}

        {/* ── RESULTS SCREEN ── */}
        {screen === "results" && (
          <QuizResults
            userAnswers={userAnswers}
            onRetry={startQuiz}
          />
        )}

        {/* ── MEMORY MATCH GAME ── */}
        {screen === "memory" && (
          <MemoryMatch
            bookId={bookId}
            playCorrectSound={playCorrectSound}
            playWrongSound={playWrongSound}
            triggerParticles={triggerParticles}
            onClose={() => setScreen("landing")}
            onComplete={handleGameComplete}
          />
        )}

        {/* ── DRAG AND DROP MATCHING ── */}
        {screen === "drag-drop" && (
          <DragDrop
            bookId={bookId}
            playCorrectSound={playCorrectSound}
            playWrongSound={playWrongSound}
            triggerParticles={triggerParticles}
            onClose={() => setScreen("landing")}
            onComplete={handleGameComplete}
          />
        )}

        {screen === "crossword" && (
          <Crossword
            bookId={bookId}
            bookTitle={meta.title}
            onClose={() => setScreen("landing")}
            onComplete={(xp, moves, secs) => handleGameComplete(xp, moves, secs)}
          />
        )}

        {screen === "recall" && (
          <BhaktiRecall
            bookId={bookId}
            playCorrectSound={playCorrectSound}
            playWrongSound={playWrongSound}
            triggerParticles={triggerParticles}
            onClose={() => setScreen("landing")}
            onComplete={(xp, retries, secs) => handleGameComplete(xp, retries, secs)}
          />
        )}

        {screen === "builder" && (
          <SlokaBuilder
            bookId={bookId}
            playCorrectSound={playCorrectSound}
            playWrongSound={playWrongSound}
            triggerParticles={triggerParticles}
            onClose={() => setScreen("landing")}
            onComplete={(xp, mistakes, secs) => handleGameComplete(xp, mistakes, secs)}
          />
        )}

        {screen === "guesser" && (
          <Guesser
            bookId={bookId}
            playCorrectSound={playCorrectSound}
            playWrongSound={playWrongSound}
            triggerParticles={triggerParticles}
            onClose={() => setScreen("landing")}
            onComplete={(xp, score, secs) => handleGameComplete(xp, score, secs)}
          />
        )}

        {screen === "pathfinder" && (
          <YakshaPrashna
            bookId={bookId}
            bookQuestions={allQuestions}
            playCorrectSound={playCorrectSound}
            playWrongSound={playWrongSound}
            triggerParticles={triggerParticles}
            onClose={() => setScreen("landing")}
            onComplete={(xp, hearts, pots) => {
              handleGameComplete(xp, hearts, pots);
              setScreen("landing");
            }}
          />
        )}

        {screen === "sequence" && rawQuestionsData && (
          <SequenceStudy
            bookId={bookId}
            bookTitle={meta.title}
            rawQuestionsData={rawQuestionsData}
            playCorrectSound={playCorrectSound}
            playWrongSound={playWrongSound}
            triggerParticles={triggerParticles}
            addXp={addXp}
            onClose={() => setScreen("landing")}
          />
        )}
      </div>

      {/* ── MODALS & CELEBRATIONS ── */}
      {isMounted && (
        <>
          <SadhanaDashboard
            isOpen={dashboardOpen}
            onClose={() => setDashboardOpen(false)}
            stats={stats}
            resetProgress={resetProgress}
          />
          <LevelUpModal
            isOpen={!!pendingLevelUp}
            onClose={clearLevelUp}
            oldLevel={pendingLevelUp?.oldLevel || 1}
            newLevel={pendingLevelUp?.newLevel || 2}
            rankTitle={pendingLevelUp?.rankTitle || ""}
            newBadges={pendingLevelUp?.newBadges || []}
            triggerParticles={triggerParticles}
            soundEnabled={soundEnabled}
          />
        </>
      )}
    </>
  );
}
