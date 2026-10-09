import { describe, expect, it } from 'vitest';
import { model } from '../builder';
import { validate } from '../validate';
import { addContainment, groupNodes, moveChild, removeContainment } from './containment';
import { upsertPlane } from './layers-and-planes';
import { CommandError } from '../command-error';
import type { DiagramModel } from '../types';

function base(): DiagramModel {
  const m = model('t');
  m.layer('flow', { name: 'Flow', tint: '#0ea5e9' });
  m.plane('arch').plane('infra', { layers: ['flow'] });
  const a = m.node('a', { type: 'service' });
  const b = m.node('b', { type: 'service' });
  const sys = m.node('sys', { type: 'system' });
  sys.contains(a, b);
  m.relate(a, b, { kind: 'sync', label: 'call' });
  m.relate(a, b, { kind: 'flow', layer: 'flow' });
  return m.toJSON();
}

describe('containment mutations', () => {
  it('containment add/remove respects planes and rejects cycles', () => {
    let m = addContainment(base(), { parent: 'sys', child: 'a', plane: 'infra' }); // same pair, other plane: ok
    expect(m.containment.filter((e) => e.parent === 'sys' && e.child === 'a')).toHaveLength(2);
    m = addContainment(m, { parent: 'sys', child: 'a' }); // dedupe in default plane
    expect(m.containment.filter((e) => e.parent === 'sys' && e.child === 'a' && e.plane === undefined)).toHaveLength(1);
    expect(() => addContainment(m, { parent: 'a', child: 'sys' })).toThrowError(CommandError); // arch cycle
    const m2 = addContainment(base(), { parent: 'a', child: 'sys', plane: 'infra' }); // opposite direction in another plane: legal
    expect(validate(m2)).toEqual([]);
    const m3 = removeContainment(base(), { parent: 'sys', child: 'a' });
    expect(m3.containment.some((e) => e.child === 'a' && e.plane === undefined)).toBe(false);
  });

  it('groupNodes adds the parent node and nests each member', () => {
    const grouped = groupNodes(base(), { id: 'grp', name: 'Dev work time' }, ['a', 'b']);
    expect(grouped.nodes.find((n) => n.id === 'grp')).toMatchObject({ id: 'grp', name: 'Dev work time' });
    expect(grouped.containment).toEqual(
      expect.arrayContaining([
        { parent: 'grp', child: 'a' },
        { parent: 'grp', child: 'b' },
      ]),
    );
  });

  it('groupNodes plane-tags the containment edges when a plane is given', () => {
    const grouped = groupNodes(base(), { id: 'grp', name: 'G', plane: 'infra' }, ['a'], 'infra');
    expect(grouped.containment).toEqual(expect.arrayContaining([{ parent: 'grp', child: 'a', plane: 'infra' }]));
  });

  it('groupNodes rejects an unknown member (and does not half-apply)', () => {
    expect(() => groupNodes(base(), { id: 'grp', name: 'G' }, ['a', 'nope'])).toThrow(CommandError);
  });

  it('groupNodes rejects a duplicate parent id', () => {
    expect(() => groupNodes(base(), { id: 'a', name: 'G' }, ['b'])).toThrow(CommandError);
  });

  it('canonicalizes plane args in containment helpers', () => {
    // explicit first-plane id dedupes against the untagged edge
    const dedup = addContainment(base(), { parent: 'sys', child: 'a', plane: 'arch' });
    expect(dedup.containment.filter((e) => e.parent === 'sys' && e.child === 'a')).toHaveLength(1);
    expect(dedup.containment.find((e) => e.parent === 'sys' && e.child === 'a')?.plane).toBeUndefined();

    // a borrowed plane (containmentOf the first plane) lands on the base plane
    const borrowed = upsertPlane(base(), { id: 'flow-view', name: 'Flow', containmentOf: 'arch' });
    const onBorrow = addContainment(borrowed, { parent: 'a', child: 'b', plane: 'flow-view' });
    expect(onBorrow.containment.find((e) => e.parent === 'a' && e.child === 'b')?.plane).toBeUndefined();

    // removeContainment with the first-plane id removes the untagged edge
    const removed = removeContainment(base(), { parent: 'sys', child: 'a', plane: 'arch' });
    expect(removed.containment.some((e) => e.parent === 'sys' && e.child === 'a')).toBe(false);
  });

  // The builder's OWN addContainment (used by ZoneBuilder etc., not the one
  // tested here) tags every edge with its plane literally, even when
  // that plane is the only one declared (builder.test.ts § plan: "tags
  // containment with the plan plane even when it is the only plane") — so a
  // plan model arrives with `{ parent, child, plane: 'plan' }` where 'plan'
  // IS the default (first-declared) plane. A command's own plane argument
  // canonicalizes to undefined for that same plane (canonicalPlane), so
  // comparing `e.plane === canon` directly never matched the builder's own
  // edge. Resolve both sides the same way reads already do (`e.plane ??
  // defaultPlane`) before comparing.
  describe('containment plane comparison resolves a builder-tagged default-plane edge', () => {
    // q > e, tagged { plane: 'plan' } by the builder — 'plan' is the ONLY
    // (hence default) plane here, same shape as examples/plan/starter
    function planModel(): DiagramModel {
      const m = model('solo');
      const p = m.plan();
      const q = p.zone('q', { start: '2026-01-05', end: '2026-01-09' });
      q.event('e', { at: '2026-01-06' });
      return m.toJSON();
    }

    it('is removed by a command carrying the default plane id', () => {
      const m = planModel();
      expect(m.containment).toEqual([{ parent: 'q', child: 'e', plane: 'plan' }]);
      expect(removeContainment(m, { parent: 'q', child: 'e', plane: 'plan' }).containment).toEqual([]);
    });

    it('is removed by a command carrying no plane at all', () => {
      const m = planModel();
      expect(removeContainment(m, { parent: 'q', child: 'e' }).containment).toEqual([]);
    });

    it('adding the same edge again, in either form, is a no-op — no duplicate', () => {
      const m = planModel();
      expect(addContainment(m, { parent: 'q', child: 'e', plane: 'plan' }).containment).toEqual(m.containment);
      expect(addContainment(m, { parent: 'q', child: 'e' }).containment).toEqual(m.containment);
    });

    it('an edge on a non-default plane is untouched by a default-plane remove', () => {
      // 'plan' declared SECOND here (after 'arch'), so it is not the default —
      // the builder still tags its containment with 'plan' regardless (the
      // plan plane names its own edges "so the plan need not be the first
      // plane declared" — builder.ts's own ZoneBuilder doc comment)
      const m2 = model('two');
      m2.plane('arch');
      const p = m2.plan();
      const q = p.zone('q', { start: '2026-01-05', end: '2026-01-09' });
      q.event('e', { at: '2026-01-06' });
      const json = m2.toJSON();
      expect(json.containment).toEqual([{ parent: 'q', child: 'e', plane: 'plan' }]);
      // no plane on the command → canon resolves to 'arch' (the actual
      // default here), which must not match an edge tagged 'plan'
      expect(removeContainment(json, { parent: 'q', child: 'e' }).containment).toEqual(json.containment);
    });

    it('a new edge can go beside it', () => {
      const m = planModel();
      const withNode = { ...m, nodes: [...m.nodes, { id: 'n', name: 'N' }] };
      expect(
        addContainment(withNode, { parent: 'q', child: 'n' }, { sibling: 'e', side: 'after' }).containment,
      ).toEqual([
        { parent: 'q', child: 'e', plane: 'plan' },
        { parent: 'q', child: 'n' },
      ]);
    });
  });
});

