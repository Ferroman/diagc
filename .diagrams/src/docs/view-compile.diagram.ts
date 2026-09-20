import { model } from '@diagc/core';

// Diagram for docs/explanation/views.md: the model is not what you see. This is
// the transform from the stored model plus your current viewport into the tree
// the renderer actually draws.

const m = model('docs-view-compile', { name: 'From stored model to what you see' });

const IN = '#2563eb';
const STEP = '#7c3aed';
const OUT = '#16a34a';

const stored = m.node('stored', { name: 'DiagramModel', color: IN });
const viewport = m.node('viewport', { name: 'ViewportState', color: IN });

const compile = m.node('compile', { type: 'service', name: 'compileView()', color: STEP });
const hierarchy = m.node('hierarchy', { name: '1. buildHierarchy', color: STEP });
const scope = m.node('scope', { name: '2. scopeToRoot', color: STEP });
const lod = m.node('lod', { name: '3. computeLod', color: STEP });
const tree = m.node('tree', { name: '4. buildViewTree', color: STEP });
const edges = m.node('edges', { name: '5. resolveEdges', color: STEP });

const view = m.node('view', { name: 'CompiledView', color: OUT });
const roots = m.node('roots', { name: 'roots', color: OUT });
const drawn = m.node('drawn', { name: 'edges', color: OUT });
const layoutEdges = m.node('layout-edges', { name: 'layoutEdges', color: OUT });

compile.contains(hierarchy, scope, lod, tree, edges);
view.contains(roots, drawn, layoutEdges);

m.relate(stored, compile, { kind: 'flow' });
m.relate(viewport, compile, { kind: 'flow' });
m.relate(hierarchy, scope, { kind: 'flow' });
m.relate(scope, lod, { kind: 'flow' });
m.relate(lod, tree, { kind: 'flow' });
m.relate(tree, edges, { kind: 'flow' });
m.relate(compile, view, { kind: 'flow' });

export default m;
