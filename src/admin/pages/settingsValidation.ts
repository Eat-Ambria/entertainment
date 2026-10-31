/**
 * Validation for the Settings business-profile form. Limits mirror the DB checks on `profiles`.
 */
export interface ProfileForm {
  full_name: string;
  business_name: string;
  contact_line: string;
  lms_logged_user_id: string;
}

export interface ProfilePatch {
  full_name: string | null;
  business_name: string | null;
  contact_line: string | null;
  lms_logged_user_id: string | null;
}

type Result =
  | { ok: true; value: ProfilePatch; errors: Record<string, never> }
  | { ok: false; errors: Partial<Record<keyof ProfileForm, string>> };

const blankToNull = (s: string) => (s.trim() === '' ? null : s.trim());

export function validateProfile(form: ProfileForm): Result {
  const errors: Partial<Record<keyof ProfileForm, string>> = {};
  if (form.full_name.trim().length > 120) errors.full_name = 'Keep it under 120 characters.';
  if (form.business_name.trim().length > 120) errors.business_name = 'Keep it under 120 characters.';
  if (form.contact_line.trim().length > 200) errors.contact_line = 'Keep it under 200 characters.';
  const lms = form.lms_logged_user_id.trim();
  if (lms && !/^\d{1,10}$/.test(lms)) errors.lms_logged_user_id = 'Numbers only.';

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    errors: {},
    value: {
      full_name: blankToNull(form.full_name),
      business_name: blankToNull(form.business_name),
      contact_line: blankToNull(form.contact_line),
      lms_logged_user_id: blankToNull(lms),
    },
  };
}
