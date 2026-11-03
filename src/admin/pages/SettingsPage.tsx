/**
 * Settings: branding (performer photos, shown to guests) and business profile (name, contact line).
 * One card per section. The LMS user id isn't shown here but is kept as saved (saving sends it back
 * unchanged); the password is changed from the user menu.
 */
import { useState, type FormEvent } from 'react';
import { useAuth } from '@/auth/AuthContext';
import type { AuthState } from '@/auth/types';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { FormAlert } from '@/components/ui/FormAlert';
import { Icon, type IconName } from '@/components/ui/Icon';
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
      <PageHeader title="Settings" description="Your business details." />
      <div className="space-y-6">
        <Section icon="image" title="Branding" description="Performer photos shown to guests on the Guest Studio landing page.">
          <PerformerPhotosUploader />
        </Section>

        <Section icon="user" title="Business profile" description="Your name and business details.">
          <ProfileFormSection key={profile?.id} profile={profile} updateProfile={updateProfile} />
        </Section>
      </div>
    </>
  );
}
