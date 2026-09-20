import { model } from '@diagc/core';

// Diagram for the README and docs/explanation/architecture.md: how a source file
// becomes a picture.
//
// Two constraints shape it, both worth knowing before you author a diagram for
// docs: a node's `description` never renders on the canvas (it shows in the
// studio's detail panel), so anything the reader must see belongs in `name`; and
// `diagc publish` exports PNGs with every layer off, so nothing that matters can
// live on a layer.

const m = model('docs-pipeline', { name: 'How a diagram becomes a picture' });

const SRC = '#2563eb';
const TOOL = '#7c3aed';
const ART = '#0891b2';
const OUT = '#16a34a';

const authoring = m.node('authoring', { name: '.diagrams/src/', color: SRC });
const ts = m.node('ts', { name: '*.diagram.ts', color: SRC });
const json = m.node('json', { name: '*.diagram.json', color: SRC });
const layout = m.node('layout', { name: '*.layout.json', color: SRC });

const diagc = m.node('diagc', { type: 'service', name: 'diagc compile', color: TOOL });
const validate = m.node('validate', { name: 'validate()', color: TOOL });
const compose = m.node('compose', { name: 'composeIncludes()', color: TOOL });

const artifact = m.node('artifact', { name: '.artifacts/*.json', color: ART });

const studio = m.node('studio', { type: 'service', name: 'diagc studio', color: TOOL });
const publish = m.node('publish', { type: 'service', name: 'diagc publish', color: TOOL });

const html = m.node('html', { name: 'html/*.html', color: OUT });
const png = m.node('png', { name: 'static/*.png', color: OUT });

authoring.contains(ts, json, layout);
diagc.contains(validate, compose);

m.relate(ts, diagc, { kind: 'flow', label: 'jiti' });
m.relate(json, diagc, { kind: 'flow', label: 'parse' });
m.relate(diagc, artifact, { kind: 'writes' });
m.relate(artifact, studio, { kind: 'reads' });
m.relate(artifact, publish, { kind: 'reads' });
m.relate(layout, studio, { kind: 'reads' });
m.relate(publish, html, { kind: 'writes' });
m.relate(publish, png, { kind: 'writes' });
m.relate(studio, json, { kind: 'writes', label: 'Save' });
m.relate(studio, layout, { kind: 'writes', label: 'Save' });

export default m;
