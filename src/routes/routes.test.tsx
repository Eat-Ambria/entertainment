/**
 * Routing tests: auth guards, workspace chooser, Guest Studio flow, My Workspace nav, 404,
 * and that the Guest Studio never shows internal content.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeAuth, renderApp, testProfile } from '@/test/renderApp';
import { eventOptionsApi } from '@/data/eventOptions';
import { setQuoteDraft } from '@/studio/quoteDraft';

const withGuestDraft = () =>
  setQuoteDraft(testProfile.id, (d) => ({
    ...d,
    guest: {
      source: 'manual',
      sourceRef: null,
      sourceRaw: null,
      guestName: 'Mehta Family',
      phone: '9876543210',
      functionId: 'f1',
      venueId: 'v1',
      subVenueId: null,
      eventDate: '2027-01-10',
      sessionId: 's1',
    },
  }));

beforeEach(() => {
  sessionStorage.clear();
  vi.spyOn(eventOptionsApi, 'fetch').mockResolvedValue({ functions: [], venues: [], subVenues: [], sessions: [] });
});

describe('auth guards', () => {
  it('sends signed-out users to the login page', async () => {
    const { router } = renderApp('/admin/packages', fakeAuth({ status: 'signedOut' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.state).toEqual({ from: '/admin/packages' });
  });

  it('forces a password change before anything else', async () => {
    const auth = fakeAuth({ profile: { ...testProfile, must_change_password: true } });
    const { router } = renderApp('/studio', auth);
    expect(await screen.findByRole('heading', { name: 'Set your own password' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/change-password');
  });

  it('shows a clear notice when the backend is not configured', async () => {
    renderApp('/', fakeAuth({ status: 'unconfigured' }));
    expect(await screen.findByText('The app is not connected yet')).toBeInTheDocument();
  });

  it('signed-in users skip the login page', async () => {
    const { router } = renderApp('/login');
    await screen.findByRole('heading', { name: 'Guest Studio' });
    expect(router.state.location.pathname).toBe('/');
  });

  it('signs out from the user menu', async () => {
    const auth = fakeAuth();
    const { router } = renderApp('/admin', auth, undefined, { stateful: true });
    await userEvent.click(await screen.findByRole('button', { name: /Uday Yadav/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: /Sign out/ }));
    expect(auth.signOut).toHaveBeenCalled();
    await waitFor(() => expect(router.state.location.pathname).toBe('/login'));
  });
});

describe('workspace chooser', () => {
  it('offers Guest Studio and My Workspace', async () => {
    const { router } = renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Guest Studio' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'My Workspace' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: /My Workspace/ }));
    // The page opens a moment after the press so the ripple is seen.
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin'));
  });
});

describe('Guest Studio', () => {
  it('starts a quotation on the Guest & Event step', async () => {
    renderApp('/studio');
    await userEvent.click(await screen.findByRole('link', { name: /Start a quotation/ }));
    expect(await screen.findByRole('heading', { name: 'Guest & Event' })).toBeInTheDocument();
    expect(await screen.findByRole('search')).toBeInTheDocument();
  });

  it('opens the package step once guest details exist, but not later steps', async () => {
    withGuestDraft();
    const { router } = renderApp('/studio/new?step=quote');
    expect(await screen.findByRole('heading', { name: 'Package' })).toBeInTheDocument();
    expect(router.state.location.search).toBe('?step=package');
  });

  it('has no admin sidebar, user menu or internal wording', async () => {
    withGuestDraft();
    renderApp('/studio/new?step=package');
    await screen.findByRole('heading', { name: 'Package' });
    expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Uday Yadav/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/P&L|Rate History|cost|margin|vendor/i)).not.toBeInTheDocument();
  });

  it('shows the business name from the profile', async () => {
    renderApp('/studio', fakeAuth({ profile: { ...testProfile, business_name: 'Uday Events' } }));
    expect(await screen.findAllByText('Uday Events')).toHaveLength(1); // header (the Studio has no footer)
  });

  it('redirects unknown studio paths to the studio home', async () => {
    const { router } = renderApp('/studio/whatever');
    await screen.findByRole('link', { name: /Start a quotation/ });
    expect(router.state.location.pathname).toBe('/studio');
  });
});

describe('My Workspace', () => {
  it('renders the dashboard with all internal nav items', async () => {
    renderApp('/admin');
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Main' });
    for (const label of ['Quote Ledger', 'Elements', 'Packages', 'Rate History', 'P&L Reports', 'Settings']) {
      expect(nav).toHaveTextContent(label);
    }
  });

  it('navigates via the sidebar', async () => {
    const { router } = renderApp('/admin');
    const nav = await screen.findByRole('navigation', { name: 'Main' });
    await userEvent.click(within(nav).getByText('Packages'));
    expect(await screen.findByRole('heading', { name: 'Packages' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/admin/packages');
  });

  it('New Quote opens the Guest Studio flow', async () => {
    const { router } = renderApp('/admin');
    await userEvent.click(await screen.findByRole('link', { name: /New Quote/ }));
    expect(router.state.location.pathname).toBe('/studio/new');
  });
});

describe('not found', () => {
  it('shows 404 for unknown routes', async () => {
    renderApp('/nope');
    expect(await screen.findByText('Page not found')).toBeInTheDocument();
  });
});
