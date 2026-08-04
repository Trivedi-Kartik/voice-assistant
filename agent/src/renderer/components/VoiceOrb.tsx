import { useEffect, useRef } from "react";
import type { MicState } from "../state/store";

const LABELS: Record<MicState, string> = {
  idle: "Press Ctrl+Shift+Space to talk",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
};

interface OrbStateConfig {
  color: [number, number, number]; // rgb
  particleCount: number;
  speed: number; // radians/sec of ring rotation
  amplitude: number; // px of radial wobble per particle
  coreRadius: number;
}

// Tuned so idle still has visible, continuous motion — a flat CSS gradient with
// only a 5% scale breathe read as static in practice (real user feedback). Canvas
// chosen over a 3D/WebGL library (e.g. three.js): this is fundamentally a 2D
// indicator, and a full 3D engine would add a real dependency + WebGL context for
// no visual benefit here — a particle ring gets most of the "alive" quality a
// shader-based orb would, at a fraction of the complexity.
const STATE_CONFIG: Record<MicState, OrbStateConfig> = {
  idle: { color: [90, 134, 217], particleCount: 48, speed: 0.15, amplitude: 6, coreRadius: 46 },
  listening: { color: [230, 74, 41], particleCount: 64, speed: 0.6, amplitude: 16, coreRadius: 50 },
  thinking: { color: [142, 95, 214], particleCount: 56, speed: 1.1, amplitude: 10, coreRadius: 48 },
  speaking: { color: [0, 191, 165], particleCount: 64, speed: 0.9, amplitude: 14, coreRadius: 50 },
};

const SIZE = 220; // CSS px — canvas backing store is scaled by devicePixelRatio

export function VoiceOrb({ state }: { state: MicState }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Read via ref inside the animation loop rather than restarting the loop on
  // every state change — keeps the motion continuous/smooth across transitions
  // instead of resetting phase and flashing on every state change.
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    ctx.scale(dpr, dpr);

    let raf = 0;
    const start = performance.now();

    function draw(now: number): void {
      const t = (now - start) / 1000;
      const cfg = STATE_CONFIG[stateRef.current];
      const [r, g, b] = cfg.color;
      const cx = SIZE / 2;
      const cy = SIZE / 2;

      ctx!.clearRect(0, 0, SIZE, SIZE);

      // Soft ambient glow filling the whole canvas
      const glow = ctx!.createRadialGradient(cx, cy, 0, cx, cy, SIZE / 2);
      glow.addColorStop(0, `rgba(${r},${g},${b},0.35)`);
      glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx!.fillStyle = glow;
      ctx!.fillRect(0, 0, SIZE, SIZE);

      // Particle ring: each particle wobbles radially on its own phase while
      // the whole ring slowly rotates — speed/amplitude/count vary by state.
      const baseRadius = cfg.coreRadius + 30;
      for (let i = 0; i < cfg.particleCount; i++) {
        const angle = (i / cfg.particleCount) * Math.PI * 2 + t * cfg.speed;
        const wobble = Math.sin(t * cfg.speed * 3 + i) * cfg.amplitude;
        const radius = baseRadius + wobble;
        const px = cx + Math.cos(angle) * radius;
        const py = cy + Math.sin(angle) * radius;
        const size = 1.5 + Math.sin(t * 2 + i) * 1.2;
        const alpha = 0.35 + 0.35 * Math.sin(t * 2 + i * 0.7);

        ctx!.beginPath();
        ctx!.arc(px, py, Math.max(size, 0.5), 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(${r},${g},${b},${Math.max(alpha, 0)})`;
        ctx!.fill();
      }

      // Solid glowing core on top
      const core = ctx!.createRadialGradient(cx - 15, cy - 18, 5, cx, cy, cfg.coreRadius);
      core.addColorStop(0, `rgba(${Math.min(r + 60, 255)},${Math.min(g + 60, 255)},${Math.min(b + 60, 255)},0.95)`);
      core.addColorStop(1, `rgba(${r},${g},${b},0.85)`);
      ctx!.beginPath();
      ctx!.arc(cx, cy, cfg.coreRadius, 0, Math.PI * 2);
      ctx!.fillStyle = core;
      ctx!.fill();

      raf = requestAnimationFrame(draw);
    }

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="voice-orb-canvas-wrap">
      <canvas ref={canvasRef} width={SIZE} height={SIZE} style={{ width: SIZE, height: SIZE }} />
      <div className="voice-orb-label">{LABELS[state]}</div>
    </div>
  );
}
