---
name: entertainment-presentation-ui
description: Design rules for the Ambria Entertainment pricing & quotation app (React 19 + Tailwind v4). Use for ANY UI/UX, layout, styling, motion or component change — especially the client-facing Guest Studio (package catalogue, element selection, charges, quotation) and the My Workspace admin screens. Gives the visual identity (charcoal + champagne gold), spacing system, component patterns, motion tokens, the save celebration and the checks to run.
---

# Entertainment Presentation UI

The app is shown to guests in live meetings by the entertainment team. It must feel like a
premium **luxury event-production** product — editorial, cinematic, calm, precise — never a
generic SaaS dashboard. Every rule below serves two goals: **the guest is impressed**, and **the
team can build and verify a quote fast**. Elegant in daily use, cinematic when showcasing,
genuinely satisfying when a quotation is saved.

## 1. Surfaces

| Surface | Where | Look |
|---|---|---|
| **Stage** (immersive) | Guest Studio `src/studio/**` | Warm near-black (concert stage) (`.stage-bg`, `bg-stage-950`), slowly swaying concert spotlight cones (`StageLights`), warm ivory text, white "paper" panels for dense work (forms, element tables, price summary, quotation) |
| **Workspace** (efficient) | My Workspace `src/admin/**` | Stage-dark sidebar (active item `bg-brand-500/20` + gold edge), light `slate-50` content with white cards so data stays easy to read |
| **Entry** | Login, change password, workspace chooser | Stage + `StageLights`, white form card or glass choice cards |

## 2. Tokens (`src/index.css` `@theme` — never ad-hoc hex values)
- **Brand accent = warm gold, `brand-50…950`** (400 = #e2b766, the reference's gold). (The app used `indigo-*`; all of it is now
  `brand-*` — never reintroduce indigo/violet.) On white: `brand-600+` for text/buttons (AA).
  On the stage: `brand-300/400` for text, highlights, rings; gold fills (`bg-brand-400`) carry
  **dark** text (`text-stage-950`), never white.
- Stage: `stage-950/900/800/700`. Ivory text: `text-ivory`, `text-ivory/70` body, `/50` meta.
  Glass on stage: `border-white/10`, `bg-white/4`, hover `bg-white/7`. Gold hairline: `.gold-hairline`.
- Fonts: `font-sans` (Inter) everywhere; `font-display` (Fraunces) only for guest-facing
  headings — Studio titles, hero, package names, entry pages, the save celebration.
- Text on paper: `slate-900` titles, `slate-600` body, `slate-500/400` meta.
- Money/quantities: always `num`; prices are the strongest number in a card.
- **`StudioLayout` sets `text-ivory`, so every white panel in the Studio must set its own text
  colour (`text-slate-900`).**

## 3. Layout & spacing (high priority)
- 4-px steps; **2–6** inside components, **6–8** between sections. Studio container is full width (no max-width — the user zooms out and wants the layout to stay the same) with gutter `px-[clamp(1rem,2.2vw,4rem)]` — use wide screens, no big empty side margins; side panels grow on `xl`, package grid gets a 4th column on `2xl`.
- Compact headers: title + one hint line, aligned with actions. No hero that pushes content
  below the fold. No giant cards, no oversized headings, no decorative empty containers.
- **No nested cards** — use a divider or a tinted sub-area instead.
- Size by content. Grids: package cards `sm:grid-cols-2 xl:grid-cols-3`; filters
  `grid sm:grid-cols-3 lg:grid-cols-5` with labels on top.
- Keep primary actions visible: floating `StepActions` bar / sticky Customise **Price summary**.
- Tables: name column `minmax(11rem,1fr)` so columns never overlap; numbers right-aligned.
- Phones: stack, don't shrink; never truncate prices.

