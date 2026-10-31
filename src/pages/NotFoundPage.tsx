/**
 * 404 page for unknown routes.
 */
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/ui/EmptyState';

export default function NotFoundPage() {
  return (
    <EmptyState
      icon="alert"
      title="Page not found"
      description="The page you are looking for does not exist."
      action={
        <Link to="/" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
          Go to Dashboard
        </Link>
      }
    />
  );
}
