import { describe, expect, it } from 'vitest';
import { model } from '../builder/index';
import { applyCommand, emptyLayout, openingPins, type EditorCommand, type EditorState } from './index';
import { emptyDrawings } from '../drawings';
import { layoutPlaneKey } from '../planes';
import { TM_FLOW_KIND, TM_PROCESS_TYPE, TM_STORE_TYPE } from '../notations/threat-model/threat-model';

/** The state a command leaves; most tests need nothing else. */
const apply = (state: EditorState, command: EditorCommand): EditorState => applyCommand(state, command).state;

function state(): EditorState {
  const m = model('t');
  m.plane('arch').plane('flow', { containmentOf: 'arch' });
  const a = m.node('a', { type: 'service' });
  const sys = m.node('sys', { type: 'system' });
  sys.contains(a);
  return { model: m.toJSON(), layout: emptyLayout(), drawings: emptyDrawings() };
}

// Declares two real planes, 'default' and 'arch', so `layoutPlaneKey` resolves
// each to its own id (rather than 'default' falling back from a no-planes-declared
// model) and per-plane scoping is genuinely exercised.
function emptyState(): EditorState {
  const m = model('t');
  m.plane('default').plane('arch');
  return { model: m.toJSON(), layout: emptyLayout(), drawings: emptyDrawings() };
}

describe('layout commands', () => {
  it('positions key by resolved containment plane (borrowed planes share)', () => {
    const before = state();
    expect(layoutPlaneKey(before.model, 'flow')).toBe('arch');
    const s = apply(before, { type: 'set-position', plane: 'flow', nodeId: 'a', x: 5, y: 6 });
    expect(s.layout.planes['arch']).toEqual({ a: { x: 5, y: 6 } });
    const cleared = apply(s, { type: 'clear-position', plane: 'arch', nodeId: 'a' });
    expect(cleared.layout.planes['arch']).toEqual({});
  });

  it('layoutPlaneKey falls back to default for plane-less models', () => {
    const m = model('p');
    m.node('x', { type: 't' });
    expect(layoutPlaneKey(m.toJSON())).toBe('default');
  });

  it('set-unfolded replaces the plane list (sorted, unique); an emptied list and map are dropped', () => {
    let s = apply(state(), { type: 'set-unfolded', plane: 'arch', ids: ['sys', 'a', 'sys'] });
    expect(s.layout.unfolded).toEqual({ arch: ['a', 'sys'] });
    // a replace, not a merge: what is not named no longer opens unfolded
    s = apply(s, { type: 'set-unfolded', plane: 'arch', ids: ['other'] });
    expect(s.layout.unfolded).toEqual({ arch: ['other'] });
    s = apply(s, { type: 'set-unfolded', plane: 'arch', ids: [] });
    expect('unfolded' in s.layout).toBe(false);
  });

  it("openingPins reads a plane's unfolded list as expanded pins, by resolved plane key", () => {
    const s = apply(state(), { type: 'set-unfolded', plane: 'arch', ids: ['sys'] });
    expect(openingPins(s.layout, s.model, 'arch')).toEqual({ sys: 'expanded' });
    expect(openingPins(s.layout, s.model, 'flow')).toEqual({ sys: 'expanded' }); // borrows arch's structure
    expect(openingPins(undefined, s.model, 'arch')).toEqual({});
  });

  it('clear-positions empties one plane', () => {
    let s = state();
    s = apply(s, { type: 'set-position', nodeId: 'a', x: 1, y: 1 });
    s = apply(s, { type: 'set-position', nodeId: 'sys', x: 2, y: 2 });
    s = apply(s, { type: 'clear-positions' });
    expect(s.layout.planes[layoutPlaneKey(s.model)]).toEqual({});
  });

  it('set-positions bulk-merges pins into the resolved plane bucket', () => {
    let s = apply(emptyState(), { type: 'set-position', nodeId: 'a', x: 1, y: 2 });
    s = apply(s, { type: 'set-positions', positions: { b: { x: 3, y: 4 }, c: { x: 5, y: 6 } } });
    expect(s.layout.planes['default']).toEqual({ a: { x: 1, y: 2 }, b: { x: 3, y: 4 }, c: { x: 5, y: 6 } });
  });

  it('set-plane-layout toggles the per-plane manual flag on and off', () => {
    let s = apply(emptyState(), { type: 'set-plane-layout', manual: true });
    expect(s.layout.manual).toEqual({ default: true });
    s = apply(s, { type: 'set-plane-layout', manual: false });
    expect(s.layout.manual).toBeUndefined();
  });

  it('set-plane-layout scopes the flag to the named plane', () => {
    const s = apply(emptyState(), { type: 'set-plane-layout', plane: 'arch', manual: true });
    expect(s.layout.manual).toEqual({ arch: true });
  });

  it('set-layout-settings merges patches into the per-plane bucket', () => {
    let s = apply(emptyState(), { type: 'set-layout-settings', patch: { algorithm: 'radial' } });
    expect(s.layout.settings).toEqual({ default: { algorithm: 'radial' } });
    // a second patch merges rather than replaces
    s = apply(s, { type: 'set-layout-settings', patch: { direction: 'DOWN' } });
    expect(s.layout.settings).toEqual({ default: { algorithm: 'radial', direction: 'DOWN' } });
  });

  it('set-layout-settings clears a field set to undefined and drops emptied maps', () => {
    let s = apply(emptyState(), { type: 'set-layout-settings', patch: { algorithm: 'force', spacing: 50 } });
    s = apply(s, { type: 'set-layout-settings', patch: { spacing: undefined } });
    expect(s.layout.settings).toEqual({ default: { algorithm: 'force' } });
    // clearing the last field drops the whole settings map (mirrors manual)
    s = apply(s, { type: 'set-layout-settings', patch: { algorithm: undefined } });
    expect(s.layout.settings).toBeUndefined();
  });

  it('set-layout-settings scopes to the named plane', () => {
    const s = apply(emptyState(), {
      type: 'set-layout-settings',
      plane: 'arch',
      patch: { edgeRouting: 'orthogonal' },
    });
    expect(s.layout.settings).toEqual({ arch: { edgeRouting: 'orthogonal' } });
  });
});

