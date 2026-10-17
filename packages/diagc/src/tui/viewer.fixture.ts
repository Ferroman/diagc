import type { DiagramModel } from '@diagc/core/internal';
import { UNICODE } from '../text/glyphs';
import { buildScene } from '../text/scene';
import type { InputEvent } from './keys';
import { sceneInput, type Ctx, type DiagramState } from './state';

// What the viewer's tests share: a small diagram, the screen it is shown on, and the
// events a test feeds it.

/** p ⊃ a, b; c beside it. The second plane turns layer l1 on by default. */
export const model: DiagramModel = {
  version: 1,
  id: 'm',
  name: 'm',
  nodes: [
    { id: 'p', name: 'Platform' },
    { id: 'a', name: 'Api' },
    { id: 'b', name: 'Banking' },
    { id: 'c', name: 'Customer' },
  ],
  containment: [
    { parent: 'p', child: 'a' },
    { parent: 'p', child: 'b' },
  ],
  relations: [
    { id: 'r1', from: 'c', to: 'a', kind: 'sync' },
    { id: 'r2', from: 'c', to: 'b', kind: 'sync', layer: 'l1' },
  ],
  layers: [{ id: 'l1', name: 'Payments' }],
  planes: [
    { id: 'main', name: 'Main' },
    { id: 'alt', name: 'Alt', layers: ['l1'] },
  ],
};

/** The canvas: under a one-row top bar, 40 by 12. */
export const view = { top: 1, width: 40, height: 12 };

export const key = (name: string, extra: { shift?: boolean; ctrl?: boolean } = {}): InputEvent => ({
  kind: 'key',
  name,
  ...extra,
});

export const pointer = (action: 'press' | 'drag' | 'release', at: { x: number; y: number }): InputEvent => ({
  kind: 'mouse',
  action,
  ...at,
  shift: false,
});

/** What an event is handled against: the diagram's scene, built as the app builds it. */
export async function ctxOf(diagram: DiagramState, at = 0): Promise<Ctx> {
  const scene = await buildScene(sceneInput(diagram, model, undefined), UNICODE);
  return { model, scene, view, at };
}
