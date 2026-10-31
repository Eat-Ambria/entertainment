/**
 * Concert lighting behind guest-facing screens: four spotlight cones from the rig (gold, amber,
 * rose-gold, gold) that sway slowly like a live show, over a warm glow rising from the stage.
 * CSS only (see `.stage-beam` in index.css) — transform/opacity animation, no blur; reduced
 * motion keeps them still. Decorative only.
 */
const BEAMS = ['gold-a', 'amber', 'rose', 'gold-b'] as const;

export function StageLights() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      {BEAMS.map((b) => (
        <span key={b} className={`stage-beam stage-beam-${b}`} />
      ))}
      <span className="stage-glow" />
    </div>
  );
}
