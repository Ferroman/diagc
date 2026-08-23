import { describe, expect, it } from 'vitest';
import { compileView, model, type CompiledView, type DiagramModel, type ViewEdge } from '@diagramming/core';
import { GIT_LAYOUT, LANE_PALETTE, gitEdgeColor, gitLayout, gitNodeColors, gitRoute } from './git-layout';

const { COL, LANE, DIAMETER, LABEL_W, MARGIN, TAIL_GAP } = GIT_LAYOUT;

/** master: 1.0 → 2.0 (merges nightly, gap 1) → 2.1 (merges hotfix); hotfix: hf (from 2.0); nightly: n1 (from 1.0) → n2 */
function graph(): DiagramModel {
  const m = model('g');
  const g = m.gitGraph();
  const master = g.branch('master', { name: 'Master', color: '#7ba7d9' });
  const hotfix = g.branch('hotfix', { name: 'Hotfix' });
  const nightly = g.branch('nightly', { name: 'Nightly', color: '#7bbf7b' });
  const v10 = master.commit('1.0');
  nightly.commit({ from: v10 });
  const n2 = nightly.commit();
  const v20 = master.merge(n2, { tag: '2.0', gap: 1 });
  const hf = hotfix.commit({ from: v20 });
  master.merge(hf, { tag: '2.1' });
  return m.toJSON();
}

/** every lane pinned expanded — the view rests folded, and DiagramView forces lanes open the same way */
function view(m: DiagramModel): CompiledView {
  const pins = Object.fromEntries(m.nodes.filter((n) => n.type === 'branch').map((n) => [n.id, 'expanded' as const]));
  return compileView(m, { plane: m.planes[0]?.id, pins });
}

const edgeBetween = (v: CompiledView, from: string, to: string): ViewEdge => {
  const e = v.edges.find((x) => x.from === from && x.to === to);
  if (e === undefined) throw new Error(`no edge ${from} -> ${to}`);
  return e;
};

// circle centre for column `c` on lane row `i`, absolute
const centre = (c: number, i: number) => ({ x: MARGIN + DIAMETER / 2 + c * COL, y: MARGIN + i * LANE + LANE / 2 });

describe('gitLayout', () => {
  it('stacks lanes as full-width bands and places commits by column, lane-relative', () => {
    const m = graph();
    const r = gitLayout(view(m), m, m.planes[0]?.id);
    expect(r.algorithm).toBe('git-graph');
    const width = MARGIN + 7 * COL + TAIL_GAP + LABEL_W + MARGIN; // columns 0..6
    expect(r.geometry.get('master')).toEqual({ x: 0, y: MARGIN, width, height: LANE });
    expect(r.geometry.get('hotfix')).toEqual({ x: 0, y: MARGIN + LANE, width, height: LANE });
    expect(r.geometry.get('nightly')).toEqual({ x: 0, y: MARGIN + 2 * LANE, width, height: LANE });
    const at = (c: number) => ({ x: MARGIN + c * COL, y: LANE / 2 - DIAMETER / 2, width: DIAMETER, height: DIAMETER });
    expect(r.geometry.get('master-1')).toEqual(at(0));
    expect(r.geometry.get('nightly-1')).toEqual(at(1));
    expect(r.geometry.get('nightly-2')).toEqual(at(2));
    expect(r.geometry.get('master-2')).toEqual(at(4)); // max(0, 2) + 1, + gap 1
    expect(r.geometry.get('hotfix-1')).toEqual(at(5));
    expect(r.geometry.get('master-3')).toEqual(at(6));
  });

  it('routes every git link by direction: drop at the source going down, climb before the target going up', () => {
    const m = graph();
    const v = view(m);
    const r = gitLayout(v, m, m.planes[0]?.id);
    const s10 = centre(0, 0);
    const n1 = centre(1, 2);
    const n2 = centre(2, 2);
    const s20 = centre(4, 0);
    expect(r.routes.get(edgeBetween(v, 'master-1', 'nightly-1').id)).toEqual([s10, { x: s10.x, y: n1.y }, n1]);
    expect(r.routes.get(edgeBetween(v, 'nightly-1', 'nightly-2').id)).toEqual([n1, n2]);
    expect(r.routes.get(edgeBetween(v, 'nightly-2', 'master-2').id)).toEqual([n2, { x: s20.x - COL / 2, y: n2.y }, { x: s20.x - COL / 2, y: s20.y }, s20]);
  });

  it('parks strays and non-branch roots in a row beneath the lanes', () => {
    const m = graph();
    m.nodes.push({ id: 'loose', name: '', type: 'commit' }, { id: 'note', name: 'Why', type: 'comment' });
    const r = gitLayout(view(m), m, m.planes[0]?.id, new Map([['note', { width: 120, height: 40 }]]));
    const rowY = MARGIN + 3 * LANE + MARGIN;
    expect(r.geometry.get('loose')).toEqual({ x: MARGIN, y: rowY, width: DIAMETER, height: DIAMETER });
    expect(r.geometry.get('note')).toEqual({ x: MARGIN + DIAMETER + COL, y: rowY, width: 120, height: 40 });
  });

  it('a commit the view does not show gets no geometry and no route', () => {
    const m = graph();
    const v = compileView(m, { plane: m.planes[0]?.id }); // no pins: lanes rest folded, commits are not in the view
    const r = gitLayout(v, m, m.planes[0]?.id);
    expect(r.geometry.has('master')).toBe(true);
    expect(r.geometry.has('master-1')).toBe(false);
    expect(r.routes.size).toBe(0);
  });
});

