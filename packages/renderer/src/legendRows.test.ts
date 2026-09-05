import { describe, expect, it } from 'vitest';
import { compileView, model, type DiagramModel } from '@diagramming/core';
import { createKindRegistry, createTypeRegistry } from './registry';
import { legendRows, type LegendInput } from './legendRows';

/** shop -> (web, api); api -> db; a 'flow' relation on the data-flow layer */
function fixture(): DiagramModel {
  const m = model('shop');
  m.layer('data-flow', { name: 'Data flow', tint: '#0ea5e9' });
  m.layer('hosting', { name: 'Hosting', tint: '#7c3aed' });
  const shop = m.node('shop', { type: 'system' });
  const web = m.node('web', { type: 'service' });
  const api = m.node('api', { type: 'service' });
  const db = m.node('db', { type: 'database' });
  shop.contains(web, api);
  api.contains(db);
  m.relate(web, api, { kind: 'sync' });
  m.relate(api, db, { kind: 'writes' });
  m.relate(web, db, { kind: 'flow', layer: 'data-flow' });
  return m.toJSON();
}

/** Compiles the same viewport the legend is told about, so a test can never
 *  assert a key against a view the product would not have drawn. */
function rows(m: DiagramModel, over: Partial<LegendInput> = {}) {
  // Left UNDEFINED when the caller says nothing, never coerced to []: undefined
  // is "the host has no opinion" (plane presets apply) and [] is "the host chose
  // nothing" (no layers at all). Coercing here would hide the whole distinction
  // this fixture exists to exercise.
  const activeLayers = over.activeLayers;
  const pins = Object.fromEntries(
    [...new Set(m.containment.map((c) => c.parent))].map((id) => [id, 'expanded' as const]),
  );
  return legendRows({
    model: m,
    compiled: compileView(m, {
      pins,
      ...(activeLayers !== undefined ? { activeLayers } : {}),
      ...(over.plane !== undefined ? { plane: over.plane.id } : {}),
      ...(over.root !== undefined ? { root: over.root } : {}),
    }),
    ...(activeLayers !== undefined ? { activeLayers } : {}),
    typeRegistry: createTypeRegistry(),
    kindRegistry: createKindRegistry(),
    config: {},
    canToggleLayers: true,
    ...over,
  });
}

/** The acme fixture's own shape: a 'flow' plane that borrows 'architecture''s
 *  containment, over nodes scoped to 'architecture'. */
function borrowingPlanes(): DiagramModel {
  const m = model('borrow');
  m.layer('data-flow', { name: 'Data flow', tint: '#0ea5e9' });
  m.plane('architecture', { name: 'Architecture' });
  m.plane('flow', { name: 'Flow', containmentOf: 'architecture', layers: ['data-flow'] });
  const sys = m.node('sys', { plane: 'architecture' });
  const db = m.node('db', { plane: 'architecture' });
  m.relate(sys, db, { kind: 'flow', layer: 'data-flow' });
  return m.toJSON();
}

const planeOf = (m: DiagramModel, id: string) => m.planes.find((p) => p.id === id)!;

