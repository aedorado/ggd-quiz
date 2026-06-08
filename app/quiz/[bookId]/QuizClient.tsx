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

interface BookPart {
  id: string;
  name: string;
  desc: string;
  filter_prefix: string;
}

interface BookMeta {
  title: string;
  subtitle?: string;
  desc?: string;
  quiz_desc?: string;
  verse?: string;
  output_file?: string;
  parts?: BookPart[];
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

const LotusDivider = () => (
  <div className="lotus-divider">
    <svg className="lotus-svg" viewBox="0 0 24 24">
      <path d="M12,3C12,3 9,8 9,11C9,12.66 10.34,14 12,14C13.66,14 15,12.66 15,11C15,8 12,3 12,3M12,6.5C12.83,8.5 13.5,10.5 13.5,11C13.5,11.83 12.83,12.5 12,12.5C11.17,12.5 10.5,11.83 10.5,11C10.5,10.5 11.17,8.5 12,6.5M7,12C7,12 4.5,14 4.5,16C4.5,17.1 5.4,18 6.5,18C7.6,18 8.5,17.1 8.5,16C8.5,14 7,12 7,12M17,12C17,12 15.5,14 15.5,16C15.5,17.1 16.4,18 17.5,18C18.6,18 19.5,17.1 19.5,16C19.5,14 17,12 17,12Z" />
    </svg>
  </div>
);

interface Particle {
  id: number;
  x: number;
  char: string;
  color: string;
  size: number;
  delay: number;
}

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
  const [selectedPartId, setSelectedPartId] = useState<string>("all");

  // Option order preservation
  const [shuffledOptions, setShuffledOptions] = useState<string[]>([]);

  // Krishna Prema Additions State
  const [particles, setParticles] = useState<Particle[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [ambientEnabled, setAmbientEnabled] = useState(false);
  const [sadhanaStreak, setSadhanaStreak] = useState(0);
  const [bhaktiXp, setBhaktiXp] = useState(0);
  const [quizzesTaken, setQuizzesTaken] = useState(0);

  const getBhaktiRank = (xp: number, taken: number) => {
    if (taken < 3) return "Jijñāsu";
    const avg = xp / taken;
    if (avg >= 6.0) return "Upāsaka";
    if (avg >= 4.0) return "Svādhyāya-rati";
    if (avg >= 2.0) return "Tattva-vit";
    return "Jijñāsu";
  };

  // Load streak and Bhakti Rank on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const streak = parseInt(localStorage.getItem("sadhana_streak") || "0", 10);
      setSadhanaStreak(streak);

      const xp = parseInt(localStorage.getItem("bhakti_xp") || "0", 10);
      setBhaktiXp(xp);

      const taken = parseInt(localStorage.getItem("bhakti_quizzes_taken") || "0", 10);
      setQuizzesTaken(taken);
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

        // Add subtle vibrato (flute blow)
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

      // Sweet pentatonic D-Major arpeggio (D5 -> F#5 -> A5)
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

      // Double mridanga beat (ta-dheem)
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
    // Pentatonic Raga scales (D4, E4, F#4, A4, B4, D5, E5, F#5, A5, B5)
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

        // Flute air flow vibrato
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.value = 5.5 + Math.random() * 1.5;
        lfoGain.gain.value = 2.5;
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);

