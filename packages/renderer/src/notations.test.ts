import { describe, expect, it } from 'vitest';
import { GIT_LAYOUT, gitEdgeColor, gitLayout, gitNodeColors } from './git-layout';
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

  it('colours causal-loop links by polarity, from theme tokens', () => {
    const colors = notationProfile('causal-loop').edge?.polarityColors;
    expect(colors).toEqual({ '+': 'var(--dg-polarity-positive)', '-': 'var(--dg-polarity-negative)' });
  });

  it('leaves the default profile uncoloured by polarity', () => {
    expect(notationProfile(undefined).edge?.polarityColors).toBeUndefined();
  });

  it('exposes the causal-loop profile keyed by notation id in NOTATION_PROFILES', () => {
    expect(NOTATION_PROFILES['causal-loop']).toBe(notationProfile('causal-loop'));
  });

  it('falls back to the default profile for an unknown id instead of throwing', () => {
    expect(() => notationProfile('bogus' as never)).not.toThrow();
    expect(notationProfile('bogus' as never).id).toBe('default');
  });

  it('the git-graph profile supplies the layout, forces lanes open, colours by lane and draws the tails overlay', () => {
    const p = notationProfile('git-graph');
    expect(p.className).toBe('dg-notation-git');
    expect(p.layout).toBe(gitLayout);
    expect(p.typeStyles).toEqual({
      commit: { shape: 'circle' },
      branch: { shape: 'box' },
      'git-stage': { shape: 'box', label: '' }, // a frame across the lanes: no '[git-stage]' subtitle
    });
    expect(p.kindStyles).toEqual({
      commit: { dashed: true, endMarker: 'none' },
      branch: { dashed: true, endMarker: 'none' },
      merge: { dashed: true, endMarker: 'none' },
    });
    expect(p.node?.alwaysExpanded?.({ id: 'm', name: 'm', type: 'branch' })).toBe(true);
    expect(p.node?.alwaysExpanded?.({ id: 'c', name: '', type: 'commit' })).toBe(false);
    expect(p.node?.leafSize?.({ id: 'c', name: '', type: 'commit' })).toEqual({ width: GIT_LAYOUT.DIAMETER, height: GIT_LAYOUT.DIAMETER });
    expect(p.node?.leafSize?.({ id: 'x', name: 'x', type: 'service' })).toBeUndefined();
    expect(p.node?.colorOf).toBe(gitNodeColors);
    expect(p.edge?.colorOf).toBe(gitEdgeColor);
    expect(p.overlay).toBe('git-lanes');
    expect(NOTATION_PROFILES['git-graph']).toBe(p);
  });

  it('the c4 profile paints the element families with the C4 palette', () => {
    const t = notationProfile('c4').typeStyles!;
    expect(t['c4-system']).toMatchObject({ fill: '#1168bd', textOn: '#ffffff' });
    expect(t['c4-container-db']).toMatchObject({ fill: '#438dd5', shape: 'cylinder' });
    expect(t['c4-component']).toMatchObject({ fill: '#85bbf0', textOn: '#0b1a2b' });
    expect(t['c4-person']).toMatchObject({ fill: '#08427b', shape: 'person' });
    expect(t['c4-system-external']).toMatchObject({ fill: '#999999' });
    // boundaries keep no fill — they stay dashed context, not solid things
    expect(t['c4-system-boundary']).toBeUndefined();
  });
});
