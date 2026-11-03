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
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(auth.updateProfile).toHaveBeenCalledWith({
      full_name: 'Uday Yadav',
      business_name: 'Uday Events',
      contact_line: null,
      lms_logged_user_id: null,
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Profile saved.');
  });

  it('keeps the saved LMS user id and shows no account or LMS section', async () => {
    const auth = fakeAuth({ profile: { ...testProfile, lms_logged_user_id: '42' } });
    renderApp('/admin/settings', auth);
    await userEvent.click(await screen.findByRole('button', { name: 'Save changes' }));
    expect(auth.updateProfile).toHaveBeenCalledWith(expect.objectContaining({ lms_logged_user_id: '42' }));
    expect(screen.queryByLabelText('LMS user ID')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Account' })).not.toBeInTheDocument();
  });
});
