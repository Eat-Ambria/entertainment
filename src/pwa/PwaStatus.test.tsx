/**
 * Tests for the PWA update toast, offline banner and install button.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PwaStatus } from './PwaStatus';
import { InstallAppButton } from './InstallAppButton';
import { initInstallPrompt } from './installPrompt';

const sw = vi.hoisted(() => ({
  needRefresh: false,
  setNeedRefresh: vi.fn(),
  updateServiceWorker: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [sw.needRefresh, sw.setNeedRefresh],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: sw.updateServiceWorker,
  }),
}));

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
  window.dispatchEvent(new Event(value ? 'online' : 'offline'));
}

beforeEach(() => {
  sw.needRefresh = false;
  vi.clearAllMocks();
});
afterEach(() => setOnline(true));

describe('PwaStatus', () => {
  it('shows nothing when online and up to date', () => {
    const { container } = render(<PwaStatus />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers a reload when a new version is ready', async () => {
    sw.needRefresh = true;
    render(<PwaStatus />);
    expect(screen.getByText('A new version of the app is available.')).toBeInTheDocument();
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalled();
    vi.unstubAllGlobals();
    await userEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(sw.setNeedRefresh).toHaveBeenCalledWith(false);
  });

  it('shows an offline banner and hides it when back online', () => {
    render(<PwaStatus />);
    act(() => setOnline(false));
    expect(screen.getByText(/You're offline/)).toBeInTheDocument();
    act(() => setOnline(true));
    expect(screen.queryByText(/You're offline/)).not.toBeInTheDocument();
  });
});

describe('InstallAppButton', () => {
  let cleanup: () => void;
  afterEach(() => cleanup?.());

  it('is hidden until the browser allows installing', () => {
    cleanup = initInstallPrompt();
    render(<InstallAppButton />);
    expect(screen.queryByRole('button', { name: /Install app/ })).not.toBeInTheDocument();
  });

  it('appears and opens the native prompt', async () => {
    cleanup = initInstallPrompt();
    render(<InstallAppButton />);
    const evt = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    });
    act(() => {
      window.dispatchEvent(evt);
    });
    await userEvent.click(screen.getByRole('button', { name: /Install app/ }));
    expect(evt.prompt).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Install app/ })).not.toBeInTheDocument();
  });
});
