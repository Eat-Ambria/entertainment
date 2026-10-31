/**
 * Gold embers rising slowly over the Studio landing, like sparks drifting up from the stage
 * pyros. A fixed handful (positions fixed per index), pure CSS (`.ember` in index.css),
 * hidden when the user prefers reduced motion. Decorative only.
 */
const EMBERS = Array.from({ length: 16 }, (_, i) => ({
  left: `${(i * 41 + 7) % 100}%`,
  size: 3 + ((i * 5) % 5),
  duration: `${11 + ((i * 7) % 9)}s`,
  delay: `${-((i * 11) % 17)}s`,
  sway: `${((i % 7) - 3) * 22}px`,
}));

export function Embers() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      {EMBERS.map((e, i) => (
        <span
          key={i}
          className="ember"
          style={
            {
              left: e.left,
              width: e.size,
              height: e.size,
              animationDuration: e.duration,
              animationDelay: e.delay,
              '--sway': e.sway,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