## 4. Component patterns
- **Editorial type on the stage:** gold mono eyebrow (`font-mono text-xs uppercase
  tracking-[0.2em] text-brand-300` — date, venue, "Step 02 / 04", quote no.) above an uppercase
  `font-display` headline (`font-normal uppercase leading-none`). Figures (counts, countdown) in
  `font-display` with a small ivory label underneath.
- **Pill actions on the stage:** `Button variant="gold"` (primary) and `variant="outline-light"`
  (secondary). Header "New quote" = ivory pill. Floating action bars on the stage use
  `StepActions tone="stage"` (dark glass); inside white panels `tone="paper"`.
- **Logo (`BrandMark`):** uploaded logo in a round gold ring, else the Ambria emblem
  `public/logo-mark.webp` (cut from the user's banner `public/logo new.png`) as a round mark; name in
  `font-display` (on dark: `.brand-glow` gold→ivory gradient with glow), subtitle mono uppercase gold.
  Studio header (h-18): `.header-spot` spotlights from **both sides of the logo + name** sweeping over the
  text (4.5 s, not across the rest of the header) + gold hairline at the bottom.
  Icons come from `public/app-icon.png` (same emblem); regenerate with `npm run pwa:icons`.
- **Landing (`StudioHomePage`) — matches the user's reference exactly:** mono eyebrow (date ·
  business); three-line serif headline "Extraordinary / *Entertainment.* (gold italic) / Unforgettable
  Celebrations" + short gold rule; copy line; gold pill "Start a quotation";
  all on the **left** (max-w-3xl) over a **full-bleed, bright concert photo** (user's reference: DJ
  stage, blue/amber beams, crowd) — `BackdropPhoto` at 100 % on the landing with only a dark wash on
  the left and a little at the bottom; on the **right** `FeaturedReel` (wide gold-framed 7:5 card, 30–40rem column, covers the performer in the photo;
  performer photos from Settings wipe-in + zoom every 5 s, pointer 3D tilt + glare, gold light travelling round the frame, light sweep, "01 / 05" counter, progress bar, hover pauses, gold-ring arrows, dots inside at the bottom; mic placeholder without photos);
  no promises band, no packages, no `StageLights`
  on the landing. Photo = Settings background photo, else `public/concert-bg.webp` (from the user's
  `public/background1.png`); the background itself does not cycle.
  Landing motion: headline lines rise from a mask (stagger 0.14 s), "Entertainment." `.gold-shimmer`,
  eyebrow letter-spacing settles, gold rule draws in, CTA `.btn-shine` + `.cta-pulse` + arrow nudge,
  `Embers` rising (CSS `.ember`), **Backdrop photo shown as it is: no zoom, no pointer parallax** (user rejected both); vivid
  (`brightness-80 contrast-105 saturate-110` — user found 105 too bright), left wash /85→/50→/15 by 60 %, bottom /60 —
  match `public/demo.png` (the user's target screenshot).
  Steps: same photo at 14 % + `StageLights`. **Entertainment (concert), not décor.** Keep big images out of `public/` precache; ship WebP.
- **Guest & Event:** form on white paper + `LiveEventCard` beside it (name, function, date,
  venue, session, `EventCountdown`, gold progress "n of 6 details").
- **Quotation:** `QuotationHero` above the document (eyebrow, guest name, event line,
  countdown, gold total) on both the Quotation step and the saved quote page.
- `GoldDust` (≤ 18 CSS flakes, only inside a hero card) and `EventCountdown`
  (1 s tick, cleans up) are the only ambient effects — don't add more.
- **Package card:** 4:3 image with bottom gradient + hover zoom 1.04, name over the image in
  `font-display`, tier chip, 2-line description. Selected: `ring-2 ring-brand-400`, gold ✓ badge
  pops in. Packages for the guest's function: gold **Recommended** ribbon + faint gold border.
- **Customise step (dark, like Guest/Package):** element tables, Additional charges and the Price summary are dark stage panels (`border-brand-300/25 bg-stage-900/80`), summary 22/26rem wide to line up with the guest card; gold Continue, gold final total.
- **Element rows:** included rows tinted `bg-brand-400/8` with a gold left edge; excluded faded,
  amount struck through. Remarks are guest-facing.
- **Buttons** (`components/ui/Button`): primary `bg-brand-600` (white text), secondary white,
  ghost. All have colour/shadow transitions (150 ms) and press feedback (`active:scale-[0.98]`);
  `loading` disables and shows a spinner (prevents double submits).
- Dropdowns (`UserMenu`): `animate-pop` from the trigger corner. Modals: overlay fade + panel spring.
- Quotation: white paper on the stage with a deep shadow; keep it in step with the PDF
  (`exportQuote.ts`, accent `#946f30` = brand-600).
- Empty/error states: `EmptyState` / `FormAlert`; destructive actions use `ConfirmDialog`.

## 5. Motion system
- Tokens in `src/lib/motion.ts` (mirrored in CSS): `EASE` = `ease-premium`
  (`cubic-bezier(.2,.8,.2,1)`), `quick` **160 ms** (hover/press/small states), `smooth`
  **240 ms** (reveals, step changes), `modal` **260 ms**, `spring` (no visible bounce), variants
  `listStagger` + `riseItem`, `stepSlide` (`custom` = ±1). CSS: `animate-rise` 240 ms,
  `animate-fade` 180 ms, `animate-pop` 200 ms. Don't invent new curves or durations.
- **Motion for React** (`motion` 14.2.0, pinned) for enter/leave/lift/position; `m` +
  `AnimatePresence` from `motion/react` (never `motion.*`; `LazyMotion strict`), inside
  `components/ui/MotionProvider` (both layouts). CSS transitions for hover/colour/selection.
  One animation library only.
- Used for: direction-aware step slide, home + card stagger, card lift/press, ✓ badge pop,
  rows/charges sliding in when added (no exit — removals are instant), stepper line fill,
  modal spring, Workspace page fade, quotation rise. Entrance animations must not replay on
  ordinary re-renders (key only on real changes).
- Totals **settle**: the number is re-keyed so the new exact value slides in — never tween digits.
- Stage lighting is **static** (no continuous animation, no heavy blur).
- Never: bounce, spinning decorations, pulsing, random particles, parallax, counting numbers.
- Reduced motion: `MotionConfig reducedMotion="user"` + the global CSS rule.

## 6. The save celebration (signature moment)
- `components/ui/SaveCelebration`: champagne-gold confetti burst from the centre card + two soft
  fountains from the lower corners (canvas, ~1.9 s), a check mark drawing itself in a glowing
  gold ring, "**Quotation Saved Successfully**" + "ENT-… · created/updated". Card ~2.2 s,
  `pointer-events-none`, cleans up its frame + listeners. Reduced motion → card only.
- Trigger **only** in `QuoteStep.onSave` after `save.mutateAsync` resolves (server confirmed).
  Never on failure (errors → error toast / locked banner), never on re-renders or background
  updates; one celebration at a time (re-keyed per save). `onSave` returns early while a save is
  pending. Don't use it for routine actions.

## 7. Hard constraints
- Don't change prices, quantities, calculations, totals, APIs, schemas, routes or permissions.
- The Studio must never show cost, multiplier, vendor or margin data.
- Keep accessible names used by tests; keep visible focus (`:focus-visible` uses brand-500) and
  keyboard/touch support. Studio code must not import from `src/admin`.
- Reuse components; no Redux; new dependencies only with a clear need, pinned to exact versions
  at least two weeks old.

## 8. Checks after any UI change
`npm run typecheck` · `npx eslint .` · `npx vitest run` · `npm run build`. Tests run with
`MotionGlobalConfig.skipAnimations`, a null canvas context and toasts cleared between tests
(`src/test/setup.ts`). When a test matched old markup, update it to the new accessible structure.