        filter.type = "lowpass";
        filter.frequency.value = 750;

        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 0.9); // Slow attack
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 3.1); // Slow release

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
  const triggerParticles = () => {
    const chars = ["🌸", "🪷", "🌹", "💮", "🦚"];
    const colors = ["#e8954a", "#8b3a5a", "#d4a843", "#ffffff", "#10b981"];
    const newParticles: Particle[] = Array.from({ length: 32 }).map((_, i) => {
      const rand = Math.random();
      let xPos = 0;
      if (rand < 0.4) {
        // Left margin (40% of particles)
        xPos = Math.random() * 18;
      } else if (rand < 0.8) {
        // Right margin (40% of particles)
        xPos = 82 + Math.random() * 18;
      } else {
        // Middle section (20% of particles, very sparse)
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

    // Clear particles after animation
    setTimeout(() => {
      setParticles([]);
    }, 5500);
  };

  const updateSadhanaStreak = () => {
    if (typeof window === "undefined") return;
    try {
      const todayStr = new Date().toDateString();
      const lastDate = localStorage.getItem("sadhana_last_date");
      let currentStreak = parseInt(localStorage.getItem("sadhana_streak") || "0", 10);

      if (lastDate === todayStr) {
        return; // Already logged today
      }

      if (lastDate) {
        const lastDateObj = new Date(lastDate);
        const todayObj = new Date(todayStr);
        const diffTime = Math.abs(todayObj.getTime() - lastDateObj.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays === 1) {
          currentStreak += 1;
        } else {
          currentStreak = 1;
        }
      } else {
        currentStreak = 1;
      }

      localStorage.setItem("sadhana_streak", currentStreak.toString());
      localStorage.setItem("sadhana_last_date", todayStr);
      setSadhanaStreak(currentStreak);
    } catch (e) {
      console.error(e);
    }
  };

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

    let targetQuestions = allQuestions;
    if (meta?.parts && selectedPartId !== "all") {
      const part = meta.parts.find(p => p.id === selectedPartId);
      if (part) {
        targetQuestions = allQuestions.filter(q => q.verse_number.startsWith(part.filter_prefix));
      }
    }

    const shuffled = shuffle(targetQuestions).slice(0, Math.min(7, targetQuestions.length));
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

    if (isCorrect) {
      playCorrectSound();
      triggerParticles();
    } else {
      playWrongSound();
    }

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
        updateSadhanaStreak();

        // Update Bhakti XP (cumulative score) and completed rounds
        if (typeof window !== "undefined") {
          const currentXp = parseInt(localStorage.getItem("bhakti_xp") || "0", 10);
          const currentTaken = parseInt(localStorage.getItem("bhakti_quizzes_taken") || "0", 10);
          
          const finalAnswers = [...userAnswers, answerRecord];
          const correctCount = finalAnswers.filter((a) => a.isCorrect).length;
          
          const newXp = currentXp + correctCount;
          const newTaken = currentTaken + 1;
          
          localStorage.setItem("bhakti_xp", newXp.toString());
          localStorage.setItem("bhakti_quizzes_taken", newTaken.toString());
          
          setBhaktiXp(newXp);
          setQuizzesTaken(newTaken);
        }

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

  const getBhaktiSopana = (score: number, total: number) => {
    if (score >= 7) {
      return {
        title: "Prema Rank (Rasika Reader)",
        desc: "Perfect score! All glories to your deep, ecstatic absorption in the study of the Gauḍīya Vaiṣṇava scriptures. You are a true Rasika Reader!",
        emoji: "👑"
      };
    }
    if (score === 5 || score === 6) {
      return {
        title: "Bhāva Rank (Inspired Scholar)",
        desc: "Amazing score! Your scriptural comprehension is highly advanced and full of ecstatic inspiration.",
        emoji: "🪷"
      };
    }
    if (score === 4) {
      return {
        title: "Ruci & Āsakti Rank (Tasteful Reader)",
        desc: "Very good! You have developed a genuine taste and deep attraction for reading and contemplating these sacred scriptures.",
        emoji: "🦚"
      };
    }
    if (score === 3) {
      return {
        title: "Niṣṭhā Rank (Steady Student)",
        desc: "Steady progress! Your focus on Gauḍīya scriptures and study is becoming firm and unwavering.",
        emoji: "🌸"
      };
    }
    if (score === 2) {
      return {
        title: "Anartha-nivṛtti Rank (Clearing Doubts)",
        desc: "Good effort! Misconceptions and doubts are being cleared as you read and analyze the scriptural explanations.",
        emoji: "🕯️"
      };
    }
    if (score === 1) {
      return {
        title: "Sādhu-saṅga & Bhajana-kriyā Rank (Sincere Practitioner)",
        desc: "A beginning! You are taking shelter of study and holy practice. Keep reading and learning to progress your scriptural knowledge.",
        emoji: "🌱"
      };
    }
    return {
      title: "Śraddhā Rank (Inquiring Neophyte)",
      desc: "The seed is sown! You have the initial faith to inquire. Nurture this interest by continuing to read the translations and study the texts.",
      emoji: "✨"
    };
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

  const scoreCount = userAnswers.filter((a) => a.isCorrect).length;
  const totalCount = userAnswers.length;
  const sopana = getBhaktiSopana(scoreCount, totalCount);

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
          <Link href="/" className="name">
            Tattva Darpaṇa
          </Link>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <span className="rank-badge" title="Your scriptural study rank!">
            📜 {getBhaktiRank(bhaktiXp, quizzesTaken)} ({bhaktiXp} XP)
          </span>
          {sadhanaStreak > 0 && (
            <span className="streak-badge" title="Daily study streak!">
              🔥 {sadhanaStreak} Day Streak
            </span>
          )}
          {screen !== "quiz" && (
            <Link href="/" className="nav-back-btn">
              ← Back
            </Link>
          )}
        </div>
      </nav>

      <div className="quiz-container">
        {/* ── HEADER ── */}
        <header className="site-header">
          <span className="om">ॐ</span>
          <h1>{meta.title}</h1>
          {meta.subtitle && <p className="subtitle">{meta.subtitle}</p>}

          {/* Audio controls */}
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
                    onClick={() => setSelectedPartId("all")}
                  >
                    <span className="scope-name">Complete Book (All)</span>
                    <span className="scope-desc">Questions from all sections of the book.</span>
                  </div>
                  {meta.parts.map((part) => (
                    <div
                      key={part.id}
                      className={`scope-option ${selectedPartId === part.id ? "selected" : ""}`}
                      onClick={() => setSelectedPartId(part.id)}
                    >
                      <span className="scope-name">{part.name}</span>
                      <span className="scope-desc">{part.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
          <div className="quiz-card divine-aura fade-in">
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
          <div className="quiz-card divine-aura fade-in">
            <div className="result-summary">
              <div className="result-score">
                {scoreCount} <span>/ {totalCount}</span>
              </div>

              {/* Bhakti Sopana details */}
              <div className="bhakti-sopana-box">
                <div className="bhakti-sopana-title">
                  <span>{sopana.emoji}</span>
                  <span>{sopana.title}</span>
                </div>
                <p className="bhakti-sopana-desc">{sopana.desc}</p>
              </div>
            </div>
            <LotusDivider />

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
                        <div className="manuscript-verse-card">
                          <strong style={{ display: "block", marginBottom: "0.5rem", color: "var(--saffron)" }}>Reference — {a.verse_number}:</strong>
                          <div style={{ textAlign: "center", fontStyle: "italic", fontSize: "0.9rem", color: "var(--ink-mid)" }}>
                            {a.verse_text.split("\n").map((line, lIdx) => (
                              <React.Fragment key={lIdx}>
                                {line}
                                <br />
                              </React.Fragment>
                            ))}
                          </div>
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
