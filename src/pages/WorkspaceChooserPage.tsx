/**
 * Post-login landing: choose Guest Studio (client-facing, the "guest view") or My Workspace
 * (internal). Every sign-in lands here unless the user was heading to a specific page.
 * Same look as the sign-in page: the Guest Studio card carries the concert photo, the
 * Workspace card is quiet dark with a gold edge. A press shows a gold ripple, and the page
 * opens a moment later so the ripple is actually seen.
 */
import type { MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BrandMark } from '@/components/ui/BrandMark';
import { Icon, type IconName } from '@/components/ui/Icon';
import { UserMenu } from '@/components/ui/UserMenu';
import { STUDIO_ROOT } from '@/studio/steps';
import { asset } from '@/lib/asset';
import { useRipple } from '@/lib/useRipple';

interface Option {
  to: string;
  icon: IconName;
  title: string;
  body: string;
  tag: string;
  photo: boolean;
}

const OPTIONS: Option[] = [
  {
    to: STUDIO_ROOT,
    icon: 'present',
    title: 'Guest Studio',
    body: 'The guest view — present packages and build a quotation together with the guest.',
    tag: 'Guest view',
    photo: true,
  },
  {
    to: '/admin',
    icon: 'team',
    title: 'My Workspace',
    body: 'Your own elements, packages, rates, quotes and P&L — private to your login.',
    tag: 'Internal',
    photo: false,
  },
];

/** How long the ripple plays before the page changes. */
const OPEN_DELAY_MS = 320;

export default function WorkspaceChooserPage() {
  return (
    <div className="relative isolate flex min-h-dvh flex-col bg-stage-950 px-4 py-6 text-ivory sm:px-8">
      <span className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[30rem] w-[50rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(226_183_102/0.12),transparent)]" />
      <header className="flex items-center justify-between">
        <BrandMark size="lg" tone="dark" />
        <UserMenu tone="dark" />
      </header>

      <main className="flex flex-1 flex-col items-center justify-center py-10">
        <p className="animate-rise font-mono text-xs uppercase tracking-[0.3em] text-brand-300">Signed in</p>
        <h1 className="mt-3 animate-rise text-center font-display text-4xl text-ivory sm:text-5xl">Where would you like to go?</h1>
        <div className="mt-4 h-px w-16 bg-linear-to-r from-transparent via-brand-300 to-transparent" />

        <div className="stagger mt-10 grid w-full max-w-5xl grid-cols-1 gap-5 md:grid-cols-2">
          {OPTIONS.map((o) => (
            <ChoiceCard key={o.to} option={o} />
          ))}
        </div>
      </main>
    </div>
  );
}

function ChoiceCard({ option: o }: { option: Option }) {
  const ripple = useRipple();
  const navigate = useNavigate();

  function open(e: MouseEvent<HTMLAnchorElement>) {
    // Ctrl/Cmd/middle-click keep the browser's own behaviour (new tab).
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    window.setTimeout(() => void navigate(o.to), OPEN_DELAY_MS);
  }

  return (
    <Link
      to={o.to}
      onPointerDown={ripple.onPointerDown}
      onClick={open}
      className="group relative isolate flex min-h-72 flex-col overflow-hidden rounded-[1.75rem] border border-brand-300/20 bg-stage-900 p-7 transition duration-300 ease-premium [--ripple:rgb(226_183_102/0.6)] hover:-translate-y-1 hover:border-brand-300/60 hover:shadow-2xl hover:shadow-brand-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
    >
      {o.photo ? (
        <>
          <img
            src={asset('concert-bg.webp')}
            alt=""
            className="absolute inset-0 -z-10 h-full w-full object-cover brightness-75 transition-transform duration-700 ease-premium group-hover:scale-105"
          />
          <span className="absolute inset-0 -z-10 bg-linear-to-t from-stage-950 via-stage-950/55 to-stage-950/10" />
        </>
      ) : (
        <>
          <span className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_85%_0%,rgb(226_183_102/0.16),transparent_55%)]" />
          <img src={asset('logo-mark.webp')} alt="" className="absolute -right-16 -bottom-16 -z-10 h-64 w-64 rounded-full opacity-[0.06]" />
        </>
      )}
      <div className="flex items-center justify-between">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/40 text-brand-200 ring-1 ring-brand-300/40 backdrop-blur-sm">
          <Icon name={o.icon} size={22} />
        </span>
        <span className="rounded-full border border-white/15 bg-black/35 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-ivory/80 backdrop-blur-sm">
          {o.tag}
        </span>
      </div>
      <div className="mt-auto pt-10">
        <h2 className="font-display text-3xl text-ivory">{o.title}</h2>
        <p className="mt-2 max-w-sm text-sm text-ivory/70">{o.body}</p>
        <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-brand-400 px-5 py-2 text-sm font-semibold text-stage-950 shadow-lg shadow-black/30 transition-colors duration-150 group-hover:bg-brand-300">
          Open
          <Icon name="arrowRight" size={16} className="transition-transform duration-200 group-hover:translate-x-0.5" />
        </span>
      </div>
      {ripple.ripples}
    </Link>
  );
}
