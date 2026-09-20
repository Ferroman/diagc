import { model } from '@diagc/core';

// Diagram for docs/reference/model.md and docs/explanation/the-model.md: what a
// compiled artifact holds, and which parts point at which.

const m = model('docs-model', { name: 'Anatomy of a diagram model' });

const MODEL = '#2563eb';
const VIEW = '#7c3aed';
const LAYOUT = '#c2410c';

const doc = m.node('doc', { name: 'DiagramModel', color: MODEL });
const nodes = m.node('nodes', { name: 'nodes[]', color: MODEL });
const containment = m.node('containment', { name: 'containment[]', color: MODEL });
const relations = m.node('relations', { name: 'relations[]', color: MODEL });
const layers = m.node('layers', { name: 'layers[]', color: VIEW });
const planes = m.node('planes', { name: 'planes[]', color: VIEW });

const overlay = m.node('overlay', { name: 'LayoutOverlay', color: LAYOUT });
const positions = m.node('positions', { name: 'planes', color: LAYOUT });
const sizes = m.node('sizes', { name: 'sizes', color: LAYOUT });
const manual = m.node('manual', { name: 'manual', color: LAYOUT });

doc.contains(nodes, containment, relations, layers, planes);
overlay.contains(positions, sizes, manual);

m.relate(containment, nodes, { kind: 'reads', label: 'parent / child' });
m.relate(relations, nodes, { kind: 'reads', label: 'from / to' });
m.relate(relations, layers, { kind: 'reads', label: 'layer' });
m.relate(containment, planes, { kind: 'reads', label: 'plane' });
m.relate(positions, nodes, { kind: 'reads', label: 'node id' });
m.relate(sizes, nodes, { kind: 'reads', label: 'node id' });

export default m;
