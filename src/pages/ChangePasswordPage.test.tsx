/**
 * Tests for the change-password screen (forced and voluntary).
 */
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeAuth, renderApp, testProfile } from '@/test/renderApp';

const forcedAuth = (changePassword = vi.fn().mockResolvedValue(undefined)) =>
  fakeAuth({ profile: { ...testProfile, must_change_password: true }, changePassword });

async function fill(current: string, next: string, confirm: string) {
  await userEvent.type(await screen.findByLabelText('Current password'), current);
  await userEvent.type(screen.getByLabelText('New password'), next);
  await userEvent.type(screen.getByLabelText('Confirm new password'), confirm);
  await userEvent.click(screen.getByRole('button', { name: 'Save password' }));
}

describe('ChangePasswordPage', () => {
  it('requires the two new passwords to match', async () => {
    const auth = forcedAuth();
    renderApp('/change-password', auth);
    await fill('old-pass-1', 'abc123', 'abc124');
    expect(screen.getByRole('alert')).toHaveTextContent('New passwords do not match.');
    expect(auth.changePassword).not.toHaveBeenCalled();
  });

  it('accepts any password (no rules) and continues into the app', async () => {
    const auth = forcedAuth();
    const { router } = renderApp('/change-password', auth);
    await fill('old-pass-1', 'aaaaaa', 'aaaaaa');
    expect(auth.changePassword).toHaveBeenCalledWith('old-pass-1', 'aaaaaa');
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('says when the current password is wrong', async () => {
    const auth = forcedAuth(vi.fn().mockRejectedValue({ status: 400, code: 'invalid_credentials' }));
    renderApp('/change-password', auth);
    await fill('nope', 'abcdef', 'abcdef');
    expect(await screen.findByRole('alert')).toHaveTextContent('Current password is incorrect.');
  });

  it('shows success in place when changed voluntarily from Settings', async () => {
    renderApp('/change-password', fakeAuth());
    await fill('old-pass', 'new-pass', 'new-pass');
    expect(await screen.findByRole('status')).toHaveTextContent('Password changed.');
  });
});
