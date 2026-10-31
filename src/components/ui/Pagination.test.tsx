/**
 * Tests for the Pagination bar.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pagination } from './Pagination';

describe('Pagination', () => {
  it('shows range and disables Previous on the first page', () => {
    render(<Pagination page={1} pageSize={25} total={60} onPageChange={() => {}} />);
    expect(screen.getByText('1–25 of 60')).toBeInTheDocument();
    expect(screen.getByLabelText('Previous page')).toBeDisabled();
    expect(screen.getByLabelText('Next page')).toBeEnabled();
  });

  it('calls onPageChange for next and numbered pages', async () => {
    const onPageChange = vi.fn();
    render(<Pagination page={1} pageSize={25} total={60} onPageChange={onPageChange} />);
    await userEvent.click(screen.getByLabelText('Next page'));
    await userEvent.click(screen.getByRole('button', { name: '3' }));
    expect(onPageChange).toHaveBeenNthCalledWith(1, 2);
    expect(onPageChange).toHaveBeenNthCalledWith(2, 3);
  });

  it('marks the current page and disables Next on the last page', () => {
    render(<Pagination page={3} pageSize={25} total={60} onPageChange={() => {}} />);
    expect(screen.getByRole('button', { name: '3' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByLabelText('Next page')).toBeDisabled();
  });

  it('changes page size', async () => {
    const onPageSizeChange = vi.fn();
    render(
      <Pagination page={1} pageSize={25} total={60} onPageChange={() => {}} onPageSizeChange={onPageSizeChange} />,
    );
    await userEvent.selectOptions(screen.getByRole('combobox'), '50');
    expect(onPageSizeChange).toHaveBeenCalledWith(50);
  });
});
