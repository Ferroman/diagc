import { beforeEach, describe, expect, it, vi } from 'vitest';
import { compileView, model } from '@diagc/core';

/**
 * elk stubbed so a chosen algorithm can be made to fail on EVERY graph shape.
 * `radial` does exactly that on real nested diagrams — it rejects the lifted
 * graph ("not a tree") and then blows the JS stack on the flat one — and the
 * real elk needs a specific large diagram to show it. Stubbing keeps the
 * regression deterministic, because the defect under test is ours: the retry
 * used to be unguarded, so the rejection escaped `layoutView`, `DiagramView`'s
 * `.then` never ran, and the canvas silently kept STALE geometry.
 */
const failFor = { algorithm: 'radial' };
vi.mock('elkjs/lib/elk.bundled.js', () => {
  class FakeElk {
    async layout(graph: { layoutOptions?: Record<string, string>; children?: unknown[] }) {
      if (graph.layoutOptions?.['elk.algorithm'] === failFor.algorithm) {
        throw new Error('java.lang.IllegalArgumentException: The given graph is not a tree!');
      }
      let i = 0;
      const place = (n: Record<string, unknown>) => {
        i += 1;
        n['x'] = i * 10;
        n['y'] = i * 20;
        n['width'] = n['width'] ?? 100;
        n['height'] = n['height'] ?? 50;
        (n['children'] as Record<string, unknown>[] | undefined)?.forEach(place);
      };
      (graph.children as Record<string, unknown>[] | undefined)?.forEach(place);
      return graph;
    }
  }
  return { default: FakeElk };
});

const { layoutView } = await import('./layout');

/** A nested diagram with a cycle — the shape every real architecture diagram has. */
function nested(id: string) {
  const m = model(id);
  const a = m.node('a', { type: 'service' });
  const b = m.node('b', { type: 'service' });
  const c = m.node('c', { type: 'service' });
  const sys = m.node('sys', { type: 'system' });
  sys.contains(a, b, c);
  m.relate(a, b, { kind: 'sync' });
  m.relate(b, c, { kind: 'sync' });
  m.relate(c, a, { kind: 'sync' });
  return compileView(m.toJSON(), { focus: ['sys'] });
}

beforeEach(() => {
  failFor.algorithm = 'radial';
});

describe('layoutView degradation', () => {
  it('resolves with a full arrangement when the pick fails on every graph shape', async () => {
    // Before the fix this REJECTED: only the first elk call was guarded, so the
    // flat retry's throw escaped and the canvas froze on whatever it last drew.
    const res = await layoutView(nested('doomed'), undefined, { algorithm: 'radial' });
    for (const id of ['sys', 'a', 'b', 'c']) expect(res.geometry.has(id)).toBe(true);
  });

  it('reports the algorithm it actually used, so the picker can stop lying', async () => {
    const failed = await layoutView(nested('reported'), undefined, { algorithm: 'radial' });
    expect(failed.algorithm).toBe('layered');

    const ok = await layoutView(nested('honest'), undefined, { algorithm: 'force' });
    expect(ok.algorithm).toBe('force');
  });

  it('still surfaces a failure of the default algorithm rather than hiding it', async () => {
    // If even layered cannot lay the graph out there is nothing left to show,
    // and swallowing that would turn a real bug into a silent blank canvas.
    failFor.algorithm = 'layered';
    await expect(layoutView(nested('hopeless'), undefined, {})).rejects.toThrow();
  });
});
