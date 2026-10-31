/**
 * Tests for the landing featured-performances frame: placeholder without photos; with photos,
 * one photo at a time, dots to jump, and automatic advance.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MotionProvider } from '@/components/ui/MotionProvider';

vi.mock('@/lib/storage', () => ({
  useSignedUrl: (_bucket: string, path: string | null) => ({ data: path ? `https://img.test/${path}` : undefined }),
}));

import { FeaturedReel } from './FeaturedReel';

const renderReel = (paths: string[]) =>
  render(
    <MotionProvider>
      <FeaturedReel paths={paths} />
    </MotionProvider>,
  );

afterEach(() => vi.useRealTimers());

describe('FeaturedReel', () => {
  it('keeps the frame as a placeholder when there are no photos', () => {
    renderReel([]);
    expect(screen.getByRole('figure', { name: 'Featured performances' })).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows one photo at a time and jumps with the dots', () => {
    renderReel(['u1/performers/1.webp', 'u1/performers/2.webp', 'u1/performers/3.webp']);
    expect(screen.getByRole('img', { name: /photo 1/ })).toHaveAttribute('src', 'https://img.test/u1/performers/1.webp');
    fireEvent.click(screen.getByRole('button', { name: 'Show photo 3' }));
    expect(screen.getByRole('button', { name: 'Show photo 3' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('img', { name: /photo 3/ })).toBeInTheDocument();
  });

  it('advances to the next photo on its own', () => {
    vi.useFakeTimers();
    renderReel(['u1/performers/1.webp', 'u1/performers/2.webp']);
    act(() => vi.advanceTimersByTime(5100));
    expect(screen.getByRole('button', { name: 'Show photo 2' })).toHaveAttribute('aria-current', 'true');
  });
});

describe('FeaturedReel arrows', () => {
  it('moves with previous and next', () => {
    renderReel(['u1/performers/1.webp', 'u1/performers/2.webp', 'u1/performers/3.webp']);
    fireEvent.click(screen.getByRole('button', { name: 'Previous photo' }));
    expect(screen.getByRole('button', { name: 'Show photo 3' })).toHaveAttribute('aria-current', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Next photo' }));
    expect(screen.getByRole('button', { name: 'Show photo 1' })).toHaveAttribute('aria-current', 'true');
  });
});

describe('FeaturedReel pause', () => {
  it('pauses while the pointer is over the card', () => {
    vi.useFakeTimers();
    renderReel(['u1/performers/1.webp', 'u1/performers/2.webp']);
    fireEvent.pointerEnter(screen.getByRole('figure').parentElement!);
    act(() => vi.advanceTimersByTime(6000));
    expect(screen.getByRole('button', { name: 'Show photo 1' })).toHaveAttribute('aria-current', 'true');
    fireEvent.pointerLeave(screen.getByRole('figure').parentElement!);
    act(() => vi.advanceTimersByTime(5100));
    expect(screen.getByRole('button', { name: 'Show photo 2' })).toHaveAttribute('aria-current', 'true');
  });
});
