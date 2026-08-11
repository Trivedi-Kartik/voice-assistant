import { useMemo } from "react";

const COLORS = ["#8b5cf6", "#ec4899", "#fb923c"];
const COUNT = 14;

interface ParticleSpec {
  left: string;
  size: string;
  color: string;
  duration: string;
  delay: string;
  drift: string;
}

// Purely decorative — drifting ambient sparks behind the aurora backdrop.
// Randomized once per mount, not re-rolled on re-render.
function randomSpecs(): ParticleSpec[] {
  return Array.from({ length: COUNT }, (_, i) => ({
    left: `${Math.random() * 100}%`,
    size: `${2 + Math.random() * 3}px`,
    color: COLORS[i % COLORS.length],
    duration: `${11 + Math.random() * 12}s`,
    delay: `${-Math.random() * 20}s`,
    drift: `${Math.random() * 60 - 30}px`,
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
              left: p.left,
              "--s": p.size,
              "--c": p.color,
              "--d": p.duration,
              "--delay": p.delay,
              "--drift": p.drift,
            } as React.CSSProperties
          }
        />
      ))}
    </>
  );
}
