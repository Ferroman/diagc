import { describe, expect, it } from 'vitest';
import { compileView, FB_CAUSE_OF_KIND, model, type CompiledView, type DiagramModel } from '@diagramming/core';
import { textWidth } from './box-size';
import { BONE_PALETTE, FISHBONE_LAYOUT, fishboneEdgeColor, fishboneLayout, fishboneNodeColors } from './fishbone-layout';

const { BONE_K, ROW, TEXT_H, TEXT_PAD, FONT_PX, HEAD_FONT_PX, SUB_RISE, SUB_GAP, SUB_INSET, MIN_LINE, LABEL_W, LABEL_H, HEAD_H, HEAD_MIN_W, HEAD_PAD, HEAD_GAP, MARGIN, COLUMN_GAP } = FISHBONE_LAYOUT;
const w = (text: string) => Math.ceil(textWidth(text, FONT_PX)) + 2 * TEXT_PAD;

/** effect E; c1 (above): a (subs a1, a2), b; c2 (below): d; c3 (above, second column): no causes */
function fish(): DiagramModel {
  const m = model('f');
  const fb = m.fishbone('e', 'Effect');
  const c1 = fb.category('c1', 'Alpha');
  const a = c1.cause('a', 'Cause a');
  a.cause('a1', 'sub one');
  a.cause('a2', 'sub two');
  c1.cause('b', 'Cause b');
  fb.category('c2', 'Beta', { color: '#123456' }).cause('d', 'Cause d');
  fb.category('c3', 'Gamma');
  return m.toJSON();
}
const view = (m: DiagramModel): CompiledView => compileView(m, { plane: m.planes[0]?.id });
const routeOf = (v: CompiledView, r: ReturnType<typeof fishboneLayout>, from: string, to: string) => {
  const e = v.layoutEdges.find((x) => x.from === from && x.to === to);
  if (e === undefined) throw new Error(`no edge ${from} -> ${to}`);
  const route = r.routes.get(e.id);
  if (route === undefined) throw new Error(`no route ${from} -> ${to}`);
  return route;
};
// The layout and these derivations add the same terms in a different order, so
// compare to 6 places rather than bit for bit.
const near = (actual: object | undefined, expected: Record<string, number>) => {
  expect(actual).toBeDefined();
  const got = actual as Record<string, number>; // NodeGeometry / EdgePoint have no index signature
  for (const [k, v] of Object.entries(expected)) expect(got[k], k).toBeCloseTo(v, 6);
};

// Side c1, relative to its join: a has subs, b has none.
const pitchA = ROW + SUB_RISE + TEXT_H;
const pitchB = ROW;
const H1 = pitchA + pitchB + ROW;
const hA = H1 - pitchA;
const hB = hA - pitchB;
const lineA = Math.max(MIN_LINE, SUB_INSET + (w('sub one') + SUB_GAP) + (w('sub two') + SUB_GAP) + BONE_K * SUB_RISE);