describe('gitRoute', () => {
  it('same row and degenerate links are straight', () => {
    expect(gitRoute({ x: 0, y: 5 }, { x: 50, y: 5 }, COL)).toEqual([{ x: 0, y: 5 }, { x: 50, y: 5 }]);
    expect(gitRoute({ x: 50, y: 5 }, { x: 0, y: 60 }, COL)).toEqual([{ x: 50, y: 5 }, { x: 0, y: 60 }]);
  });
});

describe('colours', () => {
  it('lanes take their own colour, else the palette by index; commits take their lane colour unless they set one', () => {
    const m = graph();
    m.nodes[4] = { ...m.nodes[4]!, color: '#000' }; // nightly-1
    const c = gitNodeColors(m, m.planes[0]?.id);
    expect(c.get('master')).toBe('#7ba7d9');
    expect(c.get('hotfix')).toBe(LANE_PALETTE[1]);
    expect(c.get('nightly')).toBe('#7bbf7b');
    expect(c.get('master-1')).toBe('#7ba7d9');
    expect(c.get('hotfix-1')).toBe(LANE_PALETTE[1]);
    expect(c.get('nightly-1')).toBe('#000');
  });

  it('branch links take the target lane, commit links their lane, merge links the lower lane', () => {
    const m = graph();
    const v = view(m);
    const plane = m.planes[0]?.id;
    expect(gitEdgeColor(edgeBetween(v, 'master-1', 'nightly-1'), m, plane)).toBe('#7bbf7b'); // branch → target
    expect(gitEdgeColor(edgeBetween(v, 'nightly-1', 'nightly-2'), m, plane)).toBe('#7bbf7b'); // commit → own
    expect(gitEdgeColor(edgeBetween(v, 'nightly-2', 'master-2'), m, plane)).toBe('#7bbf7b'); // merge up → lower lane
    expect(gitEdgeColor(edgeBetween(v, 'master-2', 'hotfix-1'), m, plane)).toBe(LANE_PALETTE[1]); // branch → target
    expect(gitEdgeColor(edgeBetween(v, 'hotfix-1', 'master-3'), m, plane)).toBe(LANE_PALETTE[1]); // merge up → lower lane
  });

  it('a merge into a HIGHER-index lane (downward) takes the target lane, not the source', () => {
    // master (index 0) -> nightly (index 1); nightly merges master's commit in,
    // so the merge edge's source lane index (0) is LESS than its target's (1) —
    // the mirror of `graph()`'s merges, which all land back on the lower lane.
    const m2 = model('g2');
    const g2 = m2.gitGraph();
    const master2 = g2.branch('master', { name: 'Master', color: '#7ba7d9' });
    const nightly2 = g2.branch('nightly', { name: 'Nightly', color: '#7bbf7b' });
    const v1 = master2.commit('1.0');
    nightly2.commit({ from: v1 });
    nightly2.merge(v1);
    const j = m2.toJSON();
    const v2 = view(j);
    expect(gitEdgeColor(edgeBetween(v2, 'master-1', 'nightly-2'), j, j.planes[0]?.id)).toBe('#7bbf7b');
  });

  it('leaves non-git links alone', () => {
    const m = graph();
    m.nodes.push({ id: 'note', name: 'Why', type: 'comment' });
    m.relations.push({ id: 'x', from: 'master-1', to: 'note', kind: 'sync' });
    const v = view(m);
    expect(gitEdgeColor(edgeBetween(v, 'master-1', 'note'), m, m.planes[0]?.id)).toBeUndefined();
  });
});
