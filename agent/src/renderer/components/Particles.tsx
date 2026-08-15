import { useMemo } from "react";

const COLORS = ["#fb923c", "#ec4899", "#22d3ee", "#a855f7"];
const COUNT = 18;

interface ParticleSpec {
  top: string;
  left: string;
  size: string;
  color: string;
  duration: string;
  delay: string;
}

// Purely decorative — sparse twinkling dust scattered across the whole
// window, fixed in place (no drift/rise) — a still "deep space" field.
// Randomized once per mount, not re-rolled on re-render.
function randomSpecs(): ParticleSpec[] {
  return Array.from({ length: COUNT }, (_, i) => ({
    top: `${Math.random() * 100}%`,
    left: `${Math.random() * 100}%`,
    size: `${2 + Math.random() * 2}px`,
    color: COLORS[i % COLORS.length],
    duration: `${4 + Math.random() * 4}s`,
    delay: `${-Math.random() * 8}s`,
  }));
}

export function Particles() {
  const specs = useMemo(randomSpecs, []);
  return (
    <>
      {specs.map((p, i) => (
        <div
          key={i}
          className="particle"
          style={
            {
              top: p.top,
              left: p.left,
              "--s": p.size,
              "--c": p.color,
              "--d": p.duration,
              "--delay": p.delay,
            } as React.CSSProperties
          }
        />
      ))}
    </>
  );
}
