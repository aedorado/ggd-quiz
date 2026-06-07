"use client";

import React, { useEffect, useState } from "react";

export default function ThemeToggleInline() {
  const [theme, setTheme] = useState<"gauri" | "shyama">("gauri");

  useEffect(() => {
    const activeTheme =
      (document.documentElement.getAttribute("data-theme") as "gauri" | "shyama") ||
      "gauri";
    setTheme(activeTheme);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "gauri" ? "shyama" : "gauri";
    setTheme(nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
    localStorage.setItem("theme", nextTheme);
  };

  return (
    <button
      className="theme-toggle-btn"
      onClick={toggleTheme}
      aria-label="Toggle Devotional Theme"
    >
      {theme === "gauri" ? (
        <span className="theme-toggle-label">
          <span className="theme-text">Śyāma</span>
          <span className="theme-emoji">🦚</span>
        </span>
      ) : (
        <span className="theme-toggle-label">
          <span className="theme-text">Gaurī</span>
          <span className="theme-emoji">🌸</span>
        </span>
      )}
    </button>
  );
}
