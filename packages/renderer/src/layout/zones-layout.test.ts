import { describe, expect, it } from 'vitest';
import {
  compileView,
  model,
  SM_MACHINE_TYPE,
  SM_ZONE_TYPE,
  type CompiledView,
  type DiagramModel,
  type LayoutDirection,
} from '@diagc/core/internal';
import { layoutView, type NodeGeometry } from './layout';
import { ORDER_LINK_KIND } from './layout-graph';
import { arrangeStateMachines, withZoneOrder } from './state-machine-layout';

/**
 * A refund in three zones. Its transitions pull against the declared order: a
 * failure in `pay` retries inside it, and `review` rejects straight into
 * `closed`, past `pay`.
 */
function refund(): DiagramModel {
  const m = model('z');
  const machine = m.stateMachine('refund');
  const review = machine.zone('review', '1. Review', { note: 'Support decides on the request' });
  const pay = machine.zone('pay', '2. Pay');
  const closed = machine.zone('closed', '3. Closed');
  const submitted = review.state('submitted', 'Submitted');
  const paying = pay.state('paying', 'Paying');
  const failed = pay.state('failed', 'Payment failed', { kind: 'failed' });
  const refunded = closed.state('refunded', 'Refunded');
  const rejected = closed.state('rejected', 'Rejected');
  review.initial().to(submitted);
  machine.transition(submitted, paying, { trigger: 'approve' });
  machine.transition(submitted, rejected, { trigger: 'reject' });
  machine.transition(paying, refunded, { trigger: 'bank confirms' });
  machine.transition(paying, failed, { trigger: 'bank refuses' });
  machine.transition(failed, paying, { trigger: 'retry' });
  return m.toJSON();
}

/** the machine and its zones are always open on the canvas (the registry's alwaysExpanded) */
const open = (m: DiagramModel): CompiledView =>
  compileView(m, {
    pins: Object.fromEntries(
      m.nodes
        .filter((n) => n.type === SM_MACHINE_TYPE || n.type === SM_ZONE_TYPE)
        .map((n) => [n.id, 'expanded' as const]),
    ),
  });

const ZONES = ['review', 'pay', 'closed'] as const;

async function laidOut(m: DiagramModel, direction: LayoutDirection = 'DOWN') {
  const view = open(m);
  const ordered = withZoneOrder(view, m, undefined);
  const result = await layoutView(ordered, undefined, { direction });
  const geometry = arrangeStateMachines(result.geometry, view, m, { direction }) as ReadonlyMap<string, NodeGeometry>;
  return { view, ordered, result, geometry };
}

describe('withZoneOrder', () => {
  it('links each zone to the next, for the layout only', () => {
    const m = refund();
    const view = open(m);
    const ordered = withZoneOrder(view, m, undefined);
    const links = ordered.layoutEdges.filter((e) => e.kind === ORDER_LINK_KIND);
    expect(links.map((e) => [e.from, e.to])).toEqual([
      ['review', 'pay'],
      ['pay', 'closed'],
    ]);
    // never drawn: the drawn edges are the view's own
    expect(ordered.edges).toBe(view.edges);
  });

  it('follows containment order, not node order', () => {
    const m = refund();
    const zoneEdges = m.containment.filter((e) => e.parent === 'refund');
    const rest = m.containment.filter((e) => e.parent !== 'refund');
    const reordered = { ...m, containment: [...zoneEdges.reverse(), ...rest] };
    const ordered = withZoneOrder(open(reordered), reordered, undefined);
    expect(ordered.layoutEdges.filter((e) => e.kind === ORDER_LINK_KIND).map((e) => e.from)).toEqual(['closed', 'pay']);
  });

  it('is the same view back without two zones in one machine', () => {
    const plain = model('p');
    plain.stateMachine('a').state('s', 'S');
    const view = open(plain.toJSON());
    expect(withZoneOrder(view, plain.toJSON(), undefined)).toBe(view);

    const one = model('o');
    one.stateMachine('a').zone('only').state('s', 'S');
    const single = open(one.toJSON());
    expect(withZoneOrder(single, one.toJSON(), undefined)).toBe(single);
  });
});

