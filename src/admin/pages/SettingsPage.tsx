/**
 * Settings: branding (logo, shown to guests), business profile (name, contact line, LMS user
 * id) and account (sign-in phone, password). One card per section.
 * Charge rates live under Catalogue → Additional charges.
 */
import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import type { AuthState } from '@/auth/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { FormAlert } from '@/components/ui/FormAlert';
import { BrandMark } from '@/components/ui/BrandMark';
import { Icon, type IconName } from '@/components/ui/Icon';
import { formatPhone } from '@/lib/phone';
import { LOGO_TYPES, uploadImage, userFilePath, validateImage } from '@/lib/storage';
import { validateProfile, type ProfileForm } from './settingsValidation';
import { PerformerPhotosUploader } from '../settings/PerformerPhotosUploader';

function Section({ icon, title, description, children }: { icon: IconName; title: string; description: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-start gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <Icon name={icon} size={18} />
        </span>
        <div>
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
      </header>
      <div className="px-5 py-5 sm:px-6">{children}</div>
    </section>
  );
}

function ProfileFormSection({ profile, updateProfile }: Pick<AuthState, 'profile' | 'updateProfile'>) {
  const [form, setForm] = useState<ProfileForm>(() => ({
    full_name: profile?.full_name ?? '',
    business_name: profile?.business_name ?? '',
    contact_line: profile?.contact_line ?? '',
    lms_logged_user_id: profile?.lms_logged_user_id ?? '',
  }));
  const [errors, setErrors] = useState<Partial<Record<keyof ProfileForm, string>>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  const set = (key: keyof ProfileForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    const result = validateProfile(form);
    setErrors(result.errors);
    if (!result.ok) return;
    setSaving(true);
    try {
      await updateProfile(result.value);
      setMessage({ tone: 'success', text: 'Profile saved.' });
    } catch {
      setMessage({ tone: 'error', text: 'Could not save. Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSave} noValidate className="space-y-4">
      {message && <FormAlert tone={message.tone}>{message.text}</FormAlert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Your name" value={form.full_name} onChange={set('full_name')} error={errors.full_name} />
        <TextField
          label="Business name"
          value={form.business_name}
          onChange={set('business_name')}
          error={errors.business_name}
          hint="Leave blank to use the default brand."
        />
      </div>
      <TextField
        label="Contact line"
        placeholder="e.g. +91 98765 43210 · events@yourbusiness.in"
        value={form.contact_line}
        onChange={set('contact_line')}
        error={errors.contact_line}
        hint="Printed at the bottom of guest quotations."
      />
      <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">LMS connection</p>
        <div className="sm:max-w-xs">
          <TextField
            label="LMS user ID"
            inputMode="numeric"
            value={form.lms_logged_user_id}
            onChange={set('lms_logged_user_id')}
            error={errors.lms_logged_user_id}
            hint="Used to fetch your leads and contracts."
          />
        </div>
      </div>
      <div className="flex justify-end border-t border-slate-100 pt-4">
        <Button type="submit" loading={saving}>
          Save changes
        </Button>
      </div>
    </form>
  );
}

export default function SettingsPage() {
  const { profile, session, updateProfile } = useAuth();
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !session) return;
    const invalid = validateImage(file, LOGO_TYPES);
    setLogoError(invalid);
    if (invalid) return;
    setLogoBusy(true);
    try {
      const path = await uploadImage('brand', userFilePath(session.user.id, 'brand', file), file);
      await updateProfile({ logo_path: path });
    } catch {
      setLogoError('Upload failed. Please try again.');
    } finally {
      setLogoBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Settings" description="Your business details and account." />
      <div className="max-w-4xl space-y-6">
        <Section icon="image" title="Branding" description="Your logo, performer photos and background photo, shown to guests in the Guest Studio and on quotations.">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4">
              <BrandMark size="lg" subtitle="Preview" />
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                <input ref={fileRef} type="file" accept={LOGO_TYPES.join(',')} className="hidden" onChange={onLogo} />
                <Button variant="secondary" loading={logoBusy} onClick={() => fileRef.current?.click()}>
                  <Icon name="upload" size={16} />
                  {profile?.logo_path ? 'Replace logo' : 'Upload logo'}
                </Button>
                {profile?.logo_path && (
                  <Button variant="ghost" disabled={logoBusy} onClick={() => void updateProfile({ logo_path: null })}>
                    Remove
                  </Button>
                )}
              </div>
              <p className="text-xs text-slate-500">JPG, PNG, WebP or SVG, up to 2 MB. A square logo looks best.</p>
              {logoError && <p className="text-sm text-rose-600">{logoError}</p>}
            </div>
          </div>
          <div className="mt-5">
            <PerformerPhotosUploader />
          </div>
        </Section>

        <Section icon="user" title="Business profile" description="Your name, business details and LMS connection.">
          <ProfileFormSection key={profile?.id} profile={profile} updateProfile={updateProfile} />
        </Section>

        <Section icon="lock" title="Account" description="How you sign in.">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <dl>
              <dt className="text-sm text-slate-500">Mobile number</dt>
              <dd className="mt-0.5 font-medium text-slate-900">+91 {formatPhone(profile?.phone)}</dd>
            </dl>
            <Link
              to="/change-password"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Icon name="lock" size={16} /> Change password
            </Link>
          </div>
        </Section>
      </div>
    </>
  );
}
