/**
 * Tests for the Settings business-profile form.
 */
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeAuth, renderApp, testProfile } from '@/test/renderApp';

describe('SettingsPage', () => {
  it('pre-fills from the profile and saves trimmed values', async () => {
    const auth = fakeAuth({ profile: { ...testProfile, business_name: 'Old Name' } });
    renderApp('/admin/settings', auth);
    const business = await screen.findByLabelText('Business name');
    expect(business).toHaveValue('Old Name');
    await userEvent.clear(business);
    await userEvent.type(business, '  Uday Events  ');
    await userEvent.type(screen.getByLabelText('LMS user ID'), '42');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(auth.updateProfile).toHaveBeenCalledWith({
      full_name: 'Uday Yadav',
      business_name: 'Uday Events',
      contact_line: null,
      lms_logged_user_id: '42',
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Profile saved.');
  });

  it('blocks a non-numeric LMS user id', async () => {
    const auth = fakeAuth();
    renderApp('/admin/settings', auth);
    await userEvent.type(await screen.findByLabelText('LMS user ID'), 'abc');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(screen.getByText('Numbers only.')).toBeInTheDocument();
    expect(auth.updateProfile).not.toHaveBeenCalled();
  });

  it('shows the sign-in phone and a change-password link', async () => {
    renderApp('/admin/settings');
    expect(await screen.findByText('+91 98765 43210')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Change password' })).toHaveAttribute('href', '/change-password');
  });
});
