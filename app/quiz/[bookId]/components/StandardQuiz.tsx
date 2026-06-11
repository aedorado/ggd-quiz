"use client";

import React, { useState, useEffect } from "react";

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

interface StandardQuizProps {
  questions: Question[];
  playCorrectSound: () => void;
  playWrongSound: () => void;
  triggerParticles: () => void;
  onComplete: (answers: UserAnswer[]) => void;
  bookId?: string;
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

export default function StandardQuiz({
  questions,
  playCorrectSound,
  playWrongSound,
  triggerParticles,
  onComplete,
  bookId,
}: StandardQuizProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [shuffledOptions, setShuffledOptions] = useState<string[]>([]);
  const [userAnswers, setUserAnswers] = useState<UserAnswer[]>([]);

  useEffect(() => {
    if (questions.length > 0 && questions[currentIndex]) {
      setShuffledOptions(shuffle(questions[currentIndex].options));
    }
  }, [currentIndex, questions]);

  const handleSelectOption = (selected: string) => {
    if (answered) return;
    setAnswered(true);
    setSelectedOption(selected);

    const currentQ = questions[currentIndex];
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

    const updatedAnswers = [...userAnswers, answerRecord];
    setUserAnswers(updatedAnswers);

    setTimeout(() => {
      if (currentIndex + 1 < questions.length) {
        setCurrentIndex((prev) => prev + 1);
        setAnswered(false);
        setSelectedOption(null);
      } else {
        onComplete(updatedAnswers);
      }
    }, isCorrect ? 900 : 1400);
  };

  if (questions.length === 0 || !questions[currentIndex]) {
    return (
      <div className="quiz-card divine-aura fade-in">
        <p>No questions available for the selected scope.</p>
      </div>
    );
  }

  return (
    <div className="quiz-card divine-aura fade-in">
      <div className="progress-label">
        Question {currentIndex + 1} of {questions.length}
      </div>
      <div className="progress-bar-wrap">
        <div
          className="progress-bar-fill"
          style={{
            width: `${((currentIndex + 1) / questions.length) * 100}%`,
          }}
        ></div>
      </div>

      <div className="question-tags">
        {questions[currentIndex].verse_number && (
          <span className="tag" style={{ borderStyle: "double", borderWidth: "3px" }}>
            {bookId ? `${bookId.toUpperCase()} ${questions[currentIndex].verse_number}` : `Verse ${questions[currentIndex].verse_number}`}
          </span>
        )}
        {questions[currentIndex].tags.map((tag, i) => (
          <span key={i} className="tag">
            {tag}
          </span>
        ))}
        <span className={`tag difficulty-${questions[currentIndex].difficulty}`}>
          {questions[currentIndex].difficulty}
        </span>
      </div>

      <div className="question-text">
        {questions[currentIndex].question}
      </div>

      <div className="options-list">
        {shuffledOptions.map((opt, i) => {
          const currentQ = questions[currentIndex];
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
              key={`${currentIndex}-${opt}`}
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
  );
}