describe('notes (layout-only)', () => {
  /** the builder's synthesized id for the single a->b flow */
  const flowId = 'a->b#0';

  /** node `a` and flow `a->b#0`, each carrying one threat: the two elements a
   * note can hang off. Plane-less, so every key resolves to `default`. */
  function noteState(): EditorState {
    const m = model('t');
    const a = m.node('a', { type: TM_PROCESS_TYPE });
    const b = m.node('b', { type: TM_STORE_TYPE });
    m.relate(a, b, { kind: TM_FLOW_KIND });
    let s: EditorState = { model: m.toJSON(), layout: emptyLayout(), drawings: emptyDrawings() };
    s = apply(s, {
      type: 'add-threat',
      target: { node: 'a' },
      threat: { id: 't1', category: 'E', title: 'Admin route' },
    });
    s = apply(s, {
      type: 'add-threat',
      target: { relation: flowId },
      threat: { id: 't1', category: 'T', title: 'MITM' },
    });
    return s;
  }

  it('set-note-offset writes and clears the plane bucket', () => {
    const before = noteState();
    const key = layoutPlaneKey(before.model);
    const s1 = apply(before, { type: 'set-note-offset', target: { node: 'a' }, offset: { dx: 10, dy: -5 } });
    expect(s1.layout.notes).toEqual({ [key]: { 'node:a': { dx: 10, dy: -5 } } });
    expect(s1.model).toBe(before.model); // model untouched — this is a picture, not a finding
    const s2 = apply(s1, { type: 'set-note-offset', target: { node: 'a' }, offset: null });
    expect(s2.layout.notes).toBeUndefined(); // emptied bucket and map are omitted
  });

  it('set-note-offset scopes to the named plane and keeps the two namespaces apart', () => {
    let s = apply(noteState(), { type: 'set-note-offset', target: { node: 'a' }, offset: { dx: 1, dy: 2 } });
    s = apply(s, { type: 'set-note-offset', target: { relation: flowId }, offset: { dx: 3, dy: 4 } });
    expect(s.layout.notes?.['default']).toEqual({
      'node:a': { dx: 1, dy: 2 },
      [`relation:${flowId}`]: { dx: 3, dy: 4 },
    });
  });

  it('set-note-open writes open: true, and clearing it prunes an offset-less entry', () => {
    const before = noteState();
    const key = layoutPlaneKey(before.model);
    const s1 = apply(before, { type: 'set-note-open', target: { node: 'a' }, open: true });
    expect(s1.layout.notes).toEqual({ [key]: { 'node:a': { dx: 0, dy: 0, open: true } } });
    expect(s1.model).toBe(before.model);
    // closing a note that was never dragged leaves no trace in the file
    expect(apply(s1, { type: 'set-note-open', target: { node: 'a' }, open: false }).layout.notes).toBeUndefined();
  });

  it('set-note-open keeps a dragged offset either way, and set-note-offset keeps open', () => {
    const key = layoutPlaneKey(noteState().model);
    let s = apply(noteState(), { type: 'set-note-offset', target: { node: 'a' }, offset: { dx: 10, dy: 5 } });
    s = apply(s, { type: 'set-note-open', target: { node: 'a' }, open: true });
    expect(s.layout.notes?.[key]?.['node:a']).toEqual({ dx: 10, dy: 5, open: true });
    s = apply(s, { type: 'set-note-open', target: { node: 'a' }, open: false });
    expect(s.layout.notes?.[key]?.['node:a']).toEqual({ dx: 10, dy: 5 }); // closed: reopens where it was left
    s = apply(s, { type: 'set-note-open', target: { node: 'a' }, open: true });
    // `null` = back to the automatic spot; the note stays open
    s = apply(s, { type: 'set-note-offset', target: { node: 'a' }, offset: null });
    expect(s.layout.notes?.[key]?.['node:a']).toEqual({ dx: 0, dy: 0, open: true });
  });

  it('set-notes-open opens every threat-bearing element and closes them all again', () => {
    const before = noteState();
    const key = layoutPlaneKey(before.model);
    const s1 = apply(before, { type: 'set-notes-open', open: true });
    expect(s1.layout.notes).toEqual({
      [key]: { 'node:a': { dx: 0, dy: 0, open: true }, [`relation:${flowId}`]: { dx: 0, dy: 0, open: true } },
    });
    // `b` has no threats, so it gets no entry
    expect(s1.layout.notes?.[key]?.['node:b']).toBeUndefined();
    const dragged = apply(s1, { type: 'set-note-offset', target: { node: 'a' }, offset: { dx: 3, dy: 3 } });
    const s2 = apply(dragged, { type: 'set-notes-open', open: false });
    // close-all keeps offsets and drops the rest
    expect(s2.layout.notes).toEqual({ [key]: { 'node:a': { dx: 3, dy: 3 } } });
  });

  it('set-notes-open scopes to the named plane', () => {
    const m = model('t');
    m.plane('p');
    const a = m.node('a', { type: TM_PROCESS_TYPE });
    m.node('sys', { type: 'system' }).contains(a, { plane: 'p' });
    const base: EditorState = { model: m.toJSON(), layout: emptyLayout(), drawings: emptyDrawings() };
    const withThreat = apply(base, {
      type: 'add-threat',
      target: { node: 'a' },
      threat: { id: 't1', category: 'E', title: 'Admin route' },
    });
    const s = apply(withThreat, { type: 'set-notes-open', plane: 'p', open: true });
    expect(s.layout.notes).toEqual({ p: { 'node:a': { dx: 0, dy: 0, open: true } } });
  });

  it('prunes a note offset when its element loses its last threat or is deleted', () => {
    const before = noteState();
    const key = layoutPlaneKey(before.model);
    const s1 = apply(before, { type: 'set-note-offset', target: { node: 'a' }, offset: { dx: 1, dy: 1 } });
    const s2 = apply(s1, { type: 'set-note-offset', target: { relation: flowId }, offset: { dx: 2, dy: 2 } });

    const gone = apply(s2, { type: 'remove-threat', target: { node: 'a' }, id: 't1' });
    expect(Object.keys(gone.layout.notes?.[key] ?? {})).toEqual([`relation:${flowId}`]);

    const del = apply(s2, { type: 'delete-relation', id: flowId });
    expect(Object.keys(del.layout.notes?.[key] ?? {})).toEqual(['node:a']);

    const deleted = apply(s2, { type: 'delete-node', id: 'a' });
    expect(deleted.layout.notes?.[key]?.['node:a']).toBeUndefined();

    // an untouched layout overlay keeps its identity (no needless re-render / re-save)
    const same = apply(s2, { type: 'rename-node', id: 'a', name: 'A2' });
    expect(same.layout).toBe(s2.layout);
  });

  it('drops the notes map entirely when its last entry dies', () => {
    let s = apply(noteState(), { type: 'set-note-offset', target: { node: 'a' }, offset: { dx: 1, dy: 1 } });
    s = apply(s, { type: 'remove-threat', target: { node: 'a' }, id: 't1' });
    expect(s.layout.notes).toBeUndefined();
  });

  it('delete-plane drops the plane’s notes', () => {
    const m = model('t');
    m.plane('p');
    const a = m.node('a', { type: TM_PROCESS_TYPE });
    m.node('sys', { type: 'system' }).contains(a, { plane: 'p' });
    const base: EditorState = { model: m.toJSON(), layout: emptyLayout(), drawings: emptyDrawings() };
    const withThreat = apply(base, {
      type: 'add-threat',
      target: { node: 'a' },
      threat: { id: 't1', category: 'E', title: 'Admin route' },
    });
    const s1 = apply(withThreat, {
      type: 'set-note-offset',
      target: { node: 'a' },
      plane: 'p',
      offset: { dx: 1, dy: 1 },
    });
    // both halves of the entry — the dragged offset and the open flag — so the
    // prune is proved against a full bucket, not just an offset
    const s2 = apply(s1, { type: 'set-note-open', target: { node: 'a' }, plane: 'p', open: true });
    expect(s2.layout.notes).toEqual({ p: { 'node:a': { dx: 1, dy: 1, open: true } } });
    const s3 = apply(s2, { type: 'delete-plane', id: 'p' });
    expect(s3.layout.notes).toBeUndefined();
  });
});