describe('zones in the layout', () => {
  it('follow each other down the page in declared order, at one width', async () => {
    const { geometry } = await laidOut(refund());
    const boxes = ZONES.map((z) => geometry.get(z)!);
    for (let i = 0; i + 1 < boxes.length; i++) {
      expect(boxes[i]!.y + boxes[i]!.height, `${ZONES[i]} ends before ${ZONES[i + 1]}`).toBeLessThanOrEqual(
        boxes[i + 1]!.y,
      );
    }
    expect(new Set(boxes.map((b) => Math.round(b.x))).size).toBe(1);
    expect(new Set(boxes.map((b) => Math.round(b.width))).size).toBe(1);
  });

  it('follow each other across the page in a RIGHT flow, at one height', async () => {
    const { geometry } = await laidOut(refund(), 'RIGHT');
    const boxes = ZONES.map((z) => geometry.get(z)!);
    for (let i = 0; i + 1 < boxes.length; i++) {
      expect(boxes[i]!.x + boxes[i]!.width).toBeLessThanOrEqual(boxes[i + 1]!.x);
    }
    expect(new Set(boxes.map((b) => Math.round(b.y))).size).toBe(1);
    expect(new Set(boxes.map((b) => Math.round(b.height))).size).toBe(1);
  });

  it('still routes every transition, and leaves each state where the route ends', async () => {
    const { view, result, geometry } = await laidOut(refund());
    for (const e of view.edges) expect(result.routes.get(e.id)?.length ?? 0, e.id).toBeGreaterThan(1);
    // widening a zone moves its near side, never what stands in it: a state's
    // place on the canvas is its zone's plus its own, before and after
    for (const zone of ZONES) {
      const before = result.geometry.get(zone)!;
      const after = geometry.get(zone)!;
      for (const child of view.roots[0]!.children.find((c) => c.id === zone)!.children) {
        const was = result.geometry.get(child.id)!;
        const now = geometry.get(child.id)!;
        expect(after.x + now.x, child.id).toBeCloseTo(before.x + was.x, 3);
        expect(after.y + now.y, child.id).toBeCloseTo(before.y + was.y, 3);
      }
    }
  });

  // elk reads a nested container's minimum with its extents swapped in an upright
  // whole-tree run (layout-graph.ts minimumSize): each direction is held to the
  // width, and to no height the content does not need.
  it.each(['DOWN', 'UP', 'RIGHT', 'LEFT'] as const)(
    'gives a zone the width its note needs, and no height for it, in a %s flow',
    async (direction) => {
      const note = 'A note much longer than the one small state under it would ever be';
      const noted = (text: string | undefined) => {
        const m = model('n');
        const machine = m.stateMachine('a');
        const zone = machine.zone('z', 'Z', text !== undefined ? { note: text } : {});
        const next = machine.zone('y', 'Y');
        const first = zone.state('s', 'S');
        zone.initial().to(first);
        machine.transition(first, next.state('t', 'T'));
        return m.toJSON();
      };
      const wide = (await laidOut(noted(note), direction)).result.geometry.get('z')!;
      const short = (await laidOut(noted('x'), direction)).result.geometry.get('z')!;
      expect(wide.width).toBeGreaterThan(note.length * 4.5);
      expect(wide.height).toBeCloseTo(short.height, 3);
    },
  );

  it('leaves a zone no more room under its states than above the next zone', async () => {
    const { geometry } = await laidOut(refund());
    const closed = geometry.get('closed')!;
    const lowest = Math.max(...['refunded', 'rejected'].map((id) => geometry.get(id)!.y + geometry.get(id)!.height));
    expect(closed.height - lowest).toBeLessThanOrEqual(24);
  });
});
