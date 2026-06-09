"use client";

import React, { useState } from "react";
import Link from "next/link";

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

interface QuizResultsProps {
  userAnswers: UserAnswer[];
  onRetry: () => void;
}

const LotusDivider = () => (
  <div className="lotus-divider">
    <svg className="lotus-svg" viewBox="0 0 24 24">
      <path d="M12,3C12,3 9,8 9,11C9,12.66 10.34,14 12,14C13.66,14 15,12.66 15,11C15,8 12,3 12,3M12,6.5C12.83,8.5 13.5,10.5 13.5,11C13.5,11.83 12.83,12.5 12,12.5C11.17,12.5 10.5,11.83 10.5,11C10.5,10.5 11.17,8.5 12,6.5M7,12C7,12 4.5,14 4.5,16C4.5,17.1 5.4,18 6.5,18C7.6,18 8.5,17.1 8.5,16C8.5,14 7,12 7,12M17,12C17,12 15.5,14 15.5,16C15.5,17.1 16.4,18 17.5,18C18.6,18 19.5,17.1 19.5,16C19.5,14 17,12 17,12Z" />
    </svg>
  </div>
);

export default function QuizResults({ userAnswers, onRetry }: QuizResultsProps) {
  const [openAccordions, setOpenAccordions] = useState<Record<number, boolean>>({});

  const toggleAccordion = (index: number) => {
    setOpenAccordions((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
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

  const scoreCount = userAnswers.filter((a) => a.isCorrect).length;
  const totalCount = userAnswers.length;
  const sopana = getBhaktiSopana(scoreCount, totalCount);

  return (
    <div className="quiz-card divine-aura fade-in">
      <div className="result-summary">
        <div className="result-score">
          {scoreCount} <span>/ {totalCount}</span>
          <div style={{ fontSize: "0.85rem", marginTop: "0.4rem", fontFamily: "Cinzel, serif", fontWeight: 600, color: "var(--saffron)" }}>
            🏆 +{scoreCount * 5 + (scoreCount === totalCount && totalCount > 0 ? 15 : 0)} XP
          </div>
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
            <div key={i} className={`result-item ${isOpen ? "open" : ""}`}>
              <div className="result-item-header" onClick={() => toggleAccordion(i)}>
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
        <button className="btn btn-primary" onClick={onRetry}>
          Try Again
        </button>
        <Link href="/" className="btn btn-secondary">
          Back to Library
        </Link>
      </div>
    </div>
  );
}
