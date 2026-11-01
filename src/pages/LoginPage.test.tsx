/**
 * Tests for the sign-in screen.
 */
import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeAuth, renderApp } from '@/test/renderApp';

const signedOut = (signIn = fakeAuth().signIn) => fakeAuth({ status: 'signedOut', signIn });

describe('LoginPage', () => {
  it('has no sign-up option', async () => {
    renderApp('/login', signedOut());
    await screen.findByRole('heading', { name: 'Sign in' });
    expect(screen.queryByText(/sign up|create account|register/i)).not.toBeInTheDocument();
  });

  it('validates the phone number before calling the server', async () => {
    const auth = signedOut();
    renderApp('/login', auth);
    await userEvent.type(await screen.findByLabelText('Mobile number'), '12345');
    await userEvent.type(screen.getByLabelText('Password'), 'secret');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByText('Enter a valid 10-digit mobile number.')).toBeInTheDocument();
    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it('signs in and opens a linked quote straight away', async () => {
    const auth = signedOut();
    const { router } = renderApp('/login', auth, { from: '/admin/quotes/q1' });
    await userEvent.type(await screen.findByLabelText('Mobile number'), '98765 43210'); // the space is dropped
    await userEvent.type(screen.getByLabelText('Password'), 'old-pass-1');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(auth.signIn).toHaveBeenCalledWith('9876543210', 'old-pass-1');
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/quotes/q1'));
  });

  it('shows the Guest Studio / My Workspace choice after signing in from a Workspace page', async () => {
    const auth = signedOut();
    const { router } = renderApp('/login', auth, { from: '/admin/packages' });
    await userEvent.type(await screen.findByLabelText('Mobile number'), '98765 43210'); // the space is dropped
    await userEvent.type(screen.getByLabelText('Password'), 'old-pass-1');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('shows a friendly message for wrong credentials', async () => {
    const signIn = fakeAuth().signIn;
    (signIn as ReturnType<typeof import('vitest').vi.fn>).mockRejectedValueOnce({ status: 400, code: 'invalid_credentials' });
    renderApp('/login', signedOut(signIn));
    await userEvent.type(await screen.findByLabelText('Mobile number'), '9876543210');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Phone number or password is incorrect.');
  });

  it('keeps the mobile number to 10 digits (letters and symbols are dropped)', async () => {
    renderApp('/login', signedOut());
    const phone = await screen.findByLabelText('Mobile number');
    await userEvent.type(phone, '9711540211feue+-55');
    expect(phone).toHaveValue('9711540211');
  });

  it('can reveal the password', async () => {
    renderApp('/login', signedOut());
    const pw = await screen.findByLabelText('Password');
    expect(pw).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(pw).toHaveAttribute('type', 'text');
  });
});
