"use client";

import React, { useEffect } from "react";

interface LevelUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  oldLevel: number;
  newLevel: number;
  rankTitle: string;
  newBadges: string[];
  triggerParticles: () => void;
  soundEnabled: boolean;
}

export default function LevelUpModal({
  isOpen,
  onClose,
  oldLevel,
  newLevel,
  rankTitle,
  newBadges,
  triggerParticles,
  soundEnabled
}: LevelUpModalProps) {
  
  // Play celebration flute melody and trigger particles when opened
  useEffect(() => {
    if (!isOpen) return;

    // Trigger flower rain
    triggerParticles();

    // Play flute arpeggio if enabled
    if (soundEnabled && typeof window !== "undefined") {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContextClass();
        
        const playNote = (freq: number, delay: number, duration: number, volume = 0.15) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          
          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
          
          // Flute vibrato (LFO)
          const lfo = ctx.createOscillator();
          const lfoGain = ctx.createGain();
          lfo.frequency.value = 6.5; // Hz
          lfoGain.gain.value = 3.5;
          lfo.connect(lfoGain);
          lfoGain.connect(osc.frequency);
          
          // Soft envelope
          gain.gain.setValueAtTime(0, ctx.currentTime + delay);
          gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + delay + 0.1);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration - 0.05);
          
          osc.connect(gain);
          gain.connect(ctx.destination);
          
          lfo.start(ctx.currentTime + delay);
          osc.start(ctx.currentTime + delay);
          osc.stop(ctx.currentTime + delay + duration);
        };

        // Yaman/Bhupali Raga arpeggio (sweet, meditative rising major pentatonic)
        playNote(293.66, 0.0, 0.9, 0.12);    // D4
        playNote(329.63, 0.18, 0.9, 0.12);   // E4
        playNote(369.99, 0.36, 0.9, 0.12);   // F#4
        playNote(440.00, 0.54, 1.1, 0.15);   // A4
        playNote(587.33, 0.76, 1.5, 0.18);   // D5 (high tonic)
        playNote(739.99, 1.1, 2.0, 0.12);    // F#5 (high resonant third)
      } catch (err) {
        console.error("Failed to play level-up arpeggio:", err);
      }
    }
  }, [isOpen, soundEnabled, triggerParticles]);

  if (!isOpen) return null;

  return (
    <div className="levelup-overlay" onClick={onClose}>
      <div className="levelup-card divine-aura scale-up-center" onClick={(e) => e.stopPropagation()}>
        <div className="levelup-glow"></div>
        
        <div className="levelup-header">
          <span className="levelup-om-icon">🪷</span>
          <h2 className="levelup-title">Sādhu Sādhu!</h2>
          <span className="levelup-devanagari">साधु साधु</span>
          <p className="levelup-subtitle">Well Done! Level Ascended</p>
        </div>

        <div className="levelup-body">
          <div className="level-badge-display">
            <span className="level-old">{oldLevel}</span>
            <span className="level-arrow">⟶</span>
            <span className="level-new">{newLevel}</span>
          </div>

          <div className="levelup-rank-info">
            <span className="ranks-guide-label">New Spiritual Rank Unlocked</span>
            <h4 className="levelup-rank-title">{rankTitle}</h4>
          </div>

          {newBadges && newBadges.length > 0 && (
            <div className="levelup-badges-unlocked">
              <span className="ranks-guide-label">Achievements Unlocked!</span>
              <div className="levelup-badges-list">
                {newBadges.map((badgeId) => (
                  <span key={badgeId} className="levelup-badge-tag">
                    🏆 {badgeId.replace("_", " ").toUpperCase()} (+50 GB)
                  </span>
                ))}
              </div>
            </div>
          )}

          <p className="levelup-quote">
            "By steady application of study and reflection, the darkness of ignorance is dispelled, and the mirror of the heart shines with pure devotion."
          </p>
        </div>

        <div className="levelup-actions">
          <button className="btn btn-primary" onClick={onClose}>
            Continue Sadhana
          </button>
        </div>
      </div>
    </div>
  );
}
