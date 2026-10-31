/**
 * Change password. Forced on first login (default password); also reachable from Settings.
 * No password rules beyond Supabase's own 6-character minimum (owner's choice).
 */
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { authErrorMessage } from '@/auth/authErrors';
import { BrandMark } from '@/components/ui/BrandMark';
import { Button } from '@/components/ui/Button';
import { FormAlert } from '@/components/ui/FormAlert';
import { StageLights } from '@/components/ui/StageLights';
import { TextField } from '@/components/ui/TextField';

export default function ChangePasswordPage() {
  const { profile, changePassword, signOut } = useAuth();
  const navigate = useNavigate();
  const forced = profile?.must_change_password ?? false;

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!current || !next) {
      setError('Fill in all fields.');
      return;
    }
    if (next !== confirm) {
      setError('New passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      await changePassword(current, next);
      setDone(true);
      setCurrent('');
      setNext('');
      setConfirm('');
      if (forced) navigate('/', { replace: true });
    } catch (err) {
      const code = (err as { code?: string } | null)?.code;
      setError(code === 'invalid_credentials' ? 'Current password is incorrect.' : authErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="stage-bg relative isolate flex min-h-dvh items-center justify-center px-4 py-12">
      <StageLights />
      <div className="relative w-full max-w-md animate-rise">
        <div className="mb-8 flex justify-center">
          <BrandMark size="lg" tone="dark" />
        </div>
        <div className="rounded-2xl bg-white p-6 text-slate-900 shadow-2xl shadow-black/40 sm:p-8">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            {forced ? 'Set your own password' : 'Change password'}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {forced
              ? 'You signed in with the default password. Choose a new one to continue.'
              : 'Enter your current password, then the new one.'}
          </p>

          <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4">
            {error && <FormAlert>{error}</FormAlert>}
            {done && !forced && <FormAlert tone="success">Password changed.</FormAlert>}
            <TextField
              label="Current password"
              revealable
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
            <TextField
              label="New password"
              revealable
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
            <TextField
              label="Confirm new password"
              revealable
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            <Button type="submit" full loading={submitting}>
              {submitting ? 'Saving…' : 'Save password'}
            </Button>
          </form>
        </div>
        <div className="mt-6 text-center text-sm">
          {forced ? (
            <button type="button" onClick={() => void signOut()} className="text-ivory/60 transition-colors duration-200 hover:text-ivory">
              Sign out
            </button>
          ) : (
            <Link to="/admin/settings" className="text-ivory/60 transition-colors duration-200 hover:text-ivory">
              Back to Settings
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
