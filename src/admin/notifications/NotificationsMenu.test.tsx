/**
 * Tests for the header bell: opens a notifications panel instead of navigating.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderApp } from '@/test/renderApp';
import { notificationsApi } from './notificationsApi';

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(notificationsApi, 'load').mockResolvedValue({
    activity: [
      { id: 'a1', quoteId: 'q1', quoteNo: 'ENT-2026-00007', guestName: 'Mehta Family', action: 'edited_by_other', by: 'David', at: new Date().toISOString() },
    ],
    upcoming: [{ id: 'q2', quoteNo: 'ENT-2026-00008', guestName: 'Kapoor', functionName: 'Sangeet', eventDate: '2099-01-01' }],
    drafts: 3,
  });
});

describe('NotificationsMenu', () => {
  it('opens a panel with team activity, upcoming events and drafts, and stays on the page', async () => {
    renderApp('/admin/elements');
    const bell = await screen.findByRole('button', { name: 'Notifications (1 new)' });
    await userEvent.click(bell);
    const panel = screen.getByRole('dialog', { name: 'Notifications' });
    expect(within(panel).getByText(/edited/)).toHaveTextContent('David edited ENT-2026-00007 · Mehta Family');
    expect(within(panel).getByRole('link', { name: /Kapoor/ })).toHaveAttribute('href', '/admin/quotes/q2');
    expect(within(panel).getByRole('link', { name: /3 draft quotes are waiting/ })).toHaveAttribute('href', '/admin/quotes?status=draft');
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument(); // badge cleared once seen
  });
});
