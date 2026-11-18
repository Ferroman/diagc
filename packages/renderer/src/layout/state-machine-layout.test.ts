import { describe, expect, it } from 'vitest';
import {
  compileView,
  SM_EXIT_TYPE,
  SM_INITIAL_TYPE,
  SM_MACHINE_TYPE,
  SM_REGION_TYPE,
  SM_STATE_TYPE,
  SM_ZONE_TYPE,
  type CompiledView,
  type DiagramModel,
  type ViewNode,
} from '@diagc/core/internal';
import { CONTAINER_PAD as PAD } from './layout-graph';
import type { NodeGeometry } from './layout';
import { arrangeStateMachines, regionSeparators } from './state-machine-layout';

/**
 * Machine `mc` holding the orthogonal state `s`, whose regions are `r1` (holding
 * `a`) and `r2` (holding `b`), plus the exit point `ex`. `regionOrder` is the
 * containment order of the regions; the node list always says r2 first.
 */
function machine(regionOrder: readonly string[] = ['r1', 'r2']): DiagramModel {
  return {
    version: 1,
    id: 'd',
    name: 'd',
    nodes: [
      { id: 'mc', name: 'M', type: SM_MACHINE_TYPE },
      { id: 's', name: 'S', type: SM_STATE_TYPE },
      { id: 'r2', name: 'R2', type: SM_REGION_TYPE },
      { id: 'r1', name: 'R1', type: SM_REGION_TYPE },
      { id: 'a', name: 'A', type: SM_STATE_TYPE },
      { id: 'b', name: 'B', type: SM_STATE_TYPE },
      { id: 'ex', name: 'out', type: SM_EXIT_TYPE },
    ],
    containment: [
      { parent: 'mc', child: 's' },
      ...regionOrder.map((r) => ({ parent: 's', child: r })),
      { parent: 'r1', child: 'a' },
      { parent: 'r2', child: 'b' },
      { parent: 's', child: 'ex' },
    ],
    relations: [],
    layers: [],
    planes: [],
  };
}

const open = (m: DiagramModel): CompiledView =>
  compileView(m, { pins: Object.fromEntries(m.nodes.map((n) => [n.id, 'expanded' as const])) });

/** roughly what elk hands over: the regions out of line, apart and of different sizes */
function laid(): Map<string, NodeGeometry> {
  return new Map([
    ['mc', { x: 0, y: 0, width: 900, height: 500 }],
    ['s', { x: 40, y: 40, width: 700, height: 400 }],
    ['r1', { x: 16, y: 208, width: 400, height: 132 }],
    ['r2', { x: 51, y: 36, width: 300, height: 120 }],
    ['a', { x: 16, y: 36, width: 160, height: 60 }],
    ['b', { x: 16, y: 36, width: 160, height: 60 }],
    ['ex', { x: 600, y: 10, width: 20, height: 20 }],
  ]);
}

const inside = (outer: NodeGeometry, inner: NodeGeometry) =>
  inner.x >= 0 && inner.y >= 0 && inner.x + inner.width <= outer.width && inner.y + inner.height <= outer.height;

/** the absolute top-left of every node in the view, as React Flow would draw it */
function absolute(
  view: CompiledView,
  geometry: ReadonlyMap<string, NodeGeometry>,
): Map<string, { x: number; y: number }> {
  const at = new Map<string, { x: number; y: number }>();
  const walk = (n: ViewNode, ox: number, oy: number) => {
    const g = geometry.get(n.id)!;
    at.set(n.id, { x: ox + g.x, y: oy + g.y });
    n.children.forEach((c) => walk(c, ox + g.x, oy + g.y));
  };
  view.roots.forEach((r) => walk(r, 0, 0));
  return at;
}

