"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

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
const LotusDivider = () => (
  <div className="lotus-divider">
    <svg className="lotus-svg" viewBox="0 0 24 24">
      <path d="M12,3C12,3 9,8 9,11C9,12.66 10.34,14 12,14C13.66,14 15,12.66 15,11C15,8 12,3 12,3M12,6.5C12.83,8.5 13.5,10.5 13.5,11C13.5,11.83 12.83,12.5 12,12.5C11.17,12.5 10.5,11.83 10.5,11C10.5,10.5 11.17,8.5 12,6.5M7,12C7,12 4.5,14 4.5,16C4.5,17.1 5.4,18 6.5,18C7.6,18 8.5,17.1 8.5,16C8.5,14 7,12 7,12M17,12C17,12 15.5,14 15.5,16C15.5,17.1 16.4,18 17.5,18C18.6,18 19.5,17.1 19.5,16C19.5,14 17,12 17,12Z" />
    </svg>
  </div>
);

const getBhaktiRank = (xp: number, taken: number) => {
  if (taken < 3) return "Jijñāsu";
  const avg = xp / taken;
  if (avg >= 6.0) return "Upāsaka";
  if (avg >= 4.0) return "Svādhyāya-rati";
  if (avg >= 2.0) return "Tattva-vit";
  return "Jijñāsu";
};

export default function Home() {
  const [books, setBooks] = useState<Book[]>([]);
  const [activeFilter, setActiveFilter] = useState("all");
  const [uniqueAuthors, setUniqueAuthors] = useState<{ id: string; label: string }[]>([]);
  const [sadhanaStreak, setSadhanaStreak] = useState(0);
  const [bhaktiXp, setBhaktiXp] = useState(0);
  const [quizzesTaken, setQuizzesTaken] = useState(0);
  const [nectarCard, setNectarCard] = useState<{ verse: string; translation: string; source: string } | null>(null);

  const NECTAR_POOL = [
    {
      verse: "namāmīśvaram sac-cid-ānanda-rūpaṁ\nlasad-kuṇḍalaṁ gokule bhrājamānam",
      translation: "I offer my respectful obeisances unto that Supreme Ishvara, whose form is eternal, conscious, and full of bliss, whose earrings swing and who shines beautifully in Gokula.",
      source: "Śrī Dāmodarāṣṭakam · 1"
    },
    {
      verse: "ārādhyo bhagavān vrajeśa-tanayas tad-dhāma vṛndāvanam\nramyā kācid upāsanā vraja-vadhū-vargēṇa yā kalpitā",
      translation: "The Supreme Lord, the son of Nanda Maharaja, is the ultimate object of worship. His transcendental abode is Vrindavana. The most excellent method of worship is that which was performed by the young damsels of Vraja.",
      source: "Śrīla Viśvanātha Cakravartī Ṭhākura"
    },
    {
      verse: "nayanam galad-aśru-dhārayā\nvadanam gadgada-ruddhayā girā",
      translation: "O My Lord, when will My eyes be decorated with tears of love flowing constantly when I chant Your holy name? When will My voice choke up with ecstasy?",
      source: "Śikṣāṣṭaka · 6"
    },
    {
      verse: "anarpita-carīṁ cirāt karuṇayāvatīrṇaḥ kalau\nsamarpayitum unnatojjvala-rasāṁ sva-bhakti-śriyam",
      translation: "May the Supreme Lord, who is known as the son of Srimati Saci-devi, be transcendentally situated in the innermost chambers of your heart. Resplendent with the radiance of molten gold, He has appeared in the Age of Kali by His causeless mercy to bestow what no incarnation has ever offered before: the most sublime and radiant mellow of devotional service, the mellow of conjugal love.",
      source: "Śrī Caitanya-caritāmṛta · Ādi 1.4"
    },
    {
      verse: "yo 'py āsuram bhāvam upetya te bhayāt\ntvam eva dhyāyan samayām gataḥ sphuṭam",
      translation: "Even the demons, who entered into the mood of hostility, attained liberation by thinking of You in fear. What then to speak of those who worship You with pure love?",
      source: "Śrīmad-Bhāgavatam"
    }
  ];

  const drawNectarCard = () => {
    const current = nectarCard;
    let next = NECTAR_POOL[Math.floor(Math.random() * NECTAR_POOL.length)];
    while (next === current) {
      next = NECTAR_POOL[Math.floor(Math.random() * NECTAR_POOL.length)];
    }
    setNectarCard(next);
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      setSadhanaStreak(parseInt(localStorage.getItem("sadhana_streak") || "0", 10));
      setBhaktiXp(parseInt(localStorage.getItem("bhakti_xp") || "0", 10));
      setQuizzesTaken(parseInt(localStorage.getItem("bhakti_quizzes_taken") || "0", 10));
    }
  }, []);

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
        <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
          <span className="rank-badge" title="Your scriptural study rank!">
            📜 {getBhaktiRank(bhaktiXp, quizzesTaken)} ({bhaktiXp} XP)
          </span>
          {sadhanaStreak > 0 && (
            <span className="streak-badge" title="Daily study streak!">
              🔥 {sadhanaStreak} Day Streak
            </span>
          )}
          <ul className="nav-links" style={{ display: "flex", gap: "1.5rem", listStyle: "none" }}>
            <li>
              <a href="#texts">Texts</a>
            </li>
            <li>
              <a href="#about">About</a>
            </li>
          </ul>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="hero">
        <span className="hero-lotus">ॐ</span>
        <h1>Tattva Darpaṇa</h1>
        <span className="hero-devanagari">तत्त्व दर्पण</span>
        <LotusDivider />
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
          <span className="stat-num">7</span>
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
              className={`filter-btn ${activeFilter === filter.id ? "active" : ""
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
            const cardClass = `book-card ${isReady ? "available" : "coming-soon"} ${b.featured ? "featured" : ""
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
                      className={`status-badge ${isReady ? "badge-ready" : "badge-soon"
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

        {/* ── NECTAR DROPS WIDGET ── */}
        <section className="nectar-widget-container">
          <div className="section-header" style={{ justifyContent: "center" }}>
            <h2>Nectar Drops from the Ocean</h2>
          </div>
          <p style={{ color: "var(--ink-soft)", fontStyle: "italic", fontSize: "0.95rem" }}>
            Draw a card for your daily meditation and contemplate the sweetness of the Gauḍīya Vaiṣṇava truths.
          </p>

          {nectarCard ? (
            <div className="nectar-card-box divine-aura fade-in">
              <div className="nectar-card-verse">
                {nectarCard.verse.split("\n").map((line, idx) => (
                  <React.Fragment key={idx}>
                    {line}
                    <br />
                  </React.Fragment>
                ))}
              </div>
              <p className="nectar-card-translation">
                "{nectarCard.translation}"
              </p>
              <div className="nectar-card-source">
                — {nectarCard.source}
              </div>
              <button
                className="btn btn-secondary"
                onClick={drawNectarCard}
                style={{ marginTop: "1.5rem", padding: "0.4rem 1.2rem", fontSize: "0.75rem" }}
              >
                Draw Another Card
              </button>
            </div>
          ) : (
            <div style={{ marginTop: "1.5rem" }}>
              <button className="btn btn-primary" onClick={drawNectarCard}>
                🪷 Draw Nectar Card
              </button>
            </div>
          )}
        </section>
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
