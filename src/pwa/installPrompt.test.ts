/**
 * Tests for the install-prompt store.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectIos, getSnapshot, initInstallPrompt, promptInstall } from './installPrompt';

let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

function fakePromptEvent(outcome: 'accepted' | 'dismissed') {
  const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: string }>;
  };
  e.prompt = vi.fn().mockResolvedValue(undefined);
  e.userChoice = Promise.resolve({ outcome });
  return e;
}

describe('install prompt', () => {
  it('captures the browser prompt and suppresses the default mini-bar', () => {
    cleanup = initInstallPrompt();
    const e = fakePromptEvent('accepted');
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(getSnapshot().canPrompt).toBe(true);
  });

  it('shows the native dialog once and marks the app installed when accepted', async () => {
    cleanup = initInstallPrompt();
    const e = fakePromptEvent('accepted');
    window.dispatchEvent(e);
    await expect(promptInstall()).resolves.toBe(true);
    expect(e.prompt).toHaveBeenCalledOnce();
    expect(getSnapshot()).toMatchObject({ canPrompt: false, installed: true });
    await expect(promptInstall()).resolves.toBe(false);
  });

  it('stays installable-later when dismissed', async () => {
    cleanup = initInstallPrompt();
    window.dispatchEvent(fakePromptEvent('dismissed'));
    await expect(promptInstall()).resolves.toBe(false);
    expect(getSnapshot().installed).toBe(false);
  });

  it('marks installed on appinstalled', () => {
    cleanup = initInstallPrompt();
    window.dispatchEvent(new Event('appinstalled'));
    expect(getSnapshot().installed).toBe(true);
  });
});

describe('detectIos', () => {
  it('recognises iPhone/iPad and ignores Android/desktop', () => {
    expect(detectIos('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(true);
    expect(detectIos('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe(true);
    expect(detectIos('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe(false);
    expect(detectIos('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(false);
  });
});
