/**
 * Tests for image validation and per-user storage paths.
 */
import { describe, expect, it } from 'vitest';
import { LOGO_TYPES, MAX_IMAGE_BYTES, userFilePath, validateImage } from './storage';

const file = (name: string, type: string, size = 1000) => {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};

describe('validateImage', () => {
  it('accepts jpg/png/webp up to 2 MB', () => {
    expect(validateImage(file('a.jpg', 'image/jpeg'))).toBeNull();
    expect(validateImage(file('a.webp', 'image/webp', MAX_IMAGE_BYTES))).toBeNull();
  });

  it('rejects other types and large files', () => {
    expect(validateImage(file('a.gif', 'image/gif'))).toMatch(/JPG, PNG or WebP/);
    expect(validateImage(file('a.png', 'image/png', MAX_IMAGE_BYTES + 1))).toMatch(/2 MB/);
  });

  it('allows SVG only where permitted (logos)', () => {
    expect(validateImage(file('l.svg', 'image/svg+xml'))).not.toBeNull();
    expect(validateImage(file('l.svg', 'image/svg+xml'), LOGO_TYPES)).toBeNull();
  });
});

describe('userFilePath', () => {
  it('starts with the user id and sanitises the extension', () => {
    expect(userFilePath('u1', 'brand', file('My Logo.PNG', 'image/png'), 123)).toBe('u1/brand/123.png');
    expect(userFilePath('u1', 'elements', file('noext', 'image/png'), 5)).toBe('u1/elements/5.noext');
    expect(userFilePath('u1', 'elements', file('x.j$p<g', 'image/jpeg'), 5)).toBe('u1/elements/5.jpg');
  });
});