describe('fishboneLayout', () => {
  it('stacks causes down the bone from the category box, the bone reaching the spine', () => {
    const m = fish();
    const r = fishboneLayout(view(m), m, undefined);
    expect(r.algorithm).toBe('fishbone');
    const H2 = ROW + ROW; // c2: one bare cause
    const spineY = MARGIN + LABEL_H + H1; // c1 is the taller top side (c3 is bare: H = 2·ROW)
    // column 1 = c1 (above) + c2 (below); its join is MARGIN + the wider side's reach left
    const bxA = -BONE_K * hA;
    const leftA = bxA - lineA - w('Cause a');
    const leftA2 = bxA - SUB_INSET - (w('sub one') + SUB_GAP) - BONE_K * SUB_RISE - w('sub two');
    const leftLabel1 = -BONE_K * H1 - LABEL_W / 2;
    const bxB = -BONE_K * hB;
    const leftB = bxB - MIN_LINE - w('Cause b');
    const left1 = Math.min(leftA, leftA2, leftLabel1, leftB);
    const hD = H2 - ROW;
    const left2 = Math.min(-BONE_K * hD - MIN_LINE - w('Cause d'), -BONE_K * H2 - LABEL_W / 2);
    const join1 = MARGIN + Math.max(-left1, -left2);
    near(r.geometry.get('c1'), { x: join1 - BONE_K * H1 - LABEL_W / 2, y: spineY - H1 - LABEL_H, width: LABEL_W, height: LABEL_H });
    near(r.geometry.get('a'), { x: join1 + leftA, y: spineY - hA - TEXT_H / 2, width: w('Cause a'), height: TEXT_H });
    near(r.geometry.get('b'), { x: join1 + leftB, y: spineY - hB - TEXT_H / 2, width: w('Cause b'), height: TEXT_H });
    // the mirror image below the spine
    near(r.geometry.get('c2'), { x: join1 - BONE_K * H2 - LABEL_W / 2, y: spineY + H2, width: LABEL_W, height: LABEL_H });
    near(r.geometry.get('d'), { x: join1 - BONE_K * hD - MIN_LINE - w('Cause d'), y: spineY + hD - TEXT_H / 2, width: w('Cause d'), height: TEXT_H });
  });

  it('puts sub-cause texts in the row away from the spine, spaced along the cause line', () => {
    const m = fish();
    const r = fishboneLayout(view(m), m, undefined);
    const a = r.geometry.get('a')!;
    const a1 = r.geometry.get('a1')!;
    const a2 = r.geometry.get('a2')!;
    const spineY = MARGIN + LABEL_H + H1;
    const lineY = spineY - hA;
    const bxA = a.x + a.width + lineA;
    expect(a1.y + a1.height).toBeCloseTo(lineY - SUB_RISE);
    expect(a1.x + a1.width).toBeCloseTo(bxA - SUB_INSET - BONE_K * SUB_RISE);
    expect(a2.x + a2.width).toBeCloseTo(a1.x - SUB_GAP);
    expect(a2.y).toBe(a1.y);
    // the cause text ends a gap short of the leftmost sub text
    expect(a.x + a.width).toBeCloseTo(a2.x - SUB_GAP);
  });

  it('routes each bone, line and tick to where its parent passes, arrowhead end last', () => {
    const m = fish();
    const v = view(m);
    const r = fishboneLayout(v, m, undefined);
    const spineY = MARGIN + LABEL_H + H1;
    const c1 = r.geometry.get('c1')!;
    const join1 = c1.x + LABEL_W / 2 + BONE_K * H1;
    const bone = routeOf(v, r, 'c1', 'e');
    expect(bone).toHaveLength(2);
    near(bone[0], { x: c1.x + LABEL_W / 2, y: spineY - H1 });
    near(bone[1], { x: join1, y: spineY });
    const a = r.geometry.get('a')!;
    const line = routeOf(v, r, 'a', 'c1');
    near(line[0], { x: a.x + a.width, y: spineY - hA });
    near(line[1], { x: a.x + a.width + lineA, y: spineY - hA });
    const a1 = r.geometry.get('a1')!;
    const tick = routeOf(v, r, 'a1', 'a');
    near(tick[0], { x: a1.x + a1.width, y: a1.y + a1.height });
    near(tick[1], { x: a1.x + a1.width + BONE_K * SUB_RISE, y: spineY - hA });
    near(routeOf(v, r, 'c2', 'e')[1], { x: join1, y: spineY }); // a column's two bones share the join
    expect(r.labelSpots.size).toBe(0);
  });

  it('lays columns left to right and spans the effect across the spine into the head', () => {
    const m = fish();
    const r = fishboneLayout(view(m), m, undefined);
    const spineY = MARGIN + LABEL_H + H1;
    const c3 = r.geometry.get('c3')!;
    const H3 = 2 * ROW;
    const join3 = c3.x + LABEL_W / 2 + BONE_K * H3;
    // c3's column starts one gap past column 1's right edge (its join, or a label box that overhangs it)
    const c1 = r.geometry.get('c1')!;
    const c2 = r.geometry.get('c2')!;
    const join1 = c1.x + LABEL_W / 2 + BONE_K * H1;
    const right1 = Math.max(join1, c1.x + LABEL_W, c2.x + LABEL_W);
    // column 2 starts a gap past that; its only side is a bare bone whose box reaches LABEL_W/2 + BONE_K·H3 left of its join
    expect(join3).toBeCloseTo(right1 + COLUMN_GAP + LABEL_W / 2 + BONE_K * H3, 6);
    const right3 = Math.max(join3, c3.x + LABEL_W);
    const headW = Math.max(HEAD_MIN_W, Math.ceil(textWidth('Effect', HEAD_FONT_PX)) + 2 * HEAD_PAD);
    near(r.geometry.get('e'), { x: MARGIN, y: spineY - HEAD_H / 2, width: right3 + HEAD_GAP + headW - MARGIN, height: HEAD_H });
  });

  it('measures the head in its own (larger) font, not a cause line\'s', () => {
    // Long enough that under-measuring it at FONT_PX (12) would fit under
    // HEAD_MIN_W and mask the bug; measured correctly at HEAD_FONT_PX (14) it
    // must exceed HEAD_MIN_W, so this test is known to exercise that branch.
    const name = 'Checkout outage on release day after the payment gateway upgrade';
    const headW = Math.ceil(textWidth(name, HEAD_FONT_PX)) + 2 * HEAD_PAD;
    expect(headW).toBeGreaterThan(HEAD_MIN_W);
    const m = model('f');
    const fb = m.fishbone('e', name);
    fb.category('c', 'Code').cause('a', 'A cause');
    const j = m.toJSON();
    const r = fishboneLayout(view(j), j, undefined);
    const c = r.geometry.get('c')!;
    const H = 2 * ROW; // one bare cause
    const join = c.x + LABEL_W / 2 + BONE_K * H;
    const lastRight = Math.max(join, c.x + LABEL_W);
    expect(r.geometry.get('e')!.width).toBeCloseTo(lastRight + HEAD_GAP + headW - MARGIN, 6);
  });

  it('draws an effect alone as a head with a short spine', () => {
    const m = model('f');
    m.fishbone('e', 'Effect');
    const j = m.toJSON();
    const r = fishboneLayout(view(j), j, undefined);
    const headW = Math.max(HEAD_MIN_W, Math.ceil(textWidth('Effect', HEAD_FONT_PX)) + 2 * HEAD_PAD);
    expect(r.geometry.get('e')).toEqual({ x: MARGIN, y: MARGIN, width: HEAD_GAP + headW, height: HEAD_H });
    expect(r.routes.size).toBe(0);
  });

  it('parks whatever is off the fish in a row beneath it, and never throws on a headless model', () => {
    const m = fish();
    const j: DiagramModel = {
      ...m,
      nodes: [...m.nodes, { id: 'loose', name: 'Loose cause', type: 'fb-cause' }, { id: 'note', name: 'A note' }],
    };
    const r = fishboneLayout(view(j), j, undefined);
    const c2 = r.geometry.get('c2')!; // the only bottom side: its box's bottom edge is the fish's
    const rowY = c2.y + LABEL_H + MARGIN;
    near(r.geometry.get('loose'), { x: MARGIN, y: rowY, width: w('Loose cause'), height: TEXT_H });
    near(r.geometry.get('note'), { x: MARGIN + w('Loose cause') + COLUMN_GAP, y: rowY });
    const headless: DiagramModel = { ...j, nodes: j.nodes.filter((n) => n.id !== 'e'), relations: j.relations.filter((x) => x.to !== 'e') };
    const h = fishboneLayout(view(headless), headless, undefined);
    expect(h.geometry.size).toBe(headless.nodes.length);
    expect(h.routes.size).toBe(0);
    expect(r.geometry.get('loose')!.y).toBeGreaterThan(c2.y); // and with a head, the row is under the fish
  });

  it('sizes a stray from its size hint when given one, and from its type fallback otherwise', () => {
    const m = fish();
    const j: DiagramModel = {
      ...m,
      nodes: [...m.nodes, { id: 'loose', name: 'Loose cause', type: 'fb-cause' }, { id: 'other', name: 'Other cause', type: 'fb-cause' }],
    };
    const hinted = fishboneLayout(view(j), j, undefined, new Map([['loose', { width: 200, height: 50 }]]));
    expect(hinted.geometry.get('loose')).toMatchObject({ width: 200, height: 50 });
    // the un-hinted stray still gets the type fallback (a bare cause's own size)
    expect(hinted.geometry.get('other')).toMatchObject({ width: w('Other cause'), height: TEXT_H });
  });
});