describe('legendRows', () => {
  it('lists drawn kinds and every relevant layer by default', () => {
    const r = rows(fixture());
    // 'Hosting' is declared on the model but no node or relation carries it,
    // so it is not relevant here — see relevantLayerIds.
    expect(r.filter((x) => x.section === 'layers').map((x) => x.label)).toEqual(['Data flow']);
    expect(r.filter((x) => x.section === 'kinds').map((x) => x.label)).toEqual(['sync', 'writes']);
    expect(r.some((x) => x.section === 'types')).toBe(false);
  });

  it('omits a kind that only an inactive layer uses, and includes it once active', () => {
    const m = fixture();
    expect(rows(m).some((x) => x.label === 'flow')).toBe(false);
    expect(rows(m, { activeLayers: ['data-flow'] }).some((x) => x.label === 'flow')).toBe(true);
  });

  it('marks layers active, including a plane preset', () => {
    const m = fixture();
    const off = rows(m).find((x) => x.layer === 'data-flow');
    expect(off).toMatchObject({ active: false, swatch: { draw: 'chip', color: '#0ea5e9' } });
    expect(rows(m, { activeLayers: ['data-flow'] }).find((x) => x.layer === 'data-flow')?.active).toBe(true);
    const planed = rows(m, { plane: { id: 'p', name: 'P', layers: ['data-flow'] } });
    expect(planed.find((x) => x.layer === 'data-flow')?.active).toBe(true);
  });

  it('a plane preset is a default the host can override, not a floor', () => {
    // Same rule as compileView: an explicit array (even empty) is the host's
    // choice and replaces the preset, so the chip can report a preset layer OFF.
    // Unioning them here is what left the legend claiming NATS was on while the
    // studio's switch said otherwise.
    const m = fixture();
    const plane = { id: 'p', name: 'P', layers: ['data-flow'] };
    expect(rows(m, { plane, activeLayers: [] }).find((x) => x.layer === 'data-flow')?.active).toBe(false);
    expect(rows(m, { plane, activeLayers: ['hosting'] }).find((x) => x.layer === 'data-flow')?.active).toBe(false);
  });

  it('drops inactive layers, but keeps active ones, when nothing can toggle them', () => {
    // A published page and an export both land here: the row would be greyed
    // with no way to un-grey it, so it is omitted rather than shown as noise.
    const off = rows(fixture(), { canToggleLayers: false });
    expect(off.some((x) => x.section === 'layers')).toBe(false);
    const on = rows(fixture(), { canToggleLayers: false, activeLayers: ['data-flow'] });
    expect(on.filter((x) => x.section === 'layers')).toMatchObject([{ label: 'Data flow', active: true }]);
  });

  it('orders kinds by registry order, not by appearance', () => {
    const m = model('k');
    const a = m.node('a');
    const b = m.node('b');
    m.relate(a, b, { kind: 'writes' });
    m.relate(b, a, { kind: 'async' });
    m.relate(a, b, { kind: 'zulu' });
    // With only two nodes, three relations occupy just two directed pairs: the
    // two a->b relations (writes, zulu) disagree in kind, so compileView folds
    // them into one 'mixed' edge, aggregated (and compiled) after the lone
    // b->a 'async' edge. Registry order is sync, async, reads, writes, …,
    // mixed, …, so 'async' (rank 1) still sorts before 'mixed' (rank 6) despite
    // compiling second — that is the "not by appearance" this test is for.
    expect(rows(m.toJSON()).filter((x) => x.section === 'kinds').map((x) => x.label)).toEqual(['async', 'mixed']);
  });

  it('sorts a registered kind before unregistered ones, and unregistered ones alphabetically', () => {
    // Three nodes, three distinct directed pairs (c->a, a->b, b->c): no two
    // relations share a group key, so nothing aggregates into 'mixed' and all
    // three authored kinds survive as themselves — sanity-checked against the
    // exact pitfall that broke the two-node version of this test.
    // 'zulu' and 'alpha' are not in DEFAULT_KIND_STYLES; 'writes' is. By the
    // ordering rule (registry rank first, then unknown ids alphabetically) the
    // expectation is 'writes' first, then 'alpha' before 'zulu' — matching
    // neither relate-call order (zulu, writes, alpha) nor plain alphabetical
    // order (alpha, writes, zulu), so it can only pass if both branches of
    // orderByRegistry are correct.
    const m = model('mix');
    const a = m.node('a');
    const b = m.node('b');
    const c = m.node('c');
    m.relate(c, a, { kind: 'zulu' });
    m.relate(a, b, { kind: 'writes' });
    m.relate(b, c, { kind: 'alpha' });
    expect(rows(m.toJSON()).filter((x) => x.section === 'kinds').map((x) => x.label)).toEqual([
      'writes',
      'alpha',
      'zulu',
    ]);
  });

  it('explains the aggregate kind, which nothing else in the product names', () => {
    // Two relations between the same visible pair aggregate into one arrow. Their
    // kinds disagree, so compileView labels it with the synthetic 'mixed' kind —
    // a reader meets it on the canvas and can find it explained nowhere else.
    const m = model('agg');
    const a = m.node('a');
    const b = m.node('b');
    m.relate(a, b, { kind: 'sync' });
    m.relate(a, b, { kind: 'writes' });
    expect(rows(m.toJSON()).filter((x) => x.section === 'kinds').map((x) => x.label)).toEqual(['mixed']);
  });

  it('lists a layer that tags only nodes, so it stays switchable', () => {
    const m = model('n');
    m.layer('future', { name: 'Planned', tint: '#999' });
    m.node('a');
    m.node('b', { layer: 'future' });
    expect(rows(m.toJSON()).find((x) => x.layer === 'future')).toMatchObject({ label: 'Planned', active: false });
  });

  it('skips a layer no node or relation in this plane carries', () => {
    const m = model('p');
    m.layer('unused', { name: 'Unused' });
    m.node('a');
    expect(rows(m.toJSON()).some((x) => x.layer === 'unused')).toBe(false);
  });

  it('keeps the layer row of a plane that borrows another plane for containment', () => {
    const m = borrowingPlanes();
    // compileView resolves node visibility against the DONOR plane (see
    // resolveContainmentPlane), so this arrow IS drawn on the flow plane.
    expect(compileView(m, { plane: 'flow' }).edges.map((e) => e.kind)).toEqual(['flow']);
    // Scoping the key by the VIEWPORT plane instead found no visible endpoints
    // and dropped the row: a tinted overlay on screen with no key and no switch.
    expect(rows(m, { plane: planeOf(m, 'flow') }).find((x) => x.layer === 'data-flow')).toMatchObject({
      label: 'Data flow',
      active: true,
      swatch: { draw: 'chip', color: '#0ea5e9' },
    });
  });

  it("obeys the donor plane's hides when a plane borrows its containment", () => {
    // The other half of the same rule: the borrowing plane declares no `hides`,
    // so only consulting the donor's can drop this row.
    const m = model('hides');
    m.layer('data-flow', { name: 'Data flow', tint: '#0ea5e9' });
    m.plane('architecture', { name: 'Architecture', hides: ['db'] });
    m.plane('flow', { name: 'Flow', containmentOf: 'architecture', layers: ['data-flow'] });
    const sys = m.node('sys');
    const db = m.node('db');
    m.relate(sys, db, { kind: 'flow', layer: 'data-flow' });
    const json = m.toJSON();
    expect(compileView(json, { plane: 'flow' }).edges).toEqual([]);
    expect(rows(json, { plane: planeOf(json, 'flow') }).some((x) => x.layer === 'data-flow')).toBe(false);
  });

  it('drops a layer that only tags something outside the drill root', () => {
    // Drilled into `box`, the only things drawn are its interior and external
    // stubs — and a stub carries no layer, so 'ops' would decode nothing.
    // 'wire' still applies: its arrow to the stub is drawn, and tinted.
    const m = model('drill');
    m.layer('ops', { name: 'Ops', tint: '#f59e0b' });
    m.layer('wire', { name: 'Wire', tint: '#0ea5e9' });
    const box = m.node('box');
    const inner = m.node('inner');
    const outside = m.node('outside', { layer: 'ops' });
    box.contains(inner);
    m.relate(inner, outside, { kind: 'flow', layer: 'wire' });
    const json = m.toJSON();
    expect(rows(json).map((x) => x.layer).filter(Boolean)).toEqual(['ops', 'wire']);
    expect(rows(json, { root: 'box' }).map((x) => x.layer).filter(Boolean)).toEqual(['wire']);
  });

  it('lists types only when asked, using the registry label', () => {
    const m = model('t');
    m.node('s', { type: 'c4-system' });
    const r = rows(m.toJSON(), { config: { show: ['types'] } });
    expect(r.map((x) => x.label)).toEqual(['[Software System]']);
    expect(r[0]!.swatch).toMatchObject({ draw: 'shape' });
  });

  it('falls back to the type id for a registry label of "" instead of a blank row', () => {
    // activity leaf types set label: '' to suppress the on-canvas node
    // subtitle (see registry.ts) — that must not leak into the legend as an
    // unlabeled swatch row.
    const m = model('t2');
    m.node('a1', { type: 'activity-action' });
    const r = rows(m.toJSON(), { config: { show: ['types'] } });
    expect(r.map((x) => x.label)).toEqual(['activity-action']);
  });

  it('renames a derived row in place instead of appending', () => {
    const r = rows(fixture(), { config: { items: [{ label: 'Fire-and-forget', kind: 'writes' }] } });
    const kinds = r.filter((x) => x.section === 'kinds');
    expect(kinds.map((x) => x.label)).toEqual(['sync', 'Fire-and-forget']);
    expect(r.some((x) => x.section === 'items')).toBe(false);
  });

  it('appends an item that matches nothing derived', () => {
    const r = rows(fixture(), { config: { items: [{ label: 'Owned by Payments', color: '#f59e0b' }] } });
    expect(r[r.length - 1]).toMatchObject({
      section: 'items',
      label: 'Owned by Payments',
      swatch: { draw: 'chip', color: '#f59e0b' },
    });
  });

  it('tints a kind swatch when every drawn edge of that kind shares one tint', () => {
    // The canvas strokes this arrow with the layer tint, so a registry-only
    // swatch would render grey beside a blue arrow.
    const r = rows(fixture(), { activeLayers: ['data-flow'] });
    expect(r.find((x) => x.id === 'kinds:flow')!.swatch).toMatchObject({
      draw: 'line',
      color: '#0ea5e9',
    });
  });

  it('leaves a kind swatch untinted when it spans a tinted layer and the base sheet', () => {
    const m = model('mixed');
    m.layer('data-flow', { name: 'Data flow', tint: '#0ea5e9' });
    const a = m.node('a');
    const b = m.node('b');
    const c = m.node('c');
    m.relate(a, b, { kind: 'sync' });
    m.relate(b, c, { kind: 'sync', layer: 'data-flow' });
    const r = rows(m.toJSON(), { activeLayers: ['data-flow'] });
    const sync = r.find((x) => x.id === 'kinds:sync')!;
    // Constituents disagree, so the swatch falls back to var(--dg-edge)
    // rather than claiming a colour half the arrows do not have.
    expect(sync.swatch).toMatchObject({ draw: 'line' });
    expect((sync.swatch as { color?: string }).color).toBeUndefined();
  });

  it('leaves a kind swatch untinted when its arrows carry two different tints', () => {
    // The tint-vs-no-tint case above exercises `undefined` on one side; this one
    // makes both sides real colours, so only the value comparison can catch it.
    const m = model('two-tints');
    m.layer('warm', { name: 'Warm', tint: '#f59e0b' });
    m.layer('cool', { name: 'Cool', tint: '#0ea5e9' });
    const a = m.node('a');
    const b = m.node('b');
    const c = m.node('c');
    m.relate(a, b, { kind: 'sync', layer: 'warm' });
    m.relate(b, c, { kind: 'sync', layer: 'cool' });
    const sync = rows(m.toJSON(), { activeLayers: ['warm', 'cool'] }).find((x) => x.id === 'kinds:sync')!;
    expect(sync.swatch).toMatchObject({ draw: 'line' });
    expect((sync.swatch as { color?: string }).color).toBeUndefined();
  });

  it('keeps an item icon when it recaptions a derived type row', () => {
    const m = model('icons');
    m.node('s', { type: 'service' });
    const r = rows(m.toJSON(), {
      config: { show: ['types'], items: [{ label: 'Our services', type: 'service', icon: 'globe' }] },
    });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ label: 'Our services', swatch: { draw: 'shape', icon: 'globe' } });
  });

  it('returns nothing when there is nothing to say', () => {
    const m = model('empty');
    m.node('a');
    expect(rows(m.toJSON())).toEqual([]);
  });
});

