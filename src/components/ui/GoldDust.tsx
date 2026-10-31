/**
 * A few flakes of gold confetti drifting down inside a hero or showcase (the parent must be
 * `relative overflow-hidden`). Pure CSS (`.gold-flake` in index.css); positions are fixed per
 * index so they don't change on re-render. Hidden when the user prefers reduced motion.
 */
const FLAKES = Array.from({ length: 18 }, (_, i) => ({
  left: `${(i * 37 + 11) % 100}%`,
  size: 4 + ((i * 7) % 6),
  duration: `${9 + ((i * 5) % 8)}s`,
  delay: `${-((i * 13) % 14)}s`,
  drift: `${((i % 5) - 2) * 18}px`,
  ratio: i % 3 === 0 ? 1 : 0.45,
}));

export function GoldDust() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {FLAKES.map((f, i) => (
        <span
          key={i}
          className="gold-flake"
          style={
            {
              left: f.left,
              width: f.size,
              height: f.size * f.ratio,
              animationDuration: f.duration,
              animationDelay: f.delay,
              '--drift': f.drift,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
