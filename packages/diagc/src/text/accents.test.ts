import { describe, expect, it } from 'vitest';
import { compileView, model, type DiagramModel, type NotationId } from '@diagc/core/internal';
import { NOTATION_PROFILES } from '../../../renderer/src/notations';
import { notationAccents } from './accents';

// The CLI cannot import the renderer, so the text renderer keeps its own copy of the
// colours a notation gives its boxes and lines; these tests hold the two together, on
// diagrams that reach every rule: the palette, a node's own colour, typeColors.

function fishbone(): DiagramModel {
  const m = model('fish', { name: 'Fish' });
  const fb = m.fishbone('outage', 'Outage');
  const { people, process, code, infrastructure } = fb.categories('Software');
  people!.cause('on-call', 'On-call engineer new to checkout');
  process!.cause('no-freeze', 'No change freeze').cause('no-calendar', 'No release calendar');
  code!.cause('migration', 'Untested migration');
  infrastructure!.cause('one-az', 'One availability zone');
  const fish = m.toJSON();
  return { ...fish, nodes: fish.nodes.map((n) => (n.id === 'code' ? { ...n, color: '#123456' } : n)) };
}

function gitGraph(): DiagramModel {
  const m = model('git', { name: 'Git' });
  const g = m.gitGraph();
  const main = g.branch('main', { name: 'main' });
  const feature = g.branch('feature', { name: 'feature' });
  const fix = g.branch('fix', { name: 'fix', color: '#b08ad9' });
  const base = main.commit();
  feature.commit({ from: base });
  const tip = feature.commit({ color: '#00aa00' });
  fix.commit({ from: base });
  main.merge(tip, { tag: 'v1' });
  return m.toJSON();
}

function threatModel(): DiagramModel {
  const m = model('tm', { name: 'Threats' });
  const tm = m.threatModel();
  const customer = tm.entity('customer', 'Customer');
  const auth = tm.process('auth', 'Auth service');
  tm.boundary('dmz', 'DMZ').contains(auth);
  tm.flow(customer, auth, 'HTTPS');
  return m.toJSON();
}

/** Each sample as it is, and with the model's colour for every type set. */
const SAMPLES: Partial<Record<NotationId, DiagramModel[]>> = Object.fromEntries(
  Object.entries({ fishbone, 'git-graph': gitGraph, 'threat-model': threatModel }).map(([id, make]) => [
    id,
    [make(), { ...make(), typeColors: { '*': '#996633' } }],
  ]),
);

// A theme's colours, a light one and a dark one: a text picture cannot know the
// background it will be read on, so these notations draw without theirs.
const THEMED: readonly NotationId[] = ['second-order', 'deployment'];

describe('notationAccents', () => {
  it('colours boxes and lines as the renderer’s notation does', () => {
    for (const [id, models] of Object.entries(SAMPLES)) {
      const profile = NOTATION_PROFILES[id as NotationId];
      for (const sample of models!) {
        for (const plane of [undefined, ...sample.planes.map((p) => p.id)]) {
          const pins = Object.fromEntries(sample.containment.map((c) => [c.parent, 'expanded' as const]));
          const view = compileView(sample, { pins, ...(plane !== undefined ? { plane } : {}) });
          const accents = notationAccents(sample, plane, id as NotationId, view.edges);
          const edges = view.edges.flatMap((e) => {
            const c = profile.edge?.colorOf?.(e, sample, plane);
            return c === undefined ? [] : [[e.id, c] as const];
          });
          expect({ id, plane, nodes: accents.nodes, edges: accents.edges }).toEqual({
            id,
            plane,
            nodes: new Map(profile.node?.colorOf?.(sample, plane) ?? []),
            edges: new Map(edges),
          });
        }
      }
    }
  });

  it('reaches every notation the renderer colours, but the themed ones', () => {
    const coloured = Object.values(NOTATION_PROFILES)
      .filter((p) => p.node?.colorOf !== undefined || p.edge?.colorOf !== undefined)
      .map((p) => p.id);
    expect(coloured.sort()).toEqual([...Object.keys(SAMPLES), ...THEMED].sort());
  });

  it('colours nothing for a notation without colours, or none', () => {
    const [fish] = SAMPLES.fishbone!;
    const view = compileView(fish!, { pins: {} });
    for (const notation of [undefined, 'plan' as const, ...THEMED]) {
      const accents = notationAccents(fish!, undefined, notation, view.edges);
      expect([accents.nodes.size, accents.edges.size]).toEqual([0, 0]);
    }
  });
});
