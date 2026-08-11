import type { MicState } from "../state/store";

// Color still encodes state — idle stays a calm, muted violet; listening
// leans magenta/coral (urgent); thinking stays violet/purple (processing);
// speaking leans coral/amber (output) — all within the approved
// signal-gradient family, replacing the old idle=blue/listening=red/
// thinking=purple/speaking=teal palette. Motion intensity is now a single
// "active" tier (see .orb-wrap.active in styles.css) instead of 4 distinct
// speed profiles — color already carries the distinction that mattered.
const STATE_COLORS: Record<MicState, [string, string, string]> = {
  idle: ["#6d63c9", "#8b5cf6", "#8b7cf0"],
  listening: ["#ec4899", "#f43f5e", "#fb923c"],
  thinking: ["#8b5cf6", "#a855f7", "#ec4899"],
  speaking: ["#fb923c", "#f59e0b", "#ec4899"],
};

// Pure CSS/SVG — glow, dashed ring, radar sweep, three independently
// orbiting satellites, and a gradient core with a faint pulsing "neural"
// constellation. Replaces the old <canvas> + requestAnimationFrame
// particle-ring implementation entirely: the whole motif is rotation/
// opacity/scale keyframes, no per-frame JS math needed.
export function VoiceOrb({ state, size = 220 }: { state: MicState; size?: number }) {
  const [c1, c2, c3] = STATE_COLORS[state];
  const style = { "--orb-size": `${size}px`, "--c1": c1, "--c2": c2, "--c3": c3 } as React.CSSProperties;
  return (
    <div className={`orb-wrap${state !== "idle" ? " active" : ""}`} style={style}>
      <div className="orb-glow" />
      <div className="orb-ring" />
      <div className="orb-sweep" />
      <div className="orb-sat s1">
        <i />
      </div>
      <div className="orb-sat s2">
        <i />
      </div>
      <div className="orb-sat s3">
        <i />
      </div>
      <div className="orb-core">
        <svg viewBox="0 0 24 24">
          <line x1="6" y1="7" x2="12" y2="14" />
          <line x1="18" y1="9" x2="12" y2="14" />
          <line x1="12" y1="14" x2="9" y2="19" />
          <circle cx="6" cy="7" r={1.6} />
          <circle cx="18" cy="9" r={1.6} />
          <circle cx="9" cy="19" r={1.6} />
        </svg>
      </div>
    </div>
  );
}
