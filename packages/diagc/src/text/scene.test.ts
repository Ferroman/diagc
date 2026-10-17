import { describe, expect, it } from 'vitest';
import type { DiagramModel, LayoutOverlay } from '@diagc/core/internal';
import { UNICODE } from './glyphs';
import { buildScene } from './scene';

// p ⊃ a, b; c beside it; a → c on the base sheet, b → c on layer l1
const model: DiagramModel = {
  version: 1,
  id: 'm',
  name: 'm',
  nodes: [
    { id: 'p', name: 'Platform' },
    { id: 'a', name: 'Alpha' },
    { id: 'b', name: 'Beta' },
    { id: 'c', name: 'Gamma' },
  ],
  containment: [
    { parent: 'p', child: 'a' },
    { parent: 'p', child: 'b' },
  ],
  relations: [
    { id: 'r1', from: 'a', to: 'c', kind: 'sync' },
    { id: 'r2', from: 'b', to: 'c', kind: 'sync', layer: 'l1' },
  ],
  layers: [{ id: 'l1', name: 'Layer one' }],
  planes: [],
};
const open = { p: 'expanded' as const };

describe('buildScene', () => {
  it('compiles the view, draws only the active layers, and sizes each box', async () => {
    const scene = await buildScene({ model, pins: open }, UNICODE);
    expect([...scene.layout.boxes.keys()].sort()).toEqual(['a', 'b', 'c', 'p']);
    expect(scene.view.edges.map((e) => e.from)).toEqual(['a']);
    expect(scene.boxes.get('c')!.lines[0]!.text).toBe('Gamma');
    expect(scene.parentOf.get('a')).toBe('p');
    expect(scene.parentOf.get('p')).toBeUndefined();
  });

  it('never moves a box when a layer is turned on', async () => {
    const off = await buildScene({ model, pins: open, layers: [] }, UNICODE);
    const on = await buildScene({ model, pins: open, layers: ['l1'] }, UNICODE);
    expect(on.view.edges).toHaveLength(2);
    expect(on.layout.boxes).toEqual(off.layout.boxes);
  });

  it('counts a folded container’s children for its note', async () => {
    const scene = await buildScene({ model, pins: {} }, UNICODE);
    expect(scene.boxes.get('p')!.lines.at(-1)!.text).toBe('+ 2 inside');
  });

  it('draws a container’s interior when drilled into', async () => {
    const scene = await buildScene({ model, pins: {}, root: 'p' }, UNICODE);
    const ids = [...scene.layout.boxes.keys()];
    expect(ids).toContain('a');
    expect(ids).not.toContain('p');
  });

  it('flows the way the layout’s settings say', async () => {
    const overlay: LayoutOverlay = { version: 1, planes: {}, settings: { default: { direction: 'RIGHT' } } };
    const right = await buildScene({ model, overlay, pins: {} }, UNICODE);
    const p = right.layout.boxes.get('p')!;
    expect(right.layout.boxes.get('c')!.x).toBeGreaterThanOrEqual(p.x + p.width);
  });

  it('keeps the containers that never fold open', async () => {
    const lanes = { ...model, nodes: model.nodes.map((n) => (n.id === 'p' ? { ...n, type: 'activity-lane' } : n)) };
    const scene = await buildScene({ model: lanes, pins: {} }, UNICODE);
    expect(scene.layout.boxes.has('a')).toBe(true);
  });

  it('leaves out the lines a notation never draws', async () => {
    const plan: DiagramModel = {
      ...model,
      notation: 'plan',
      relations: [{ id: 'r', from: 'c', to: 'a', kind: 'owns' }],
    };
    const scene = await buildScene({ model: plan, pins: open }, UNICODE);
    expect(scene.view.edges).toEqual([]);
  });
});
