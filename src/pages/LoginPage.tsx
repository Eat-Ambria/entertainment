/**
 * Sign-in screen: phone number + password. Accounts are created by the administrator,
 * so there is no sign-up link. Signed-in users are sent straight on.
 * Own look (not the Studio's glass panels): framed concert photo on the left, a quiet dark
 * sign-in column on the right with a faint emblem watermark.
 */
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { authErrorMessage } from '@/auth/authErrors';
import { InvalidPhoneError } from '@/auth/authApi';
import { BrandMark } from '@/components/ui/BrandMark';
import { Button } from '@/components/ui/Button';
import { FormAlert } from '@/components/ui/FormAlert';
import { TextField } from '@/components/ui/TextField';
import { NotConfigured } from '@/routes/NotConfigured';
import { InstallAppButton } from '@/pwa/InstallAppButton';
import { normalizePhone } from '@/lib/phone';
import { BRAND } from '@/lib/brand';
import { asset } from '@/lib/asset';
import { Icon } from '@/components/ui/Icon';

export default function LoginPage() {
  const { status, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  // Signing in shows the chooser (Guest Studio or My Workspace); only a deep link (e.g. a saved
  // quote) is opened straight away.
  const target = from === '/studio' || from === '/admin' ? '/' : from;

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (status === 'unconfigured') return <NotConfigured />;
  if (status === 'signedIn') return <Navigate to={target} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!normalizePhone(phone)) {
      setPhoneError('Enter a valid 10-digit mobile number.');
      return;
    }
    setPhoneError(null);
    if (!password) {
      setFormError('Enter your password.');
      return;
    }
    setSubmitting(true);
    try {
      await signIn(phone, password);
      navigate(target, { replace: true });
    } catch (err) {
      if (err instanceof InvalidPhoneError) setPhoneError(err.message);
      else setFormError(authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative isolate grid min-h-dvh bg-stage-950 text-ivory lg:grid-cols-[1.15fr_1fr]">
      {/* Left: the concert photo in a gold-edged frame — a different look from the Studio inside. */}
      <aside className="relative hidden p-4 lg:block">
        <div className="relative h-full overflow-hidden rounded-[1.75rem] ring-1 ring-brand-300/25">
          <img src={asset('concert-bg.webp')} alt="" className="absolute inset-0 h-full w-full object-cover brightness-75 saturate-110" />
          <span className="absolute inset-0 bg-linear-to-t from-stage-950 via-stage-950/40 to-stage-950/10" />
          <span className="absolute inset-0 bg-linear-to-r from-stage-950/60 to-transparent" />
          <div className="relative flex h-full flex-col justify-between p-10 xl:p-14">
            <BrandMark size="lg" tone="dark" />
            <div className="max-w-xl animate-rise">
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-brand-300">Pricing &amp; quotations</p>
              <h2 className="mt-4 font-display text-5xl leading-[1.05] text-ivory xl:text-6xl">
                Every celebration,
                {/* Padding keeps the italic descenders (y, p) inside the text-clipped gradient. */}
                <span className="gold-shimmer -mb-3 block pr-3 pb-3 italic">perfectly priced.</span>
              </h2>
              <p className="mt-5 max-w-md text-base text-ivory/70">
                Build packages, present them to your guests and share clear quotations — all in one place.
              </p>
              <ul className="mt-8 flex flex-wrap gap-2 text-xs text-ivory/80">
                {['Live bands & DJs', 'Guest-ready quotations', 'PDF in one tap'].map((t) => (
                  <li key={t} className="rounded-full border border-white/15 bg-black/30 px-3 py-1.5 backdrop-blur-sm">
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </aside>

      {/* Right: a quiet, dark sign-in column (no white card). */}
      <main className="relative flex items-center justify-center overflow-hidden px-6 py-12 sm:px-12">
        <span className="pointer-events-none absolute -top-40 -right-40 h-[28rem] w-[28rem] rounded-full bg-[radial-gradient(circle,rgb(226_183_102/0.14),transparent_65%)]" />
        <img src={asset('logo-mark.webp')} alt="" aria-hidden="true" className="pointer-events-none absolute -right-24 -bottom-24 h-96 w-96 rounded-full opacity-[0.05]" />

        <div className="relative w-full max-w-sm animate-rise">
          <div className="mb-10 lg:hidden">
            <BrandMark size="lg" tone="dark" />
          </div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-brand-300">Welcome back</p>
          <h1 className="mt-3 font-display text-4xl leading-none text-ivory">Sign in</h1>
          <div className="mt-5 h-px w-16 bg-linear-to-r from-brand-300 to-transparent" />
          <p className="mt-5 text-sm text-ivory/60">Use the mobile number and password given to you.</p>

          <form onSubmit={onSubmit} noValidate className="mt-8 space-y-5">
            {formError && <FormAlert dark>{formError}</FormAlert>}
            <TextField
              tone="dark"
              label="Mobile number"
              prefix="+91"
              inputMode="numeric"
              autoComplete="tel-national"
              placeholder="98765 43210"
              maxLength={14}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              error={phoneError}
              autoFocus
            />
            <TextField
              tone="dark"
              label="Password"
              revealable
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button type="submit" variant="gold" full loading={submitting} className="btn-shine mt-2 py-3">
              {submitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <p className="mt-8 flex items-center gap-2 text-xs text-ivory/45">
            <Icon name="lock" size={14} className="shrink-0 text-brand-300/70" />
            Forgot your password? Ask your administrator to reset it.
          </p>
          <div className="mt-4">
            <InstallAppButton className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-brand-300 transition-colors duration-150 hover:bg-white/5 hover:text-brand-200" />
          </div>
          <p className="mt-12 text-xs text-ivory/30">
            {BRAND.name} {BRAND.product}
          </p>
        </div>
      </main>
    </div>
  );
}
