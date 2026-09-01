import { describe, expect, it } from 'vitest';
import { model } from '../builder';
import { validate } from '../validate';
import { activeNotation, compileView, presetLayers } from './compile';
import type { DiagramModel } from '../types';

function planesModel(): DiagramModel {
  const m = model('p');
  m.layer('data-flow', { name: 'Data flow', tint: '#0ea5e9' });
  m.plane('architecture', { name: 'Architecture' });
  m.plane('infra', { name: 'Infrastructure' });
  m.plane('flow', { name: 'Flow', containmentOf: 'architecture', layers: ['data-flow'] });

  const svcA = m.node('svc-a', { type: 'service' });
  const svcB = m.node('svc-b', { type: 'service' });
  const db = m.node('db', { type: 'aws-rds' });
  const sys = m.node('sys', { type: 'system', plane: 'architecture' });
  const platform = m.node('platform', { type: 'platform', plane: 'architecture' });
  const aws = m.node('aws', { type: 'infra', plane: 'infra' });
  const k8s = m.node('k8s', { type: 'infra', plane: 'infra' });
  m.node('vendor', { type: 'external' }); // no containment anywhere => every plane

  platform.contains(sys); // untagged = default plane (architecture)
  sys.contains(svcA, svcB, db);
  aws.contains(k8s, db, { plane: 'infra' });
  k8s.contains(svcA, svcB, { plane: 'infra' });

  m.relate(svcA, svcB, { kind: 'sync' });
  m.relate(svcA, db, { kind: 'flow', label: 'events', layer: 'data-flow' });
  return m.toJSON();
}

const ids = (nodes: { id: string }[]) => nodes.map((n) => n.id);

