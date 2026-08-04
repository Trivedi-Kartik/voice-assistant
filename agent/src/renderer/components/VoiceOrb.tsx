import type { MicState } from "../state/store";

const LABELS: Record<MicState, string> = {
  idle: "Press Ctrl+Shift+Space to talk",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
};

// Central animated indicator — the actual "talking to a bot" focal point, so mic
// state is felt at a glance instead of read as a line of text. Pure CSS
// (keyframe/transform based, see styles.css) — no animation library dependency.
// The halo + sheen layers keep the orb visibly alive even at idle (a single
// 5%-scale breathing core alone read as static) — every state has continuous
// motion, not just active ones.
export function VoiceOrb({ state }: { state: MicState }) {
  return (
    <div className={`voice-orb voice-orb-${state}`}>
      <div className="voice-orb-halo" />
      <div className="voice-orb-ring voice-orb-ring-1" />
      <div className="voice-orb-ring voice-orb-ring-2" />
      <div className="voice-orb-core">
        <div className="voice-orb-sheen" />
      </div>
      <div className="voice-orb-label">{LABELS[state]}</div>
    </div>
  );
}
