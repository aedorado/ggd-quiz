"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { GAMIFICATION_CONFIG } from "../utils/gamificationConfig";

interface Book {
  id: string;
  title: string;
  devanagari?: string;
  author: string;
  author_id?: string;
  category: string;
  desc: string;
  accent: string;
  status: "ready" | "soon";
  href?: string;
  featured?: boolean;
  questions?: number;
}

const AUTHOR_MAP: Record<string, string> = {
  rupa: "Rūpa Gosvāmī",
  sanatana: "Sanātana Gosvāmī",
  jiva: "Jīva Gosvāmī",
  raghunatha: "Raghunātha Dāsa",
  visvanatha: "Viśvanātha Cakravartī",
  bhaktivinoda: "Bhaktivinoda Ṭhākura",
  narottama: "Narottama dāsa",
  karnapura: "Kavi Karṇapūra",
  kaviraja: "Kṛṣṇadāsa Kavirāja",
  vyasadeva: "Vyāsadeva",
  vrindavana_dasa: "Vṛndāvana dāsa",
  caitanya: "Śrī Caitanya",
  sruti: "Śruti-śāstra",
  brahma: "Lord Brahmā",
  locana: "Locana dāsa",
  godavara: "Godāvara Miśra",
};

const AUTHOR_ORDER = [
  "caitanya",
  "rupa",
  "sanatana",
  "jiva",
  "raghunatha",
  "karnapura",
  "kaviraja",
  "vrindavana_dasa",
  "locana",
  "narottama",
  "visvanatha",
  "bhaktivinoda",
  "vyasadeva",
  "brahma",
  "sruti",
  "godavara"
];

