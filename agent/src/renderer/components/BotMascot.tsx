// A proper full-body companion character, not just the chat-bubble head —
// hops left-to-right on a continuous loop (with a squash/stretch landing and
// a dust puff each time it lands), waves one arm on its own idle cycle, and
// has a pulsing chest core that echoes the main orb's gradient motif, so it
// reads as "the same AI" rather than a bolted-on mascot. Pure CSS/SVG
// animation, same approach as VoiceOrb/BotAvatar — no per-frame JS.
export function BotMascot() {
  return (
    <div className="bot-mascot">
      <svg viewBox="0 0 64 104" className="bot-mascot-svg">
        <defs>
          <linearGradient id="mascotCoreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: "var(--violet)" }} />
            <stop offset="50%" style={{ stopColor: "var(--magenta)" }} />
            <stop offset="100%" style={{ stopColor: "var(--coral)" }} />
          </linearGradient>
        </defs>

        {/* everything but the ground shadow/dust hops together — those stay
            on the ground line and just track the hop horizontally */}
        <g className="mascot-float">
          <line x1="32" y1="4" x2="32" y2="14" stroke="rgba(236, 233, 242, 0.85)" strokeWidth="1.6" strokeLinecap="round" />
          <circle className="mascot-antenna-tip" cx="32" cy="4" r="2.4" />

          <rect className="mascot-head" x="16" y="14" width="32" height="24" rx="10" />
          <circle className="mascot-eye" cx="25.5" cy="26" r="2.6" />
          <circle className="mascot-eye mascot-eye-r" cx="38.5" cy="26" r="2.6" />
          <path d="M25 31.5 q7 3.4 14 0" stroke="rgba(236, 233, 242, 0.7)" strokeWidth="1.4" fill="none" strokeLinecap="round" />

          <rect x="28" y="38" width="8" height="4" rx="1.5" fill="rgba(236, 233, 242, 0.5)" />

          <rect className="mascot-torso" x="14" y="42" width="36" height="34" rx="14" />
          <circle className="mascot-core" cx="32" cy="58" r="7" />

          {/* left arm — static, resting */}
          <path
            d="M15 48 q-9 6 -9 16"
            stroke="rgba(236, 233, 242, 0.75)"
            strokeWidth="4.5"
            fill="none"
            strokeLinecap="round"
          />

          {/* right arm — waves on a continuous idle loop, rotating from the shoulder */}
          <g className="mascot-arm-r-pivot">
            <path
              d="M49 48 q9 -2 11 -12"
              stroke="rgba(236, 233, 242, 0.75)"
              strokeWidth="4.5"
              fill="none"
              strokeLinecap="round"
            />
          </g>

          <path d="M23 76 q-1 8 -2 12" stroke="rgba(236, 233, 242, 0.6)" strokeWidth="4.5" fill="none" strokeLinecap="round" />
          <path d="M41 76 q1 8 2 12" stroke="rgba(236, 233, 242, 0.6)" strokeWidth="4.5" fill="none" strokeLinecap="round" />
        </g>

        <ellipse className="mascot-hover-glow" cx="32" cy="96" rx="14" ry="3" />
        <ellipse className="mascot-dust" cx="32" cy="95" rx="7" ry="2" />
      </svg>
    </div>
  );
}
