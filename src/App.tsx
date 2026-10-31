/**
 * Root component: browser router over the shared route tree.
 * Suspense covers lazy pages that sit outside a layout (login, chooser, 404).
 * PwaStatus shows the update toast and offline banner on every screen.
 */
import { Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { routes } from '@/routes/routes';
import { Spinner } from '@/components/ui/Spinner';
import { PwaStatus } from '@/pwa/PwaStatus';

// basename follows the deploy base path ("/" locally, "/<repo>" on GitHub Pages).
const router = createBrowserRouter(routes, { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/' });

export default function App() {
  return (
    <>
      <Suspense fallback={<Spinner full />}>
        <RouterProvider router={router} />
      </Suspense>
      <PwaStatus />
    </>
  );
}
