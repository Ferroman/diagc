import type { DiagramModel } from '../types';

/** A valid model with nothing in it, for a validation test to add to. */
export function emptyModel(): DiagramModel {
  return { version: 1, id: 'm', name: 'm', nodes: [], containment: [], relations: [], layers: [], planes: [] };
}

/** An empty model with `over` on top: what a test that hands validation a
 * malformed field builds, since a cast on `over` is all such a field needs. */
export const raw = (over: Partial<DiagramModel>): DiagramModel => ({
  version: 1,
  id: 'x',
  name: 'x',
  nodes: [],
  containment: [],
  relations: [],
  layers: [],
  planes: [],
  ...over,
});