describe('moveChild', () => {
  /** frame f ⊃ lanes a, b, c, in that order */
  function lanes(): DiagramModel {
    const m = model('t');
    const f = m.activity('f', { name: 'Frame' });
    for (const id of ['a', 'b', 'c']) f.lane(id, { name: id.toUpperCase() });
    return m.toJSON();
  }
  const order = (m: DiagramModel) => m.containment.filter((e) => e.parent === 'f').map((e) => e.child);

  it('swaps a child with the sibling before or after it', () => {
    expect(order(moveChild(lanes(), { parent: 'f', child: 'b' }, -1))).toEqual(['b', 'a', 'c']);
    expect(order(moveChild(lanes(), { parent: 'f', child: 'b' }, 1))).toEqual(['a', 'c', 'b']);
  });

  it('leaves the model untouched at either end', () => {
    const m = lanes();
    expect(moveChild(m, { parent: 'f', child: 'a' }, -1)).toBe(m);
    expect(moveChild(m, { parent: 'f', child: 'c' }, 1)).toBe(m);
  });

  it('skips containment entries under other parents', () => {
    const m = lanes();
    // an unrelated entry between a and b in the array must not count as a sibling
    const containment = [...m.containment];
    const bAt = containment.findIndex((e) => e.parent === 'f' && e.child === 'b');
    containment.splice(bAt, 0, { parent: 'x', child: 'y' });
    const moved = moveChild({ ...m, containment }, { parent: 'f', child: 'b' }, -1);
    expect(order(moved)).toEqual(['b', 'a', 'c']);
    expect(moved.containment).toContainEqual({ parent: 'x', child: 'y' });
  });

  it('only reorders within the given plane', () => {
    const m = model('t');
    m.plane('arch').plane('infra');
    m.node('p');
    for (const id of ['a', 'b']) m.node(id);
    const json = m.toJSON();
    const containment = [
      { parent: 'p', child: 'a' },
      { parent: 'p', child: 'b', plane: 'infra' },
      { parent: 'p', child: 'b' },
    ];
    const moved = moveChild({ ...json, containment }, { parent: 'p', child: 'b' }, -1);
    expect(moved.containment).toEqual([
      { parent: 'p', child: 'b' },
      { parent: 'p', child: 'b', plane: 'infra' },
      { parent: 'p', child: 'a' },
    ]);
  });

  it('rejects a child the parent does not contain', () => {
    expect(() => moveChild(lanes(), { parent: 'f', child: 'zz' }, 1)).toThrow(CommandError);
  });
});