describe('arrangeStateMachines', () => {
  it('stacks two regions one above the other in a RIGHT flow', () => {
    const m = machine();
    const out = arrangeStateMachines(laid(), open(m), m, { direction: 'RIGHT' });
    const s = out.get('s')!;
    const r1 = out.get('r1')!;
    const r2 = out.get('r2')!;
    expect(r2.x).toBe(r1.x);
    expect(r2.width).toBe(r1.width);
    expect(r1.y).toBe(PAD.top);
    expect(r2.y).toBe(r1.y + r1.height);
    expect(inside(s, r1) && inside(s, r2)).toBe(true);
    // the regions fill the state along the flow
    expect(r1.x).toBe(PAD.left);
    expect(r1.x + r1.width).toBe(s.width - PAD.right);
    // the children ride along with their region
    expect(out.get('a')).toEqual(laid().get('a'));
    expect(out.get('b')).toEqual(laid().get('b'));
  });

  it('sets two regions side by side in a DOWN flow', () => {
    const m = machine();
    const out = arrangeStateMachines(laid(), open(m), m, { direction: 'DOWN' });
    const s = out.get('s')!;
    const r1 = out.get('r1')!;
    const r2 = out.get('r2')!;
    expect(r2.y).toBe(r1.y);
    expect(r2.height).toBe(r1.height);
    expect(r1.x).toBe(PAD.left);
    expect(r2.x).toBe(r1.x + r1.width);
    expect(inside(s, r1) && inside(s, r2)).toBe(true);
  });

  it('grows the state, and the machine around it, when the stack needs more room', () => {
    const m = machine();
    const g = laid();
    g.set('r1', { x: 16, y: 36, width: 400, height: 300 });
    g.set('r2', { x: 16, y: 36, width: 300, height: 300 });
    const out = arrangeStateMachines(g, open(m), m, { direction: 'RIGHT' });
    const s = out.get('s')!;
    expect(s.height).toBe(PAD.top + 600 + PAD.bottom);
    expect(s).toMatchObject({ x: 40, y: 40, width: 700 }); // grows; never moves or shrinks
    const mc = out.get('mc')!;
    expect(mc.height).toBe(s.y + s.height + PAD.bottom);
    expect(inside(mc, s)).toBe(true);
  });

  it('orders regions by containment, not node order', () => {
    const m = machine(['r2', 'r1']);
    const out = arrangeStateMachines(laid(), open(m), m, { direction: 'RIGHT' });
    expect(out.get('r2')!.y).toBe(PAD.top);
    expect(out.get('r1')!.y).toBe(PAD.top + out.get('r2')!.height);
    // and by the viewed plane's containment only
    const planed: DiagramModel = {
      ...m,
      containment: [
        ...m.containment,
        { parent: 'mc', child: 's', plane: 'b' },
        ...['r1', 'r2'].map((r) => ({ parent: 's', child: r, plane: 'b' })),
        { parent: 'r1', child: 'a', plane: 'b' },
        { parent: 'r2', child: 'b', plane: 'b' },
      ],
      planes: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
    };
    const view = compileView(planed, {
      plane: 'b',
      pins: Object.fromEntries(planed.nodes.map((n) => [n.id, 'expanded' as const])),
    });
    const onB = arrangeStateMachines(laid(), view, planed, { plane: 'b', direction: 'RIGHT' });
    expect(onB.get('r1')!.y).toBe(PAD.top);
  });

  it("snaps an exit point onto its composite's right border", () => {
    const m = machine();
    const g = laid();
    g.set('ex', { x: 660, y: 100, width: 20, height: 20 }); // its centre 30 off the right side, 110 off the top
    const out = arrangeStateMachines(g, open(m), m, { direction: 'RIGHT' });
    const s = out.get('s')!;
    const ex = out.get('ex')!;
    expect(s.x + ex.x + ex.width / 2).toBe(s.x + s.width);
    expect(ex.y).toBe(100);
    // up against a corner: clamped inside the side by the point's own size
    g.set('ex', { x: 688, y: 385, width: 20, height: 20 });
    const cornered = arrangeStateMachines(g, open(m), m, { direction: 'RIGHT' }).get('ex')!;
    expect(cornered.x + cornered.width / 2).toBe(s.width);
    expect(cornered.y + cornered.height / 2).toBe(s.height - cornered.height);
  });

  it('puts a point on the side it was nearest before the state grew', () => {
    const m = machine();
    const g = laid();
    g.set('r1', { x: 16, y: 36, width: 400, height: 300 });
    g.set('r2', { x: 16, y: 36, width: 300, height: 300 });
    g.set('ex', { x: 300, y: 385, width: 20, height: 20 }); // on the bottom of the 400-high box elk drew
    const out = arrangeStateMachines(g, open(m), m, { direction: 'RIGHT' });
    const ex = out.get('ex')!;
    expect(ex.y + ex.height / 2).toBe(out.get('s')!.height); // the grown bottom, not the old one
    expect(ex.x).toBe(300);
  });

  it('moves the regions under their routes: their children no longer stand where they were laid', () => {
    const m = machine();
    const view = open(m);
    const before = absolute(view, laid());
    const after = absolute(view, arrangeStateMachines(laid(), view, m, { direction: 'RIGHT' }));
    // useEdgePath's standingRoute draws a route only while both ends stand at
    // their laid spot; `b`'s region moved, so its edges float
    expect(after.get('b')).not.toEqual(before.get('b'));
  });

  it('leaves a folded composite alone', () => {
    const m = machine();
    const view = compileView(m, { pins: { mc: 'expanded' } }); // `s` rests folded
    const g = new Map([
      ['mc', { x: 0, y: 0, width: 900, height: 500 }],
      ['s', { x: 40, y: 40, width: 160, height: 60 }],
    ]);
    expect(arrangeStateMachines(g, view, m, { direction: 'RIGHT' })).toBe(g);
  });

  it('is the identity on a model with no sm- nodes', () => {
    const m: DiagramModel = {
      ...machine(),
      nodes: machine().nodes.map((n) => ({ ...n, type: 'service' })),
    };
    const g = laid();
    expect(arrangeStateMachines(g, open(m), m, { direction: 'RIGHT' })).toBe(g);
  });
});