describe('fishbone colours', () => {
  it('colours a column by the palette, a category by its own colour, and every cause by its category', () => {
    const m = fish();
    const colors = fishboneNodeColors(m);
    expect(colors.get('c1')).toBe(BONE_PALETTE[0]);
    expect(colors.get('c2')).toBe('#123456');
    expect(colors.get('c3')).toBe(BONE_PALETTE[1]);
    expect(colors.get('a')).toBe(BONE_PALETTE[0]);
    expect(colors.get('a2')).toBe(BONE_PALETTE[0]);
    expect(colors.get('d')).toBe('#123456');
    expect(colors.has('e')).toBe(false);
  });
  it('gives a bone, a line and a tick the colour of the node it starts from', () => {
    const m = fish();
    const v = view(m);
    const edge = (from: string) => v.edges.find((e) => e.from === from)!;
    expect(fishboneEdgeColor(edge('c2'), m)).toBe('#123456');
    expect(fishboneEdgeColor(edge('a1'), m)).toBe(BONE_PALETTE[0]);
  });
});

describe('fishboneLayout and layer visibility', () => {
  it('a layer toggle never moves a box: geometry and routes come from layoutEdges', () => {
    // Tag the cause-of line from 'a' to 'c1' with a layer that starts off. The
    // model's structure (fishboneTree) and the layout it drives never look at
    // `edges` (what is DRAWN), only `layoutEdges` (what is LAID OUT), so toggling
    // the layer must change what is visible on the wire without moving a box.
    const base = fish();
    const tagged = base.relations.find((r) => r.from === 'a' && r.to === 'c1' && r.kind === FB_CAUSE_OF_KIND);
    expect(tagged).toBeDefined();
    const m: DiagramModel = {
      ...base,
      relations: base.relations.map((r) => (r === tagged ? { ...r, layer: 'l' } : r)),
      layers: [...base.layers, { id: 'l', name: 'L' }],
    };
    const off = compileView(m, { plane: m.planes[0]?.id, activeLayers: [] });
    const on = compileView(m, { plane: m.planes[0]?.id, activeLayers: ['l'] });
    // sanity: the layer really does gate what is drawn...
    expect(off.edges.some((e) => e.from === 'a' && e.to === 'c1')).toBe(false);
    expect(on.edges.some((e) => e.from === 'a' && e.to === 'c1')).toBe(true);
    // ...but never what is laid out.
    const rOff = fishboneLayout(off, m, undefined);
    const rOn = fishboneLayout(on, m, undefined);
    expect(rOff.geometry).toEqual(rOn.geometry);
    const edgeOff = off.layoutEdges.find((e) => e.from === 'a' && e.to === 'c1')!;
    const edgeOn = on.layoutEdges.find((e) => e.from === 'a' && e.to === 'c1')!;
    expect(rOff.routes.has(edgeOff.id)).toBe(true);
    expect(rOn.routes.has(edgeOn.id)).toBe(true);
  });

  it('drops a layer-hidden category, and its causes, from the fish, re-pairing the rest into columns', () => {
    // c2 (and its cause 'd') carry a layer that starts off, so the view's
    // hierarchy never includes them (see hierarchy.ts `layerOn`) — the same
    // "shown" filter fishboneLayout applies to any node the view drops. With c2
    // gone, c3 becomes the second shown category and pairs into c1's column.
    const base = fish();
    const m: DiagramModel = {
      ...base,
      nodes: base.nodes.map((n) => (n.id === 'c2' || n.id === 'd' ? { ...n, layer: 'hidden' } : n)),
      layers: [...base.layers, { id: 'hidden', name: 'Hidden' }],
    };
    const v = compileView(m, { plane: m.planes[0]?.id, activeLayers: [] });
    const r = fishboneLayout(v, m, undefined);
    expect(r.geometry.has('c2')).toBe(false);
    expect(r.geometry.has('d')).toBe(false);
    const H3 = 2 * ROW; // c3 is a bare bone, same height whichever side it lands on
    const c1 = r.geometry.get('c1')!;
    const c3 = r.geometry.get('c3')!;
    const join1 = c1.x + LABEL_W / 2 + BONE_K * H1;
    const join3 = c3.x + LABEL_W / 2 + BONE_K * H3;
    expect(join3).toBeCloseTo(join1, 6); // same column as c1 now, so the same spine join
  });
});
