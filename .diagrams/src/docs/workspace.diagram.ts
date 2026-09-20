import { model } from '@diagc/core';

// Diagram for docs/explanation/architecture.md: which package owns what, and
// which way the dependencies point. Read it when you come back cold and need to
// work out where a change belongs.

const m = model('docs-workspace', { name: 'Which package owns what' });

const CORE = '#2563eb';
const TOOL = '#7c3aed';
const UI = '#16a34a';

// Typeless on purpose: a `type` renders as a subtitle under every name, and
// "service" six times would be noise on a package map.
const core = m.node('core', { name: 'core', color: CORE });
const renderer = m.node('renderer', { name: 'renderer', color: UI });
const icons = m.node('icons', { name: 'icons', color: UI });
const diagc = m.node('diagc', { name: 'diagc', color: TOOL });
const studio = m.node('studio', { name: 'studio', color: UI });
const viewer = m.node('viewer', { name: 'viewer', color: UI });

m.relate(diagc, core, { kind: 'sync' });
m.relate(studio, core, { kind: 'sync' });
m.relate(studio, renderer, { kind: 'sync' });
m.relate(viewer, core, { kind: 'sync' });
m.relate(viewer, renderer, { kind: 'sync' });
m.relate(renderer, core, { kind: 'sync' });
m.relate(renderer, icons, { kind: 'sync' });
m.relate(diagc, viewer, { kind: 'reads', label: 'stamps' });
m.relate(diagc, studio, { kind: 'reads', label: 'spawns' });

export default m;