describe('regionSeparators', () => {
  it('gives each region after the first a top separator in a RIGHT flow, and the first none', () => {
    const m = machine();
    const seps = regionSeparators(open(m), m, { direction: 'RIGHT' });
    expect(seps.get('r2')).toBe('top');
    expect(seps.has('r1')).toBe(false);
  });

  it('gives it a left separator in a DOWN flow', () => {
    const m = machine();
    const seps = regionSeparators(open(m), m, { direction: 'DOWN' });
    expect(seps.get('r2')).toBe('left');
    expect(seps.has('r1')).toBe(false);
  });

  it('follows containment order, so the first region drawn carries none', () => {
    const m = machine(['r2', 'r1']);
    const seps = regionSeparators(open(m), m, { direction: 'RIGHT' });
    expect(seps.get('r1')).toBe('top');
    expect(seps.has('r2')).toBe(false);
  });

  it('is one shared empty map without regions on show', () => {
    const m = machine();
    const folded = regionSeparators(compileView(m, { pins: { mc: 'expanded' } }), m, { direction: 'RIGHT' });
    expect(folded.size).toBe(0);
    expect(regionSeparators(compileView(m, {}), m, { direction: 'DOWN' })).toBe(folded);
  });
});

describe('arrangeStateMachines: zones', () => {
  /** Machine `mc` with the zones `z1` (holding `a`) and `z2` (holding `b`), and a loose initial `i`. */
  function zonedMachine(): DiagramModel {
    return {
      version: 1,
      id: 'd',
      name: 'd',
      nodes: [
        { id: 'mc', name: 'M', type: SM_MACHINE_TYPE },
        { id: 'z1', name: 'Z1', type: SM_ZONE_TYPE },
        { id: 'z2', name: 'Z2', type: SM_ZONE_TYPE },
        { id: 'a', name: 'A', type: SM_STATE_TYPE },
        { id: 'b', name: 'B', type: SM_STATE_TYPE },
        { id: 'i', name: '', type: SM_INITIAL_TYPE },
      ],
      containment: [
        { parent: 'mc', child: 'z1' },
        { parent: 'mc', child: 'z2' },
        { parent: 'z1', child: 'a' },
        { parent: 'z2', child: 'b' },
        { parent: 'mc', child: 'i' },
      ],
      relations: [],
      layers: [],
      planes: [],
    };
  }
  /** the zones one under the other, out of line and of different widths; the initial above both */
  const down = (initial: NodeGeometry): Map<string, NodeGeometry> =>
    new Map([
      ['mc', { x: 0, y: 0, width: 900, height: 600 }],
      ['z1', { x: 200, y: 100, width: 300, height: 150 }],
      ['z2', { x: 60, y: 300, width: 500, height: 150 }],
      ['a', { x: 16, y: 36, width: 160, height: 60 }],
      ['b', { x: 16, y: 36, width: 160, height: 60 }],
      ['i', initial],
    ]);
  const ABOVE = { x: 300, y: 40, width: 24, height: 24 };

  it('gives the zones one near side and one width in a DOWN flow', () => {
    const m = zonedMachine();
    const out = arrangeStateMachines(down(ABOVE), open(m), m, { direction: 'DOWN' });
    expect(out.get('z1')).toMatchObject({ x: 60, y: 100, width: 500, height: 150 });
    expect(out.get('z2')).toMatchObject({ x: 60, y: 300, width: 500, height: 150 });
  });

  it('leaves what a zone holds where it stood on the canvas', () => {
    const m = zonedMachine();
    const view = open(m);
    const before = absolute(view, down(ABOVE));
    const after = absolute(view, arrangeStateMachines(down(ABOVE), view, m, { direction: 'DOWN' }));
    for (const id of ['a', 'b', 'i']) expect(after.get(id), id).toEqual(before.get(id));
  });

  it('gives them one top and one height in a RIGHT flow', () => {
    const m = zonedMachine();
    const across = new Map<string, NodeGeometry>([
      ['mc', { x: 0, y: 0, width: 900, height: 600 }],
      ['z1', { x: 100, y: 200, width: 150, height: 300 }],
      ['z2', { x: 300, y: 60, width: 150, height: 500 }],
      ['a', { x: 16, y: 36, width: 100, height: 60 }],
      ['b', { x: 16, y: 36, width: 100, height: 60 }],
      ['i', { x: 40, y: 300, width: 24, height: 24 }],
    ]);
    const out = arrangeStateMachines(across, open(m), m, { direction: 'RIGHT' });
    expect(out.get('z1')).toMatchObject({ x: 100, y: 60, width: 150, height: 500 });
    expect(out.get('z2')).toMatchObject({ x: 300, y: 60, width: 150, height: 500 });
  });

  it('stops a zone short of a sibling that stands beside it and is no zone', () => {
    const m = zonedMachine();
    // the initial stands left of z1, level with it: z1 may not run over it
    const beside = { x: 100, y: 150, width: 24, height: 24 };
    const out = arrangeStateMachines(down(beside), open(m), m, { direction: 'DOWN' });
    expect(out.get('z1')!.x).toBe(100 + 24 + 12);
    expect(out.get('z1')!.x + out.get('z1')!.width).toBe(560);
    // z2 shares no stretch of the flow with it, and takes the whole extent
    expect(out.get('z2')).toMatchObject({ x: 60, width: 500 });
  });

  it('leaves a lone zone as the layout drew it', () => {
    const m = zonedMachine();
    const one = { ...m, nodes: m.nodes.filter((n) => n.id !== 'z2' && n.id !== 'b') };
    one.containment = m.containment.filter((e) => e.child !== 'z2' && e.child !== 'b');
    const geometry = down(ABOVE);
    expect(arrangeStateMachines(geometry, open(one), one, { direction: 'DOWN' })).toBe(geometry);
  });
});
