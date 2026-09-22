import { describe, expect, it } from 'vitest';
import { compileView, model } from '@diagc/core';
import { BONE_PALETTE, fishboneEdgeColor, fishboneLayout, fishboneNodeColors } from './fishbone-layout';
import { GIT_LAYOUT, gitEdgeColor, gitLayout, gitNodeColors } from './git-layout';
import { NOTATION_PROFILES, notationProfile, planBadges, TM_BOUNDARY_COLOR } from './notations';
import { createKindRegistry, createTypeRegistry, DEFAULT_KIND_STYLES, DEFAULT_TYPE_STYLES } from './registry';
import { planLayout, PLAN_LAYOUT } from './plan-layout';

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

describe('second-order profile', () => {
  const p = notationProfile('second-order');
  it('draws the order-bands overlay, partitioning nodes by consequence order', () => {
    expect(notationProfile('second-order').overlay).toBe('order-bands');
    expect(notationProfile('second-order').partitionOf).toBeDefined();
  });
  it('tints consequences by valence from the theme polarity tokens, and leaves the rest alone', () => {
    const m = model('so');
    const d = m.secondOrder().decision('d');
    d.then('good', 'good', { valence: '+' });
    d.then('bad', 'bad', { valence: '-' });
    d.then('meh');
    const colors = p.node!.colorOf!(m.toJSON(), undefined);
    expect(Object.fromEntries(colors)).toEqual({ good: 'var(--dg-polarity-positive)', bad: 'var(--dg-polarity-negative)' });
  });
});

describe('fishbone profile', () => {
  const p = notationProfile('fishbone');
  it('owns the arrangement and colours bones by category', () => {
    expect(p.className).toBe('dg-notation-fb');
    expect(p.layout).toBe(fishboneLayout);
    expect(p.node?.colorOf).toBe(fishboneNodeColors);
    expect(p.edge?.colorOf).toBe(fishboneEdgeColor);
    expect(p.overlay).toBeUndefined();
    expect(p.partitionOf).toBeUndefined();
  });
  it('colours the first category from the palette, and its bone edge to match', () => {
    const m = model('n');
    const fb = m.fishbone('e', 'Effect');
    fb.category('c1', 'Alpha');
    const j = m.toJSON();
    const colors = p.node!.colorOf!(j, undefined);
    expect(colors.get('c1')).toBe(BONE_PALETTE[0]);
    const v = compileView(j, { plane: j.planes[0]?.id });
    const bone = v.layoutEdges.find((e) => e.from === 'c1' && e.to === 'e')!;
    expect(p.edge!.colorOf!(bone, j, undefined)).toBe(BONE_PALETTE[0]);
  });
});

describe('threat-model profile', () => {
  const p = notationProfile('threat-model');
  it('is a stencil notation: the registry carries the vocabulary and elk arranges', () => {
    expect(p.id).toBe('threat-model');
    expect(p.className).toBe('dg-notation-tm');
    expect(p.layout).toBeUndefined();
    expect(p.partitionOf).toBeUndefined();
    expect(p.overlay).toBeUndefined();
    expect(NOTATION_PROFILES['threat-model']).toBe(p);
  });

  it('paints trust boundaries red and leaves every other element alone', () => {
    const m = model('tm');
    const tm = m.threatModel();
    const zone = tm.boundary('dmz', 'DMZ');
    zone.contains(tm.process('api', 'API'));
    tm.entity('user', 'User');
    tm.store('db', 'DB');
    const colors = p.node!.colorOf!(m.toJSON(), undefined);
    expect(Object.fromEntries(colors)).toEqual({ dmz: TM_BOUNDARY_COLOR });
  });
});

describe('plan profile', () => {
  function roadmap() {
    const m = model('r');
    const p = m.plan();
    const alice = p.person('alice', 'Alice Ng', { color: '#c33' });
    const bob = p.person('bob', 'Bob');
    const z = p.zone('z', { start: '2026-01-05', end: '2026-01-09' }).executor(bob).owner(alice).checker(alice);
    p.zone('bare', { start: '2026-01-05', end: '2026-01-09' });
    void z;
    return m.toJSON();
  }
  it('owns the layout and the header, pins zones open, sizes events, hides the role kinds', () => {
    const p = notationProfile('plan');
    expect(p.layout).toBe(planLayout);
    expect(p.overlay).toBe('time-axis');
    expect(p.className).toBe('dg-notation-plan');
    expect(p.node?.alwaysExpanded?.({ id: 'z', name: 'Z', type: 'plan-zone' })).toBe(true);
    expect(p.node?.alwaysExpanded?.({ id: 'e', name: 'E', type: 'plan-event' })).toBe(false);
    expect(p.node?.leafSize?.({ id: 'e', name: 'E', type: 'plan-event' })).toEqual({ width: PLAN_LAYOUT.EVENT, height: PLAN_LAYOUT.EVENT });
    expect(p.node?.resizable?.({ id: 'z', name: 'Z', type: 'plan-zone' })).toBe('x');
    expect(p.node?.resizable?.({ id: 'p', name: 'P', type: 'person' })).toBeUndefined();
    for (const k of ['owns', 'executes', 'checks']) expect(p.edge?.hidden?.(k)).toBe(true);
    expect(p.edge?.hidden?.('sync')).toBe(false);
  });
  it('planBadges: one chip per role in owns/executes/checks order, first name, full title, the person\'s colour', () => {
    const chips = planBadges(roadmap(), 'plan');
    expect(chips.get('z')).toEqual([
      { key: 'owns:alice', text: 'O·Alice', title: 'Owner: Alice Ng', color: '#c33' },
      { key: 'executes:bob', text: 'E·Bob', title: 'Executor: Bob' },
      { key: 'checks:alice', text: 'C·Alice', title: 'Checker: Alice Ng', color: '#c33' },
    ]);
    expect(chips.has('bare')).toBe(false);
    expect(notationProfile('plan').node?.badges).toBe(planBadges);
  });
  it('registers the plan types and role kinds with legend labels', () => {
    expect(createTypeRegistry().resolve('plan-zone')).toMatchObject({ shape: 'rounded', legendLabel: 'Zone' });
    expect(createTypeRegistry().resolve('plan-event')).toMatchObject({ shape: 'diamond', defaultSize: { width: PLAN_LAYOUT.EVENT, height: PLAN_LAYOUT.EVENT }, legendLabel: 'Event' });
    expect(DEFAULT_TYPE_STYLES['plan-zone']?.label).toBe('');
    expect(createKindRegistry().resolve('owns').legendLabel).toBe('Owns');
    expect(DEFAULT_KIND_STYLES.checks?.legendLabel).toBe('Checks');
  });
  it('every other profile leaves the new hooks unset', () => {
    for (const id of ['causal-loop', 'git-graph', 'c4', 'second-order', 'fishbone', 'threat-model'] as const) {
      const p = notationProfile(id);
      expect(p.node?.badges).toBeUndefined();
      expect(p.node?.resizable).toBeUndefined();
      expect(p.edge?.hidden).toBeUndefined();
    }
  });
});
