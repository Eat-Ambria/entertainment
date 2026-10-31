/**
 * Full-page notice when the app can't reach its backend (missing env or profile load failure).
 */
import { BrandMark } from '@/components/ui/BrandMark';
import { Icon } from '@/components/ui/Icon';

export function NotConfigured({ message }: { message?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-stone-50 px-4 text-center">
      <BrandMark size="lg" />
      <div className="max-w-md rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
        <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <Icon name="alert" />
        </span>
        <h1 className="font-semibold text-slate-900">{message ?? 'The app is not connected yet'}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {message
            ? 'Please refresh the page. If this keeps happening, contact your administrator.'
            : 'Add the Supabase URL and anon key to .env, then restart the app.'}
        </p>
      </div>
    </div>
  );
}
