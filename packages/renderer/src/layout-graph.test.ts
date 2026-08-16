import { describe, expect, it } from 'vitest';
import { compileView, model } from '@diagramming/core';
import { liftEdges } from './layout-graph';

/**
 * Two containers, two leaves each, and one relation of every shape that matters:
 * inside a container, across two containers (twice, so the no-dedupe rule is
 * observable), and from a container to its own child (which must drop).
 */
function crossing() {
  const m = model('x');
  const a = m.node('a', { type: 'service' });
  const b = m.node('b', { type: 'service' });
  const c = m.node('c', { type: 'service' });
  const d = m.node('d', { type: 'service' });
  const left = m.node('left', { type: 'system' });
  const right = m.node('right', { type: 'system' });
  left.contains(a, b);
  right.contains(c, d);
  m.relate(a, b, { kind: 'sync' }); // inside left
  m.relate(a, c, { kind: 'sync' }); // left → right
  m.relate(b, d, { kind: 'sync' }); // left → right again
  m.relate(left, a, { kind: 'sync' }); // container → own child: must drop
  return m.toJSON();
}

const expanded = () => compileView(crossing(), { focus: ['left', 'right'] });
const allLifted = (byOwner: Map<string | null, { id: string }[]>) =>
  [...byOwner.values()].flat();

describe('liftEdges', () => {
  it('keeps a same-parent edge on that parent, endpoints unchanged', () => {
    const own = liftEdges(expanded()).get('left') ?? [];
    expect(own).toHaveLength(1);
    expect(own[0]!.sources).toEqual(['a']);
    expect(own[0]!.targets).toEqual(['b']);
  });

  it('raises cross-container edges to the root, endpoints becoming the containers', () => {
    const root = liftEdges(expanded()).get(null) ?? [];
    expect(root).toHaveLength(2);
    for (const e of root) {
      expect(e.sources).toEqual(['left']);
      expect(e.targets).toEqual(['right']);
    }
  });

  it('does NOT dedupe two relations that raise to the same pair', () => {
    // Deliberate: elk's force treats a repeated edge as extra pull, so two
    // subtrees joined twice sit closer than two joined once. The measured
    // crossing improvement in the design note comes from a non-deduped run.
    const root = liftEdges(expanded()).get(null) ?? [];
    expect(new Set(root.map((e) => e.id)).size).toBe(2);
  });

  it('preserves the original edge id so callers can correlate', () => {
    const view = expanded();
    const original = view.layoutEdges.find((e) => e.from === 'a' && e.to === 'b')!;
    expect((liftEdges(view).get('left') ?? [])[0]!.id).toBe(original.id);
  });

  it('drops an edge from a container to its own descendant (it would self-loop)', () => {
    const view = expanded();
    const containerToChild = view.layoutEdges.find((e) => e.from === 'left' && e.to === 'a')!;
    const lifted = allLifted(liftEdges(view));
    // 4 relations in, 3 lifted out — left → a raises to left → left, which elk
    // rejects and which constrains nothing.
    expect(lifted).toHaveLength(3);
    expect(lifted.map((e) => e.id)).not.toContain(containerToChild.id);
  });

  it('puts every edge on the root when nothing is expanded', () => {
    const byOwner = liftEdges(compileView(crossing(), {}));
    expect([...byOwner.keys()].every((k) => k === null)).toBe(true);
  });
});
