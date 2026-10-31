/**
 * Guest Studio flow definition: the four steps a quote moves through in front of the guest.
 * Step lives in the URL (?step=package) so refresh/back keep the guest where they were.
 */
export const STUDIO_ROOT = '/studio';
export const STUDIO_NEW_QUOTE = `${STUDIO_ROOT}/new`;

export const STUDIO_STEPS = [
  { key: 'guest', label: 'Guest & Event', hint: 'Who the celebration is for, and when' },
  { key: 'package', label: 'Package', hint: 'Pick one or more packages' },
  { key: 'customise', label: 'Customise', hint: 'Choose elements, quantities and charges' },
  { key: 'quote', label: 'Quotation', hint: 'Review, save and download' },
] as const;

export type StudioStepKey = (typeof STUDIO_STEPS)[number]['key'];

export function parseStep(value: string | null): StudioStepKey {
  return STUDIO_STEPS.some((s) => s.key === value) ? (value as StudioStepKey) : 'guest';
}

export function stepIndex(key: StudioStepKey): number {
  return STUDIO_STEPS.findIndex((s) => s.key === key);
}

export function nextStep(key: StudioStepKey): StudioStepKey | null {
  return STUDIO_STEPS[stepIndex(key) + 1]?.key ?? null;
}

export function prevStep(key: StudioStepKey): StudioStepKey | null {
  const i = stepIndex(key);
  return i > 0 ? (STUDIO_STEPS[i - 1]?.key ?? null) : null;
}

/** Package / Customise right column: sticks just under the stepper, where it already starts, so it never moves. */
export const SIDE_STICKY = 'lg:sticky lg:top-[10.5rem] lg:self-start';
