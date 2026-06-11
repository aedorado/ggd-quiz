"use client";

import React, { useState } from "react";
import { DevotionalStats, BADGES, BadgeInfo, getRankForLevel, BHAKTI_RANKS } from "../utils/bhaktiProgress";

interface SadhanaDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  stats: DevotionalStats;
  resetProgress: () => void;
}

export default function SadhanaDashboard({ isOpen, onClose, stats, resetProgress }: SadhanaDashboardProps) {
  const [selectedBadge, setSelectedBadge] = useState<BadgeInfo | null>(null);

  if (!isOpen) return null;

  const currentRank = getRankForLevel(stats.level);
  const xpPercent = Math.min((stats.xpCurrent / stats.xpNeeded) * 100, 100);

  const activeBadgesCount = stats.badges.length;

  return (
    <div className="dashboard-overlay" onClick={onClose}>
      <div className="dashboard-modal divine-aura fade-in" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="dashboard-header">
          <div className="dashboard-brand">
            <span className="brand-om">ॐ</span>
            <h2>Sādhana Devotional Dashboard</h2>
          </div>
          <button className="dashboard-close-btn" onClick={onClose} aria-label="Close Dashboard">
            ✕
          </button>
        </div>

        <div className="dashboard-content">
          {/* Rank & Level Progress Panel */}
          <div className="dashboard-section rank-panel">
            <div className="rank-avatar-section">
              <span className="rank-emoji">{currentRank.emoji}</span>
              <div className="rank-info-text">
                <span className="rank-subtitle">Bhakti Rank</span>
                <h3>{currentRank.title}</h3>
                <span className="rank-sanskrit-name">{currentRank.sanskrit}</span>
              </div>
            </div>
            <p className="rank-description">{currentRank.desc}</p>

            {/* XP progress bar */}
            <div className="dashboard-xp-container">
              <div className="dashboard-xp-header">
                <span>Level {stats.level}</span>
                <span>{stats.xpCurrent} / {stats.xpNeeded} GB</span>
              </div>
              <div className="dashboard-xp-bar-wrap">
                <div
                  className="dashboard-xp-bar-fill"
                  style={{ width: `${xpPercent}%` }}
                ></div>
              </div>
              <span className="dashboard-xp-total">Total Gunja Berries accrued: {stats.xpTotal}</span>
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="dashboard-stats-grid">
            <div className="dash-stat-card">
              <span className="dash-stat-icon">🏺</span>
              <div className="dash-stat-values">
                <span className="dash-stat-num">{stats.streak} Days</span>
                <span className="dash-stat-label">Daily Sadhana Streak</span>
              </div>
            </div>
            <div className="dash-stat-card">
              <span className="dash-stat-icon">📖</span>
              <div className="dash-stat-values">
                <span className="dash-stat-num">{stats.quizzesTaken}</span>
                <span className="dash-stat-label">Quizzes Completed</span>
              </div>
            </div>
            <div className="dash-stat-card">
              <span className="dash-stat-icon">👑</span>
              <div className="dash-stat-values">
                <span className="dash-stat-num">{stats.perfectQuizzes}</span>
                <span className="dash-stat-label">Perfect Scores</span>
              </div>
            </div>
            <div className="dash-stat-card">
              <span className="dash-stat-icon">🎮</span>
              <div className="dash-stat-values">
                <span className="dash-stat-num">{stats.gamesPlayed}</span>
                <span className="dash-stat-label">Games Played</span>
              </div>
            </div>
          </div>

          {/* Badges / Achievements Grid */}
          <div className="dashboard-section">
            <h4 className="section-title">Devotional Achievements ({activeBadgesCount} / {BADGES.length})</h4>
            <div className="badges-grid">
              {BADGES.map((badge) => {
                const isUnlocked = stats.badges.includes(badge.id);
                return (
                  <div
                    key={badge.id}
                    className={`badge-item ${isUnlocked ? "unlocked" : "locked"} ${selectedBadge?.id === badge.id ? "selected" : ""}`}
                    onClick={() => setSelectedBadge(badge)}
                    style={{ "--badge-color": badge.color } as React.CSSProperties}
                  >
                    <span className="badge-emoji">{badge.emoji}</span>
                    <span className="badge-name">{badge.name}</span>
                    <span className="badge-status-dot"></span>
                  </div>
                );
              })}
            </div>

            {/* Badge Detail Panel */}
            {selectedBadge && (
              <div className="badge-detail-card fade-in" style={{ borderColor: selectedBadge.color }}>
                <div className="badge-detail-header">
                  <span className="badge-detail-emoji" style={{ background: `${selectedBadge.color}15`, color: selectedBadge.color }}>
                    {selectedBadge.emoji}
                  </span>
                  <div>
                    <h5>{selectedBadge.name}</h5>
                    <span className="badge-detail-sanskrit">{selectedBadge.sanskrit}</span>
                  </div>
                </div>
                <p className="badge-detail-desc">{selectedBadge.desc}</p>
                <div className="badge-detail-status">
                  {stats.badges.includes(selectedBadge.id) ? (
                    <span className="status-unlocked-text">✓ Unlocked & Active (+50 GB Claimed)</span>
                  ) : (
                    <span className="status-locked-text">🔒 Locked (Complete requirements to unlock)</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Activity Feed & Ranks Guide (Split layout) */}
          <div className="dashboard-split-panels">
            {/* Recent Activities */}
            <div className="dashboard-section activity-panel">
              <h4 className="section-title">Recent Devotional Logs</h4>
              <div className="activity-feed">
                {stats.activityLog && stats.activityLog.length > 0 ? (
                  stats.activityLog.map((log) => {
                    let logIcon = "📝";
                    if (log.type === "levelup") logIcon = "⭐";
                    if (log.type === "badge") logIcon = "🏆";
                    if (log.type === "nectar") logIcon = "🪷";

                    return (
                      <div key={log.id} className="activity-log-item">
                        <span className="activity-log-icon">{logIcon}</span>
                        <div className="activity-log-details">
                          <p className="activity-log-desc">{log.description}</p>
                          <span className="activity-log-time">
                            {new Date(log.timestamp).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit"
                            })}
                          </span>
                        </div>
                        {log.xpEarned > 0 && (
                          <span className="activity-log-xp">+{log.xpEarned} GB</span>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <p className="no-activities-text">No recent logs recorded. Begin studying to populate your logs!</p>
                )}
              </div>
            </div>

            {/* Ranks Guide */}
            <div className="dashboard-section ranks-guide-panel">
              <h4 className="section-title">Bhakti Sopāna Steps</h4>
              <div className="ranks-scroll-list">
                {BHAKTI_RANKS.map((r) => {
                  const isActive = stats.level >= r.minLevel;
                  const isCurrent = currentRank.minLevel === r.minLevel;
                  return (
                    <div
                      key={r.minLevel}
                      className={`ranks-guide-item ${isActive ? "active" : "inactive"} ${isCurrent ? "current" : ""}`}
                    >
                      <span className="ranks-guide-emoji">{r.emoji}</span>
                      <div className="ranks-guide-details">
                        <div style={{ display: "flex", justifyContent: "between", alignItems: "center", width: "100%" }}>
                          <span className="ranks-guide-title">{r.title}</span>
                          <span className="ranks-guide-level">Lvl {r.minLevel}+</span>
                        </div>
                        <span className="ranks-guide-sanskrit">{r.sanskrit}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="dashboard-footer">
          <button className="btn btn-secondary reset-btn" onClick={resetProgress}>
            Reset Progress
          </button>
          <button className="btn btn-primary" onClick={onClose}>
            Back to Study
          </button>
        </div>
      </div>
    </div>
  );
}