describe('legendRows: layers assigned by layerRules', () => {
  it('lists a layer whose only relations reach it through a rule', () => {
    const m = model('lr');
    m.layer('sql', { name: 'SQL', tint: '#2e7d32' });
    const a = m.node('a', { type: 'service' });
    const db = m.node('db', { type: 'database' });
    m.relate(a, db, { kind: 'sql' }); // no explicit layer
    m.layerRules([{ kind: 'sql', layer: 'sql' }]);
    m.plane('p', { name: 'p', layers: ['sql'] });
    m.legend({ show: ['layers'] });
    const j = m.toJSON();
    const compiled = compileView(j, { plane: 'p' });
    const rows = legendRows({
      model: j,
      compiled,
      plane: j.planes[0],
      typeRegistry: createTypeRegistry(),
      kindRegistry: createKindRegistry(),
      config: j.legend!,
      canToggleLayers: false,
    });
    expect(rows.map((r) => r.id)).toContain('layers:sql');
  });
});

describe('drawings row', () => {
  it('appends a Drawings row to the Layers section only when told the plane has strokes', () => {
    const plain = rows(fixture()).filter((r) => r.drawings === true);
    expect(plain).toHaveLength(0);
    const inked = rows(fixture(), { drawings: { active: false } });
    const row = inked.find((r) => r.drawings === true);
    expect(row).toMatchObject({ id: 'layers:$drawings', section: 'layers', label: 'Drawings', active: false });
    expect(row?.swatch).toEqual({ draw: 'line', style: { width: 2.5 }, color: 'var(--dg-ink)' });
    // after every model layer row
    expect(inked.filter((r) => r.section === 'layers').at(-1)?.drawings).toBe(true);
  });

  it('omits the row when the legend hides the layers section', () => {
    expect(rows(fixture(), { drawings: { active: true }, config: { show: ['kinds'] } }).some((r) => r.drawings)).toBe(false);
  });
});
