/**
 * Tests for Guest Studio step navigation.
 */
import { describe, expect, it } from 'vitest';
import { nextStep, parseStep, prevStep, stepIndex } from './steps';

describe('studio steps', () => {
  it('parses known steps and defaults unknown ones to guest', () => {
    expect(parseStep('package')).toBe('package');
    expect(parseStep(null)).toBe('guest');
    expect(parseStep('hack')).toBe('guest');
  });

  it('moves forward and back in order', () => {
    expect(nextStep('guest')).toBe('package');
    expect(nextStep('customise')).toBe('quote');
    expect(nextStep('quote')).toBeNull();
    expect(prevStep('package')).toBe('guest');
    expect(prevStep('guest')).toBeNull();
  });

  it('indexes steps', () => {
    expect(stepIndex('guest')).toBe(0);
    expect(stepIndex('quote')).toBe(3);
  });
});
