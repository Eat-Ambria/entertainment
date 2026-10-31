/**
 * Tests for the Guest Studio stepper.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Stepper } from './Stepper';

describe('Stepper', () => {
  it('marks the current step and locks future steps', () => {
    render(<Stepper current="package" onSelect={() => {}} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons[1]).toHaveAttribute('aria-current', 'step');
    expect(buttons[2]).toBeDisabled();
    expect(buttons[3]).toBeDisabled();
  });

  it('lets the user jump back to a completed step', async () => {
    const onSelect = vi.fn();
    render(<Stepper current="customise" onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('button', { name: /Guest & Event/ }));
    expect(onSelect).toHaveBeenCalledWith('guest');
  });
});
