/**
 * Settings → Branding → Performer photos: up to 6 shots of guests and artists performing at
 * the venue. The Guest Studio landing shows them one after another in the frame on the right. Stored in the private
 * `brand` bucket (per-user `performers/` folder); paths live on `profiles.performer_photo_paths`.
 */
import { useRef, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { ImageThumb } from '@/components/ui/ImageThumb';
import { IMAGE_TYPES, removeImage, uploadImage, userFilePath, validateImage } from '@/lib/storage';

export const MAX_PERFORMER_PHOTOS = 6;

export function PerformerPhotosUploader() {
  const { profile, session, updateProfile } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paths = profile?.performer_photo_paths ?? [];
  const room = MAX_PERFORMER_PHOTOS - paths.length;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0 || !session) return;
    const invalid = files.map((f) => validateImage(f, IMAGE_TYPES)).find(Boolean) ?? null;
    if (invalid) return setError(invalid);
    if (files.length > room) return setError(`You can add ${room} more photo${room === 1 ? '' : 's'} (up to ${MAX_PERFORMER_PHOTOS}).`);
    setError(null);
    setBusy(true);
    try {
      const now = Date.now();
      const uploaded: string[] = [];
      for (const [i, file] of files.entries()) {
        uploaded.push(await uploadImage('brand', userFilePath(session.user.id, 'performers', file, now + i), file));
      }
      await updateProfile({ performer_photo_paths: [...paths, ...uploaded] });
    } catch {
      setError('Upload failed. Please try again — if it keeps failing, the database may need the latest update (0029).');
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(path: string) {
    setBusy(true);
    try {
      await updateProfile({ performer_photo_paths: paths.filter((p) => p !== path) });
      void removeImage('brand', path);
    } catch {
      setError('Could not remove the photo. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-900">Performer photos</p>
        </div>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={IMAGE_TYPES.join(',')}
          className="hidden"
          onChange={onPick}
          aria-label="Performer photo files"
        />
        <Button variant="secondary" loading={busy} disabled={room <= 0} onClick={() => fileRef.current?.click()}>
          <Icon name="upload" size={16} />
          Add photos
        </Button>
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {paths.map((path, i) => (
          <li key={path} className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-900">
            <ImageThumb bucket="brand" path={path} alt={`Performer photo ${i + 1}`} fill aspect="aspect-7/5" />
            <button
              type="button"
              disabled={busy}
              onClick={() => void onRemove(path)}
              aria-label={`Remove performer photo ${i + 1}`}
              className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-rose-600 disabled:opacity-50"
            >
              <Icon name="close" size={14} />
            </button>
          </li>
        ))}
        {Array.from({ length: Math.max(room, 0) }, (_, i) => (
          <li
            key={`empty-${i}`}
            className="flex aspect-7/5 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-300"
            aria-hidden="true"
          >
            <Icon name="image" size={20} />
          </li>
        ))}
      </ul>
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </div>
  );
}
