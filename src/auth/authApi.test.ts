/**
 * Tests for loading the profile — including databases that don't have the landing-photo
 * or performer-photo columns (0028, 0029) yet, where sign-in must still work.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const select = vi.fn();
vi.mock('@/lib/supabase', () => ({
  requireSupabase: () => ({
    from: () => ({ select: (cols: string) => ({ eq: () => ({ single: () => select(cols) }) }) }),
  }),
}));

import { authApi } from './authApi';

const row = { id: 'u1', phone: '9876543210', full_name: 'Uday', business_name: null, logo_path: null, contact_line: null, lms_logged_user_id: null, must_change_password: false };

beforeEach(() => select.mockReset());

describe('authApi.fetchProfile', () => {
  it('reads the landing and performer photos with the profile', async () => {
    select.mockResolvedValueOnce({ data: { ...row, hero_image_path: 'u1/brand/hero.webp', performer_photo_paths: ['u1/performers/1.webp'] }, error: null });
    expect(await authApi.fetchProfile('u1')).toMatchObject({ hero_image_path: 'u1/brand/hero.webp', performer_photo_paths: ['u1/performers/1.webp'] });
    expect(select.mock.calls[0]![0]).toContain('performer_photo_paths');
  });

  it('still signs in before 0029: no performer photos', async () => {
    select.mockResolvedValueOnce({ data: null, error: { code: '42703' } });
    select.mockResolvedValueOnce({ data: { ...row, hero_image_path: 'u1/brand/hero.webp' }, error: null });
    expect(await authApi.fetchProfile('u1')).toEqual({ ...row, hero_image_path: 'u1/brand/hero.webp', performer_photo_paths: [] });
    expect(select.mock.calls[1]![0]).not.toContain('performer_photo_paths');
    expect(select.mock.calls[1]![0]).toContain('hero_image_path');
  });

  it('still signs in before 0028: no landing photo either', async () => {
    select.mockResolvedValueOnce({ data: null, error: { code: '42703' } });
    select.mockResolvedValueOnce({ data: null, error: { code: '42703' } });
    select.mockResolvedValueOnce({ data: row, error: null });
    expect(await authApi.fetchProfile('u1')).toEqual({ ...row, hero_image_path: null, performer_photo_paths: [] });
    expect(select.mock.calls[2]![0]).not.toContain('hero_image_path');
  });

  it('gives up when the column is still missing after both fallbacks', async () => {
    select.mockResolvedValue({ data: null, error: { code: '42703' } });
    await expect(authApi.fetchProfile('u1')).rejects.toMatchObject({ code: '42703' });
    expect(select).toHaveBeenCalledTimes(3);
  });

  it('passes other errors through', async () => {
    select.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });
    await expect(authApi.fetchProfile('u1')).rejects.toMatchObject({ code: 'PGRST116' });
  });
});
