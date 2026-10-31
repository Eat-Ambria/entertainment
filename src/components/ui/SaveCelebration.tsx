/**
 * "Quotation Saved Successfully" — a short stage moment (~3 s):
 *  - the page dims and two spotlights swing in onto the success card;
 *  - gold fireworks rise from the bottom and burst into glowing sparks, while champagne confetti
 *    bursts from the card and drifts in from the lower corners (one canvas, one animation frame);
 *  - two gold shock-rings spread from the card, a light sweep crosses it, and a check mark draws
 *    itself inside a glowing ring.
 * Never blocks clicks or keyboard focus, cleans up its frame and listeners. Reduced motion: no
 * canvas, rings, lights or sweep — the card just appears. Show it only after a save the server
 * confirmed (see QuoteStep).
 */
import { useEffect, useRef } from 'react';
import { m, useReducedMotion } from 'motion/react';
import { EASE, spring } from '@/lib/motion';

const GOLDS = ['#f9edd0', '#f3dba6', '#ecc87f', '#e2b766', '#cf9f4c', '#fff8e6'];
const SPARKS = ['#fff3d1', '#ffe2a0', '#f5c96b', '#ffd98a', '#ffffff'];
const CARD_MS = 3000;
const GRAVITY = 0.0009; // px / ms², scaled by DPR

interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  flip: number;
  vf: number;
  w: number;
  h: number;
  kind: 'strip' | 'dot' | 'spark';
  color: string;
  life: number;
  ttl: number;
}

interface Shell {
  x: number;
  y: number;
  vy: number;
  burstY: number;
  at: number;
  launched: boolean;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)]!;

