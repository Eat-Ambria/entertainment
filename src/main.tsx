/**
 * App entry: query cache -> auth (session + profile) -> router.
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { queryClient } from '@/lib/queryClient';
import { AuthProvider } from '@/auth/AuthProvider';
import { initInstallPrompt } from '@/pwa/installPrompt';
import { reloadForNewVersion } from '@/lib/lazyPage';
import './index.css';

// Before React mounts — the browser may fire the install prompt very early.
initInstallPrompt();

// A file from the previous build failed to preload (a new version was deployed): reload once.
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault();
  reloadForNewVersion();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
