/**
 * Settings → Branding → Background photo (optional): a wide photo shown dimmed behind the
 * whole Guest Studio. Stored in the private `brand` bucket; without one, the Studio shows its
 * built-in concert photo.
 */
import { useRef, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { ImageThumb } from '@/components/ui/ImageThumb';
import { IMAGE_TYPES, uploadImage, userFilePath, validateImage } from '@/lib/storage';

export function LandingPhotoUploader() {
  const { profile, session, updateProfile } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const path = profile?.hero_image_path ?? null;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !session) return;
    const invalid = validateImage(file, IMAGE_TYPES);
    setError(invalid);
    if (invalid) return;
    setBusy(true);
    try {
      const uploaded = await uploadImage('brand', userFilePath(session.user.id, 'brand', file), file);
      await updateProfile({ hero_image_path: uploaded });
    } catch {
      setError('Upload failed. Please try again — if it keeps failing, the database may need the latest update (0028).');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 border-t border-slate-100 pt-5 sm:flex-row sm:items-center">
      <div className="w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-900 sm:w-56">
        {path ? (
          <ImageThumb bucket="brand" path={path} alt="Background photo" fill aspect="aspect-16/10" />
        ) : (
          <div className="flex aspect-16/10 items-center justify-center bg-[radial-gradient(circle_at_50%_30%,rgb(226_183_102/0.3),transparent_65%)] text-brand-300">
            <Icon name="sparkles" size={28} />
          </div>
        )}
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-900">Background photo (optional)</p>
        <p className="text-xs text-slate-500">
          Shown dimmed behind the Guest Studio. Leave empty for the built-in concert photo. A wide, dark stage shot works best — JPG, PNG or WebP,
          up to 2 MB.
        </p>
        <div className="flex flex-wrap gap-2">
          <input ref={fileRef} type="file" accept={IMAGE_TYPES.join(',')} className="hidden" onChange={onPick} aria-label="Background photo file" />
          <Button variant="secondary" loading={busy} onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={16} />
            {path ? 'Replace photo' : 'Upload photo'}
          </Button>
          {path && (
            <Button variant="ghost" disabled={busy} onClick={() => void updateProfile({ hero_image_path: null })}>
              Remove
            </Button>
          )}
        </div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
      </div>
    </div>
  );
}
