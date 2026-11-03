/**
 * Settings: branding (performer photos, shown to guests), business profile (name, contact line, LMS user
 * id) and account (sign-in phone; password is changed from the user menu). One card per section.
 */
import { useState, type FormEvent } from 'react';
import { useAuth } from '@/auth/AuthContext';
import type { AuthState } from '@/auth/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { FormAlert } from '@/components/ui/FormAlert';
import { Icon, type IconName } from '@/components/ui/Icon';
import { formatPhone } from '@/lib/phone';
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
  const { profile, updateProfile } = useAuth();
  return (
    <>
      <PageHeader title="Settings" description="Your business details and account." />
      <div className="max-w-4xl space-y-6">
        <Section icon="image" title="Branding" description="Performer photos shown to guests on the Guest Studio landing page.">
          <PerformerPhotosUploader />
        </Section>

        <Section icon="user" title="Business profile" description="Your name, business details and LMS connection.">
          <ProfileFormSection key={profile?.id} profile={profile} updateProfile={updateProfile} />
        </Section>

        <Section icon="lock" title="Account" description="How you sign in.">
          <dl>
            <dt className="text-sm text-slate-500">Mobile number</dt>
            <dd className="mt-0.5 font-medium text-slate-900">+91 {formatPhone(profile?.phone)}</dd>
          </dl>
        </Section>
      </div>
    </>
  );
}
