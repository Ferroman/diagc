import type { DiagramModel } from '@diagc/core';

// Plain-object default export (the supported non-builder path). It has the right
// shape (version 1, nodes array) so it passes the shape guard, but the relation
// points at a node that does not exist, so validate() must reject it.
const m: DiagramModel = {
  version: 1,
  id: 'plain-invalid',
  name: 'plain-invalid',
  nodes: [{ id: 'a', name: 'a', type: 'service' }],
  containment: [],
  relations: [{ id: 'a->ghost', from: 'a', to: 'ghost', kind: 'reads' }],
  layers: [],
  planes: [],
};

export default m;