export function SaveCelebration({ title, detail, onDone }: { title: string; detail?: string; onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduce = useReducedMotion();
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  // The card decides the length; the canvas finishes on its own.
  useEffect(() => {
    const t = window.setTimeout(() => done.current(), CARD_MS);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = !reduce && canvas ? canvas.getContext('2d') : null;
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
    };
    size();
    window.addEventListener('resize', size);

    const pieces: Piece[] = [];
    const confetti = (x: number, y: number, angle: number, spread: number, speed: [number, number], count: number) => {
      for (let i = 0; i < count; i++) {
        const a = angle + rand(-spread, spread);
        const sp = rand(speed[0], speed[1]) * dpr;
        const dot = Math.random() < 0.3;
        pieces.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          rot: rand(0, Math.PI * 2),
          vr: rand(-0.012, 0.012),
          flip: rand(0, Math.PI * 2),
          vf: rand(0.008, 0.02),
          w: (dot ? rand(2, 3.2) : rand(4, 7)) * dpr,
          h: (dot ? 0 : rand(2, 3.5)) * dpr,
          kind: dot ? 'dot' : 'strip',
          color: pick(GOLDS),
          life: 0,
          ttl: rand(1400, 2100),
        });
      }
    };
    const burst = (x: number, y: number) => {
      const n = 64;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rand(-0.05, 0.05);
        const sp = rand(0.16, 0.42) * dpr;
        pieces.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          rot: 0,
          vr: 0,
          flip: 0,
          vf: 0,
          w: rand(1.4, 2.4) * dpr,
          h: 0,
          kind: 'spark',
          color: pick(SPARKS),
          life: 0,
          ttl: rand(900, 1400),
        });
      }
    };

    const W = canvas.width;
    const H = canvas.height;
    // Three fireworks: left, right, then centre-high.
    const shells: Shell[] = [
      { x: W * 0.22, y: H, vy: 0, burstY: H * 0.3, at: 120, launched: false },
      { x: W * 0.78, y: H, vy: 0, burstY: H * 0.26, at: 420, launched: false },
      { x: W * 0.5, y: H, vy: 0, burstY: H * 0.16, at: 760, launched: false },
    ];

    // Main confetti burst around the success card (a little upward bias).
    confetti(W / 2, H / 2, -Math.PI / 2, Math.PI, [0.25, 0.75], 100);
    let sides = false;

    const start = performance.now();
    let last = start;
    let raf = 0;
    const g = GRAVITY * dpr;

    const frame = (now: number) => {
      const dt = Math.min(now - last, 40);
      last = now;
      const t = now - start;
      if (!sides && t > 160) {
        sides = true;
        confetti(0, H, -Math.PI / 3.2, 0.28, [0.7, 1.05], 22);
        confetti(W, H, (-Math.PI * 2.2) / 3.2, 0.28, [0.7, 1.05], 22);
      }

      ctx.clearRect(0, 0, W, H);

      // Rising shells with a short glowing trail.
      ctx.globalCompositeOperation = 'lighter';
      for (let i = shells.length - 1; i >= 0; i--) {
        const s = shells[i]!;
        if (t < s.at) continue;
        if (!s.launched) {
          s.launched = true;
          s.vy = -1.25 * dpr;
        }
        s.y += s.vy * dt;
        s.vy += g * 0.6 * dt;
        ctx.fillStyle = 'rgba(255, 226, 160, 0.9)';
        ctx.beginPath();
        ctx.arc(s.x, s.y, 2.2 * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(226, 183, 102, 0.25)';
        ctx.fillRect(s.x - 1 * dpr, s.y, 2 * dpr, 34 * dpr);
        if (s.y <= s.burstY || s.vy >= 0) {
          burst(s.x, s.y);
          shells.splice(i, 1);
        }
      }

      for (let i = pieces.length - 1; i >= 0; i--) {
        const p = pieces[i]!;
        p.life += dt;
        if (p.life >= p.ttl) {
          pieces.splice(i, 1);
          continue;
        }
        const spark = p.kind === 'spark';
        const drag = spark ? 0.975 : 0.986;
        p.vx *= drag;
        p.vy = p.vy * drag + g * (spark ? 0.35 : 1) * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const fade = p.life > p.ttl * 0.6 ? 1 - (p.life - p.ttl * 0.6) / (p.ttl * 0.4) : 1;
        ctx.globalAlpha = Math.max(fade, 0);
        ctx.fillStyle = p.color;
        if (spark) {
          // Additive glow: a soft halo plus a bright core.
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = Math.max(fade, 0) * 0.25;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.w * 2.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = Math.max(fade, 0);
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.w, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.globalCompositeOperation = 'source-over';
          p.rot += p.vr * dt;
          p.flip += p.vf * dt;
          if (p.kind === 'dot') {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.w / 2, 0, Math.PI * 2);
            ctx.fill();
          } else {
            // A paper strip turning in the light: rotate, then squash on one axis to "flip".
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.scale(1, Math.cos(p.flip));
            ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            ctx.restore();
          }
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      if (pieces.length > 0 || shells.length > 0 || !sides) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', size);
    };
  }, [reduce]);

  const total = CARD_MS / 1000;

  return (
    <div className="pointer-events-none fixed inset-0 z-70 overflow-hidden" aria-hidden="true">
      {/* The house lights go down… */}
      <m.div
        className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgb(20_17_13/0.35),rgb(10_8_6/0.75))]"
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{ duration: total, times: [0, 0.1, 0.82, 1], ease: EASE }}
      />
      {/* …and two spotlights swing onto the card. */}
      {!reduce &&
        ([-1, 1] as const).map((side) => (
          <m.span
            key={side}
            className="absolute top-[-20vh] left-1/2 h-[95vh] w-[42vw] origin-top bg-[linear-gradient(to_bottom,rgb(255_236_190/0.28),rgb(226_183_102/0.08)_60%,transparent)] [clip-path:polygon(45%_0,55%_0,100%_100%,0_100%)]"
            style={{ x: '-50%' }}
            initial={{ rotate: side * 38, opacity: 0 }}
            animate={{ rotate: side * 14, opacity: [0, 1, 1, 0] }}
            transition={{ duration: total, times: [0, 0.18, 0.8, 1], ease: EASE }}
          />
        ))}

      {!reduce && <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />}

      <div className="absolute inset-0 flex items-center justify-center px-4">
        {/* Gold shock-rings spreading from the card. */}
        {!reduce &&
          [0.15, 0.45].map((delay) => (
            <m.span
              key={delay}
              className="absolute h-56 w-56 rounded-full border-2 border-brand-300/70"
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 3.2, opacity: [0, 0.8, 0] }}
              transition={{ duration: 1.3, delay, ease: 'easeOut' }}
            />
          ))}

        <m.div
          initial={{ opacity: 0, scale: reduce ? 1 : 0.86, y: reduce ? 0 : 14 }}
          animate={{ opacity: [0, 1, 1, 0], scale: reduce ? 1 : [0.86, 1.03, 1, 1, 0.97], y: reduce ? 0 : [14, 0, 0, -8] }}
          transition={{
            duration: total,
            ease: EASE,
            opacity: { duration: total, times: [0, 0.1, 0.86, 1] },
            scale: { duration: total, times: [0, 0.12, 0.2, 0.86, 1] },
            y: { duration: total, times: [0, 0.12, 0.86, 1] },
          }}
          className="relative overflow-hidden rounded-3xl border border-brand-300/40 bg-stage-950/90 px-10 py-8 text-center shadow-[0_0_80px_rgb(226_183_102/0.25)] backdrop-blur-md sm:px-14"
        >
          <span className="gold-hairline absolute inset-x-6 top-0" />
          <span className="gold-hairline absolute inset-x-6 bottom-0" />
          {/* Light sweep across the card. */}
          {!reduce && (
            <m.span
              className="absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-linear-to-r from-transparent via-white/15 to-transparent"
              initial={{ x: '0%' }}
              animate={{ x: '400%' }}
              transition={{ duration: 1.1, delay: 0.55, ease: EASE }}
            />
          )}
          {/* Check mark drawing itself inside a glowing gold ring. */}
          <m.span
            initial={{ scale: reduce ? 1 : 0.5, rotate: reduce ? 0 : -25 }}
            animate={{ scale: 1, rotate: 0, transition: spring }}
            className="relative mx-auto flex h-20 w-20 items-center justify-center"
          >
            <span className="absolute inset-0 rounded-full bg-brand-400/20 shadow-[0_0_40px_rgb(226_183_102/0.6)]" />
            <svg viewBox="0 0 52 52" className="relative h-20 w-20" fill="none">
              <m.circle
                cx="26"
                cy="26"
                r="23"
                stroke="var(--color-brand-300)"
                strokeWidth="2"
                initial={{ pathLength: reduce ? 1 : 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.5, ease: EASE }}
              />
              <m.path
                d="M15 27l7.5 7.5L37.5 19"
                stroke="var(--color-brand-200)"
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: reduce ? 1 : 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.38, delay: 0.4, ease: EASE }}
              />
            </svg>
          </m.span>
          <m.p
            initial={{ opacity: 0, y: reduce ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: reduce ? 0 : 0.3, ease: EASE }}
            className="gold-shimmer mt-4 font-display text-3xl font-semibold sm:text-4xl"
          >
            {title}
          </m.p>
          {detail && (
            <m.p
              initial={{ opacity: 0, letterSpacing: reduce ? '0.2em' : '0.5em' }}
              animate={{ opacity: 1, letterSpacing: '0.2em' }}
              transition={{ duration: 0.6, delay: reduce ? 0 : 0.5, ease: EASE }}
              className="mt-2 font-mono text-xs uppercase text-brand-300"
            >
              {detail}
            </m.p>
          )}
        </m.div>
      </div>
    </div>
  );
}
