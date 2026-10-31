/**
 * Tests for the Studio backdrop: built-in concert photo by default, the Settings background
 * photo when set.
 */
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MotionProvider } from '@/components/ui/MotionProvider';

vi.mock('@/lib/storage', () => ({
  useSignedUrl: (_bucket: string, path: string | null) => ({ data: path ? `https://img.test/${path}` : undefined }),
}));

import { BackdropPhoto } from './BackdropPhoto';

const renderBackdrop = (props: Parameters<typeof BackdropPhoto>[0]) =>
  render(
    <MotionProvider>
      <BackdropPhoto {...props} />
    </MotionProvider>,
  );
const sources = (c: HTMLElement) => Array.from(c.querySelectorAll('img')).map((i) => i.getAttribute('src'));

describe('BackdropPhoto', () => {
  it('shows the built-in concert photo by default', () => {
    const { container } = renderBackdrop({ path: null, strength: 1 });
    expect(sources(container)).toEqual(['/concert-bg.webp']);
  });

  it('uses the background photo from Settings when set', () => {
    const { container } = renderBackdrop({ path: 'u1/brand/bg.webp', strength: 1 });
    expect(sources(container)).toEqual(['https://img.test/u1/brand/bg.webp']);
  });
});