describe('planes', () => {
  it('serializes planes and plane-tagged containment', () => {
    const j = planesModel();
    expect(j.planes.map((p) => p.id)).toEqual(['architecture', 'infra', 'flow']);
    expect(j.planes[2]).toMatchObject({ containmentOf: 'architecture', layers: ['data-flow'] });
    expect(j.containment).toContainEqual({ parent: 'aws', child: 'k8s', plane: 'infra' });
    expect(j.containment).toContainEqual({ parent: 'platform', child: 'sys' }); // untagged
  });

  it('same pair may exist in two planes; duplicates within a plane dedupe', () => {
    const m = model('d');
    m.plane('a').plane('b');
    const x = m.node('x', { type: 't' });
    const y = m.node('y', { type: 't' });
    x.contains(y); // plane a (default)
    x.contains(y, { plane: 'b' });
    x.contains(y); // dedupe
    expect(m.toJSON().containment).toEqual([
      { parent: 'x', child: 'y' },
      { parent: 'x', child: 'y', plane: 'b' },
    ]);
  });

  it('default view = first plane: infra-only nodes are absent', () => {
    const v = compileView(planesModel(), { focus: ['platform', 'sys'] });
    expect(ids(v.roots)).toEqual(['platform', 'vendor']); // aws/k8s invisible here
    const sys = v.roots[0]!.children[0]!;
    expect(ids(sys.children)).toEqual(['svc-a', 'svc-b', 'db']);
    expect(v.edges.map((e) => e.id)).toEqual(['svc-a=>svc-b:']);
  });

  it('infra plane: aws/k8s hierarchy, architecture-only nodes absent, their relations dropped', () => {
    const v = compileView(planesModel(), { plane: 'infra', focus: ['aws', 'k8s'] });
    expect(ids(v.roots)).toEqual(['aws', 'vendor']);
    const aws = v.roots[0]!;
    expect(ids(aws.children)).toEqual(['db', 'k8s']); // model order; both inside aws
    const k8s = aws.children.find((c) => c.id === 'k8s')!;
    expect(ids(k8s.children)).toEqual(['svc-a', 'svc-b']);
    expect(v.edges.map((e) => e.id)).toEqual(['svc-a=>svc-b:']); // flow relation needs its layer
  });

  it('a borrowed-containment plane shows the base structure with its preset layers on', () => {
    const v = compileView(planesModel(), { plane: 'flow', focus: ['platform', 'sys'] });
    expect(ids(v.roots)).toEqual(['platform', 'vendor']); // architecture structure
    expect(v.edges.map((e) => e.id)).toContain('svc-a=>db:data-flow'); // preset layer active
  });

  it('baseRelations: false hides untagged relations, leaving only layer relations', () => {
    const m = planesModel();
    const flow = m.planes.find((p) => p.id === 'flow')!;
    flow.baseRelations = false;
    const v = compileView(m, { plane: 'flow', focus: ['platform', 'sys'] });
    expect(v.edges.map((e) => e.id)).toEqual(['svc-a=>db:data-flow']); // sync base edge gone
  });

  it('cross-plane opposite containment is legal; same-plane cycles are not', () => {
    const ok = model('ok');
    ok.plane('a').plane('b');
    const p = ok.node('p', { type: 't' });
    const q = ok.node('q', { type: 't' });
    p.contains(q);
    q.contains(p, { plane: 'b' });
    expect(validate(ok.toJSON())).toEqual([]);

    const bad = planesModel();
    bad.containment.push({ parent: 'sys', child: 'platform' }); // cycle within architecture
    expect(validate(bad).some((i) => i.code === 'containment-cycle')).toBe(true);
  });

  it('validates plane references', () => {
    // raw models: toJSON() would throw on these, validate() is the unit under test
    const raw = (over: Partial<DiagramModel>): DiagramModel => ({
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
    expect(
      validate(raw({ planes: [{ id: 'a', name: 'a', containmentOf: 'ghost' }] })).some(
        (i) => i.code === 'unknown-plane',
      ),
    ).toBe(true);
    expect(
      validate(
        raw({
          planes: [
            { id: 'a', name: 'a' },
            { id: 'b', name: 'b', containmentOf: 'a' },
            { id: 'c', name: 'c', containmentOf: 'b' },
          ],
        }),
      ).some((i) => i.code === 'invalid-plane'),
    ).toBe(true);
    expect(
      validate(
        raw({
          nodes: [
            { id: 'x', name: 'x', type: 't' },
            { id: 'y', name: 'y', type: 't' },
          ],
          containment: [{ parent: 'x', child: 'y', plane: 'nope' }], // no planes declared
        }),
      ).some((i) => i.code === 'unknown-plane'),
    ).toBe(true);
  });

  it('a shared box stays on its home plane after being re-nested on another', () => {
    const m = model('reuse');
    m.plane('c4').plane('infra');
    const web = m.node('web', { type: 'service' });     // shared
    const inst = m.node('inst', { type: 'infra', plane: 'infra' });
    inst.contains(web, { plane: 'infra' });
    const j = m.toJSON();
    expect(ids(compileView(j, { plane: 'c4', focus: ['web'] }).roots)).toContain('web');
    const infra = compileView(j, { plane: 'infra', focus: ['inst'] });
    expect(ids(infra.roots)).toEqual(['inst']);
    expect(ids(infra.roots[0]!.children)).toEqual(['web']);
  });

  it('hiding a shared node also drops its incident relation from edges, not just the node', () => {
    const m = model('hide-edge');
    m.plane('p');
    const a = m.node('a', { type: 't' });
    const b = m.node('b', { type: 't' });
    m.relate(a, b, { kind: 'sync' });
    const j = m.toJSON();
    j.planes[0]!.hides = ['a'];
    const v = compileView(j, { plane: 'p' });
    expect(ids(v.roots)).not.toContain('a'); // node itself is gone
    expect(v.edges.some((e) => e.from === 'a')).toBe(false); // and so is its edge
  });
});

/**
 * A plane's `layers` are a DEFAULT, not a permanent union. `viewport.activeLayers`
 * undefined means "the host has no opinion" → the plane's presets apply; an array,
 * even an empty one, is the host's own choice and wins outright. The union it
 * replaces made a preset layer unturn-off-able: a studio/viewer layer switch could
 * not hide the plane's own sheets, so NATS arrows stayed on screen with the chip off.
 */
describe('plane layer presets are a default, not a union', () => {
  function presetModel(): DiagramModel {
    const m = model('presets');
    m.layer('nats', { name: 'NATS messaging', tint: '#0ea5e9' });
    m.layer('monitoring', { name: 'Monitoring', tint: '#a855f7' });
    m.plane('landscape', { name: 'Landscape', layers: ['nats', 'monitoring'] });
    const a = m.node('a', { type: 'service' });
    const b = m.node('b', { type: 'service' });
    m.relate(a, b, { kind: 'sync' });
    m.relate(a, b, { kind: 'flow', label: 'events', layer: 'nats' });
    m.relate(a, b, { kind: 'flow', label: 'metrics', layer: 'monitoring' });
    return m.toJSON();
  }
  const edges = (v: { edges: { id: string }[] }) => v.edges.map((e) => e.id).sort();

  it('applies the preset when the host expresses no choice (activeLayers undefined)', () => {
    const v = compileView(presetModel(), { plane: 'landscape' });
    expect(edges(v)).toEqual(['a=>b:', 'a=>b:monitoring', 'a=>b:nats']);
  });

  it('an explicit empty array is a choice: every preset layer is off', () => {
    const v = compileView(presetModel(), { plane: 'landscape', activeLayers: [] });
    expect(edges(v)).toEqual(['a=>b:']); // base sheet only
  });

  it('an explicit list replaces the preset rather than adding to it', () => {
    const v = compileView(presetModel(), { plane: 'landscape', activeLayers: ['nats'] });
    expect(edges(v)).toEqual(['a=>b:', 'a=>b:nats']); // monitoring off
  });

  it('presetLayers gives a host the seed for its own switch, resolving the plane like compileView', () => {
    const j = presetModel();
    expect(presetLayers(j.planes, 'landscape')).toEqual(['nats', 'monitoring']);
    expect(presetLayers(j.planes, undefined)).toEqual(['nats', 'monitoring']); // = first plane
    expect(presetLayers(j.planes, 'ghost')).toEqual([]); // unknown plane presets nothing
    expect(presetLayers([], undefined)).toEqual([]);
    // A copy, never the model's own array: host state must not alias the model.
    expect(presetLayers(j.planes, 'landscape')).not.toBe(j.planes[0]!.layers);
  });

  it('a host that seeds from presetLayers reproduces the no-opinion view exactly', () => {
    const j = presetModel();
    const seeded = compileView(j, { plane: 'landscape', activeLayers: presetLayers(j.planes, 'landscape') });
    const noOpinion = compileView(j, { plane: 'landscape' });
    expect(edges(seeded)).toEqual(edges(noOpinion));
  });

  it('the same rule governs layer-tagged NODES, not only relations', () => {
    const m = model('preset-nodes');
    m.layer('monitoring', { name: 'Monitoring' });
    m.plane('landscape', { layers: ['monitoring'] });
    m.node('app', { type: 'service' });
    m.node('grafana', { type: 'service', layer: 'monitoring' });
    const j = m.toJSON();
    expect(ids(compileView(j, { plane: 'landscape' }).roots)).toEqual(['app', 'grafana']);
    expect(ids(compileView(j, { plane: 'landscape', activeLayers: [] }).roots)).toEqual(['app']);
  });
});

describe('activeNotation', () => {
  const planes = [
    { id: 'git', name: 'Git', notation: 'git-graph' },
    { id: 'arch', name: 'Arch' },
    { id: 'odd', name: 'Odd', notation: 'made-up' },
  ];

  it('reads the picked plane, falls back to the first plane for the default view', () => {
    expect(activeNotation(planes, 'git')).toBe('git-graph');
    expect(activeNotation(planes, 'arch')).toBeUndefined();
    expect(activeNotation(planes, undefined)).toBe('git-graph');
  });

  it('drops an unknown notation id and copes with no planes', () => {
    expect(activeNotation(planes, 'odd')).toBeUndefined();
    expect(activeNotation([], undefined)).toBeUndefined();
  });

  it('falls back to the model-level notation when the plane declares none', () => {
    expect(activeNotation([], undefined, 'c4')).toBe('c4');
  });

  it('a plane notation beats the model fallback', () => {
    expect(activeNotation(planes, 'git', 'c4')).toBe('git-graph');
  });

  it('an unknown fallback resolves to undefined, not an error', () => {
    expect(activeNotation([], undefined, 'nope')).toBeUndefined();
  });
});
