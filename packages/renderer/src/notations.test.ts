import { describe, expect, it } from 'vitest';
import {
  compileView,
  model,
  NODE_TYPES,
  NOTATION_NODE_TYPES,
  NOTATION_RELATION_KINDS,
  RELATION_KINDS,
} from '@diagc/core/internal';
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
    expect(p.node?.leafSize?.({ id: 'c', name: '', type: 'commit' })).toEqual({
      width: GIT_LAYOUT.DIAMETER,
      height: GIT_LAYOUT.DIAMETER,
    });
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

describe('default algorithm', () => {
  it('is stress for a causal loop, and unset for every other notation', () => {
    expect(notationProfile('causal-loop').defaultAlgorithm).toBe('stress');
    for (const [id, p] of Object.entries(NOTATION_PROFILES)) {
      if (id !== 'causal-loop') expect(p.defaultAlgorithm, id).toBeUndefined();
    }
    expect(notationProfile().defaultAlgorithm).toBeUndefined();
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
    expect(Object.fromEntries(colors)).toEqual({
      good: 'var(--dg-polarity-positive)',
      bad: 'var(--dg-polarity-negative)',
    });
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

describe('deployment profile', () => {
  const p = notationProfile('deployment');
  it('is a stencil notation: the registry carries the vocabulary and elk arranges', () => {
    expect(p.id).toBe('deployment');
    expect(p.className).toBe('dg-notation-deploy');
    expect(p.layout).toBeUndefined();
    expect(p.partitionOf).toBeUndefined();
    expect(p.overlay).toBeUndefined();
    expect(NOTATION_PROFILES.deployment).toBe(p);
  });

  it('colours every zone by its type and leaves the nodes inside alone', () => {
    const m = model('d');
    const vpc = m.node('vpc', { name: 'VPC', type: 'deploy-network' });
    const priv = m.node('priv', { name: 'Private', type: 'deploy-subnet-private' });
    const vm = m.node('vm', { name: 'VM', type: 'c4-deployment-node' });
    vpc.contains(priv);
    priv.contains(vm);
    vm.contains(m.node('api', { name: 'API', type: 'deploy-service' }));
    m.node('db', { name: 'DB', type: 'deploy-database' });
    expect(Object.fromEntries(p.node!.colorOf!(m.toJSON(), undefined))).toEqual({
      vpc: 'var(--dg-deploy-network)',
      priv: 'var(--dg-deploy-subnet-private)',
      vm: 'var(--dg-deploy-host)',
    });
  });

  it('draws a C4 deployment node as a solid host, keeping the rest of its stencil', () => {
    expect(p.typeStyles?.['c4-deployment-node']).toEqual({
      ...DEFAULT_TYPE_STYLES['c4-deployment-node'],
      icon: 'server',
      dashed: false,
    });
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
    expect(p.node?.leafSize?.({ id: 'e', name: 'E', type: 'plan-event' })).toEqual({
      width: PLAN_LAYOUT.EVENT,
      height: PLAN_LAYOUT.EVENT,
    });
    expect(p.node?.resizable?.({ id: 'z', name: 'Z', type: 'plan-zone' })).toBe('x');
    expect(p.node?.resizable?.({ id: 'p', name: 'P', type: 'person' })).toBeUndefined();
    for (const k of ['owns', 'executes', 'checks']) expect(p.edge?.hidden?.(k)).toBe(true);
    expect(p.edge?.hidden?.('sync')).toBe(false);
  });
  it("planBadges: one chip per role in owns/executes/checks order, first name, full title, the person's colour", () => {
    const chips = planBadges(roadmap(), 'plan');
    expect(chips.get('z')).toEqual([
      { key: 'owns:alice', text: 'O·Alice', title: 'Owner: Alice Ng', color: '#c33' },
      { key: 'executes:bob', text: 'E·Bob', title: 'Executor: Bob' },
      { key: 'checks:alice', text: 'C·Alice', title: 'Checker: Alice Ng', color: '#c33' },
    ]);
    expect(chips.has('bare')).toBe(false);
    expect(notationProfile('plan').node?.badges).toBe(planBadges);
  });
  it('planBadges: a team holds a role exactly like a person, same chip shape', () => {
    const m = model('t');
    const p = m.plan();
    const platform = p.team('platform', 'Platform Team', { color: '#2f6fed' });
    p.zone('z', { start: '2026-01-05', end: '2026-01-09' }).owner(platform);
    const chips = planBadges(m.toJSON(), 'plan');
    expect(chips.get('z')).toEqual([
      { key: 'owns:platform', text: 'O·Platform', title: 'Owner: Platform Team', color: '#2f6fed' },
    ]);
  });
  it('registers the plan types and role kinds with legend labels', () => {
    expect(createTypeRegistry().resolve('plan-zone')).toMatchObject({ shape: 'rounded', legendLabel: 'Zone' });
    expect(createTypeRegistry().resolve('plan-event')).toMatchObject({
      shape: 'diamond',
      defaultSize: { width: PLAN_LAYOUT.EVENT, height: PLAN_LAYOUT.EVENT },
      legendLabel: 'Event',
    });
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
  it("lets every fixed node be dragged: a zone/event/free-form child's gesture becomes days or a clamped drop, an actor's is read for drop-to-assign", () => {
    const p = notationProfile('plan');
    expect(p.node?.draggableWhenFixed?.({ id: 'z', name: 'Z', type: 'plan-zone' })).toBe(true);
    expect(p.node?.draggableWhenFixed?.({ id: 'e', name: 'E', type: 'plan-event' })).toBe(true);
    expect(p.node?.draggableWhenFixed?.({ id: 'o', name: 'O', type: 'service' })).toBe(true);
    expect(p.node?.draggableWhenFixed?.({ id: 'p', name: 'P', type: 'person' })).toBe(true);
    expect(p.node?.draggableWhenFixed?.({ id: 't', name: 'T', type: 'team' })).toBe(true);
    expect(notationProfile('fishbone').node?.draggableWhenFixed).toBeUndefined();
  });
  it('names zones as drop targets and actors as always snapping back', () => {
    const p = notationProfile('plan');
    expect(p.node?.dropTarget?.({ id: 'z', name: 'Z', type: 'plan-zone' })).toBe(true);
    expect(p.node?.dropTarget?.({ id: 'e', name: 'E', type: 'plan-event' })).toBe(false);
    expect(p.node?.dropTarget?.({ id: 'p', name: 'P', type: 'person' })).toBe(false);
    expect(p.node?.snapsBack?.({ id: 'p', name: 'P', type: 'person' })).toBe(true);
    expect(p.node?.snapsBack?.({ id: 't', name: 'T', type: 'team' })).toBe(true);
    expect(p.node?.snapsBack?.({ id: 'z', name: 'Z', type: 'plan-zone' })).toBe(false);
    for (const id of ['causal-loop', 'git-graph', 'c4', 'second-order', 'fishbone', 'threat-model'] as const) {
      const other = notationProfile(id);
      expect(other.node?.dropTarget).toBeUndefined();
      expect(other.node?.snapsBack).toBeUndefined();
    }
  });
  it('says which nodes a drag may drop: actors and plain boxes, never a zone or an event — nested or not', () => {
    const p = notationProfile('plan');
    expect(p.node?.canDrop?.({ id: 'p', name: 'P', type: 'person' })).toBe(true);
    expect(p.node?.canDrop?.({ id: 't', name: 'T', type: 'team' })).toBe(true);
    expect(p.node?.canDrop?.({ id: 'o', name: 'O', type: 'service' })).toBe(true);
    expect(p.node?.canDrop?.({ id: 'z', name: 'Z', type: 'plan-zone' })).toBe(false);
    expect(p.node?.canDrop?.({ id: 'e', name: 'E', type: 'plan-event' })).toBe(false);
    for (const id of ['causal-loop', 'git-graph', 'c4', 'second-order', 'fishbone', 'threat-model'] as const) {
      expect(notationProfile(id).node?.canDrop).toBeUndefined();
    }
  });
  it('only the plan opts its layout into saved positions — git-graph and fishbone own a layout too but never read them', () => {
    expect(notationProfile('plan').layoutReadsPositions).toBe(true);
    expect(notationProfile('git-graph').layoutReadsPositions).toBeUndefined();
    expect(notationProfile('fishbone').layoutReadsPositions).toBeUndefined();
  });
  it("related: an actor's zones, a zone's actors, nothing for anything else", () => {
    const m = roadmap();
    const related = notationProfile('plan').related!;
    expect(related(m, 'plan', 'alice')).toEqual(['z', 'z']); // owns and checks, both on z
    expect(related(m, 'plan', 'bob')).toEqual(['z']); // executes
    expect(related(m, 'plan', 'z')).toEqual(['alice', 'bob', 'alice']); // owns, executes, checks order
    expect(related(m, 'plan', 'bare')).toEqual([]); // a zone with no roles
    expect(related(m, 'plan', 'nope')).toEqual([]); // an id the model does not have
  });
});

describe("core's vocabulary", () => {
  // The lint (core) cannot read this registry, so it keeps its own list of ids;
  // a new style with no vocabulary entry would be reported as a typo.
  it('lists exactly the registered types and kinds', () => {
    expect([...NODE_TYPES].sort()).toEqual(Object.keys(DEFAULT_TYPE_STYLES).sort());
    expect([...RELATION_KINDS].sort()).toEqual(Object.keys(DEFAULT_KIND_STYLES).sort());
  });

  it('lists what each notation profile adds on top', () => {
    for (const [id, profile] of Object.entries(NOTATION_PROFILES)) {
      const key = id as keyof typeof NOTATION_NODE_TYPES;
      const types = Object.keys(profile.typeStyles ?? {}).filter((t) => !NODE_TYPES.includes(t));
      const kinds = Object.keys(profile.kindStyles ?? {}).filter((k) => !RELATION_KINDS.includes(k));
      expect([id, types.sort()]).toEqual([id, [...(NOTATION_NODE_TYPES[key] ?? [])].sort()]);
      expect([id, kinds.sort()]).toEqual([id, [...(NOTATION_RELATION_KINDS[key] ?? [])].sort()]);
    }
  });
});
