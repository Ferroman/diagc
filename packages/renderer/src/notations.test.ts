import { describe, expect, it } from 'vitest';
import { NOTATION_PROFILES, notationProfile } from './notations';

describe('notationProfile', () => {
  it('returns the default profile when no id is given', () => {
    expect(notationProfile(undefined).id).toBe('default');
  });

  it('returns the causal-loop-diagram profile for "causal-loop"', () => {
    const profile = notationProfile('causal-loop');
    expect(profile.id).toBe('causal-loop');
    expect(profile.className).toBe('dg-notation-cld');
    expect(profile.edgeCurvature).toBe(0.55);
    expect(profile.edge?.marks).toBe(true);
    expect(profile.edge?.bowed).toBe(true);
    expect(profile.overlay).toBe('loop-labels');
  });

  it('exposes the causal-loop profile keyed by notation id in NOTATION_PROFILES', () => {
    expect(NOTATION_PROFILES['causal-loop']).toBe(notationProfile('causal-loop'));
  });

  it('falls back to the default profile for an unknown id instead of throwing', () => {
    expect(() => notationProfile('bogus' as never)).not.toThrow();
    expect(notationProfile('bogus' as never).id).toBe('default');
  });
});
