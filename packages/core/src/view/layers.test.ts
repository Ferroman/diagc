import { describe, expect, it } from 'vitest';
import { model } from '../builder';
import { compileView } from './compile';
import type { DiagramModel } from '../types';

/** base node `a`, a sheet `notes` carrying node `note`, plus a base edge a->note
 *  and a sheet edge a->note. */
function sheetsModel(): DiagramModel {
  const m = model('sheets');
  m.layer('notes', { name: 'Notes' });
  const a = m.node('a', { type: 'service' });
  const note = m.node('note', { type: 'service', layer: 'notes' });
  m.relate(a, note, { kind: 'sync' }); // base edge onto a layered node
  m.relate(a, note, { kind: 'flow', layer: 'notes' }); // sheet edge
  return m.toJSON();
}

const ids = (nodes: { id: string }[]) => nodes.map((n) => n.id);

describe('layer node visibility', () => {
  it('hides a layered node (and every edge touching it) while its layer is off', () => {
    const v = compileView(sheetsModel(), {});
    expect(ids(v.roots)).toEqual(['a']); // base node only; note is on an inactive sheet
    expect(v.edges).toEqual([]); // base edge dropped (endpoint gone), sheet edge off
  });

  it('reveals the layered node and its sheet edge once the layer is active', () => {
    const v = compileView(sheetsModel(), { activeLayers: ['notes'] });
    expect(ids(v.roots)).toEqual(['a', 'note']);
    // both the base edge and the now-active sheet edge resolve
    expect(v.edges.map((e) => e.from + '->' + e.to)).toEqual(['a->note', 'a->note']);
  });

  it('a plane preset layer keeps its layered nodes on without an explicit toggle', () => {
    const m = model('preset');
    m.layer('notes', { name: 'Notes' });
    m.plane('main', { layers: ['notes'] });
    m.node('a', { type: 'service' });
    m.node('note', { type: 'service', layer: 'notes' });
    const v = compileView(m.toJSON(), { plane: 'main' });
    expect(ids(v.roots)).toEqual(['a', 'note']);
  });
});