export default function Home() {
  const [books, setBooks] = useState<Book[]>([]);
  const [activeFilter, setActiveFilter] = useState("all");
  const [uniqueAuthors, setUniqueAuthors] = useState<{ id: string; label: string }[]>([]);

  useEffect(() => {
    async function loadBooks() {
      try {
        const response = await fetch("/books.json");
        const data = await response.json();
        const parsed = Object.entries(data).map(([id, info]) => ({
          id,
          ...(info as any),
        }));
        setBooks(parsed);

        // Extract unique author ids present in the data
        const authorIds = Array.from(
          new Set(parsed.map((b) => b.author_id).filter(Boolean))
        ) as string[];

        // Sort based on AUTHOR_ORDER, placing unknown ones at the end
        authorIds.sort((a, b) => {
          const idxA = AUTHOR_ORDER.indexOf(a);
          const idxB = AUTHOR_ORDER.indexOf(b);
          if (idxA === -1 && idxB === -1) return a.localeCompare(b);
          if (idxA === -1) return 1;
          if (idxB === -1) return -1;
          return idxA - idxB;
        });

        const authorsList = authorIds.map((id) => ({
          id,
          label: AUTHOR_MAP[id] || id.charAt(0).toUpperCase() + id.slice(1),
        }));
        setUniqueAuthors(authorsList);
      } catch (error) {
        console.error("Failed to load books.json:", error);
      }
    }
    loadBooks();
  }, []);

  const catLabel = (c: string) => {
    const map: Record<string, string> = {
      identities: "Identities & Associates",
      philosophy: "Philosophy & Tattva",
      devotion: "Bhakti & Rasa",
      saints: "Saints & Ācāryas",
      vraja: "Vraja Dhāma",
    };
    return map[c] || c;
  };

  const filteredBooks =
    activeFilter === "all"
      ? books
      : books.filter((b) => b.author_id === activeFilter);

  return (
    <>
      {/* ── NAV ── */}
      <nav>
        <div className="nav-brand">
          <span className="om">ॐ</span>
          <Link href="/" className="name">
            Tattva Darpaṇa
          </Link>
        </div>
        <ul className="nav-links">
          <li>
            <a href="#texts">Texts</a>
          </li>
          <li>
            <a href="#about">About</a>
          </li>
        </ul>
      </nav>

      {/* ── HERO ── */}
      <section className="hero">
        <span className="hero-lotus">ॐ</span>
        <h1>Tattva Darpaṇa</h1>
        <span className="hero-devanagari">तत्त्व दर्पण</span>
        <div className="hero-rule">
          <div className="hero-rule-diamond"></div>
        </div>
        <p className="hero-tagline">
          A mirror of truth — explore the philosophy, scriptures, saints,
          <br />
          and devotional science of Gauḍīya Vaiṣṇavism through living inquiry.
        </p>
        <p className="hero-sub">Śravaṇam &middot; Mananam &middot; Nididhyāsanam &middot; Vandanam</p>
      </section>

      {/* ── STATS ── */}
      <div className="stats-strip">
        <div className="stat-item">
          <span className="stat-num">{books.length}</span>
          <span className="stat-lbl">Sacred texts</span>
        </div>
        <div className="stat-item">
          <span className="stat-num">{GAMIFICATION_CONFIG.gameUnlocks.quiz.questionsCount}</span>
          <span className="stat-lbl">Questions per round</span>
        </div>
        <div className="stat-item">
          <span className="stat-num">∞</span>
          <span className="stat-lbl">Unique rounds</span>
        </div>
        <div className="stat-item">
          <span className="stat-num">{uniqueAuthors.length}</span>
          <span className="stat-lbl">Ācāryas & Sources</span>
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <main className="books-main" id="texts">
        <div className="section-header">
          <h2>Choose a text to begin</h2>
          <div className="section-header-line"></div>
        </div>

        {/* FILTER BAR */}
        <div className="filter-bar">
          {[{ id: "all", label: "All Authors" }, ...uniqueAuthors].map((filter) => (
            <button
              key={filter.id}
              className={`filter-btn ${
                activeFilter === filter.id ? "active" : ""
              }`}
              onClick={() => setActiveFilter(filter.id)}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {/* GRID */}
        <div className="books-grid">
          {filteredBooks.map((b, i) => {
            const isReady = b.status === "ready";
            const cardClass = `book-card ${isReady ? "available" : "coming-soon"} ${
              b.featured ? "featured" : ""
            }`;

            const CardContent = (
              <>
                <div
                  className="card-accent"
                  style={{ background: b.accent }}
                ></div>
                <div className="card-body">
                  <div className="card-category">{catLabel(b.category)}</div>
                  <div className="card-title">{b.title}</div>
                  {b.devanagari && (
                    <div className="card-devanagari">{b.devanagari}</div>
                  )}
                  <div className="card-author">{b.author}</div>
                  <div className="card-desc">{b.desc}</div>
                  <div className="card-footer">
                    <span
                      className={`status-badge ${
                        isReady ? "badge-ready" : "badge-soon"
                      }`}
                    >
                      {isReady ? "Ready" : "Coming soon"}
                    </span>
                    {b.questions && (
                      <span className="card-qcount">
                        {b.questions} questions
                      </span>
                    )}
                    {isReady && <span className="card-arrow">→</span>}
                  </div>
                </div>
              </>
            );

            if (isReady && b.href) {
              return (
                <Link
                  key={b.id}
                  href={b.href}
                  className={cardClass}
                  style={{
                    animationDelay: `${i * 0.045}s`,
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  {CardContent}
                </Link>
              );
            }

            return (
              <div
                key={b.id}
                className={cardClass}
                style={{ animationDelay: `${i * 0.045}s` }}
              >
                {CardContent}
              </div>
            );
          })}
        </div>
      </main>

      {/* ── VERSE BAND ── */}
      <div className="verse-band" id="about">
        <span className="verse-om">❋</span>
        <blockquote>
          "One who knows the truth about the pastimes, qualities, name, and form
          of the Supreme Lord is freed from all sins and, after leaving this
          body, attains the transcendental abode of the Lord."
          <cite>Śrīmad-Bhāgavatam &middot; 10.14.3</cite>
        </blockquote>
      </div>

      {/* ── FOOTER ── */}
      <footer>
        <p className="foot-title">Tattva Darpaṇa — तत्त्व दर्पण</p>
        <p className="foot-trinity">Śravaṇam · Mananam · Nididhyāsanam · Vandanam</p>
        <p className="foot-copy">In service of the Gauḍīya Vaiṣṇava paramparā</p>
      </footer>
    </>
  );
}
