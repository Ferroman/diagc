import { describe, expect, it } from 'vitest';
import { model } from '../builder';
import { compileView } from './compile';
import type { DiagramModel } from '../types';

// The nested-zoom feature relies entirely on the existing view compiler to roll
// fine-grained relations up to whichever ancestor is currently visible. These
// tests characterize that behavior for the user's canonical case — and go one
// level DEEPER than edges.test.ts to prove grandparent (ancestor-of-ancestor)
// aggregation works, which is what "infinite" drill-down needs.
//
//   service ─contains→ class ─contains→ method        db ─contains→ schema ─contains→ table
//   relation: method → table   (authored at the leaf level only)

function nestedModel(): DiagramModel {
  const m = model('nested');
  const service = m.node('service', { type: 'system' });
  const cls = m.node('cls', { type: 'service' });
  const method = m.node('method', { type: 'method' });
  const db = m.node('db', { type: 'system' });
  const schema = m.node('schema', { type: 'service' });
  const table = m.node('table', { type: 'table' });
  service.contains(cls);
  cls.contains(method);
  db.contains(schema);
  schema.contains(table);
  m.relate(method, table, { kind: 'reads' });
  return m.toJSON();
}

const edgeIds = (m: DiagramModel, focus: string[]) => compileView(m, { focus }).edges.map((e) => e.id);

describe('nested-zoom edge aggregation (bird’s-eye ⇄ drilled)', () => {
  it("bird's-eye (nothing entered): the leaf relation reads as service → db across TWO collapsed levels", () => {
    // service and db each collapse over a class/schema AND a method/table.
    expect(edgeIds(nestedModel(), [])).toEqual(['service=>db:']);
  });

  it('entering service (down to the class) unfolds its side; db still reads as one box', () => {
    // method is now visible; table is still folded away inside db.
    expect(edgeIds(nestedModel(), ['service', 'cls'])).toEqual(['method=>db:']);
  });

  it('entering both sides fully reveals the real leaf-to-leaf relation', () => {
    expect(edgeIds(nestedModel(), ['service', 'cls', 'db', 'schema'])).toEqual(['method=>table:']);
  });

  it('aggregates multiple fine relations into one counted edge at the bird’s-eye', () => {
    const m = model('nested2');
    const service = m.node('service', { type: 'system' });
    const cls = m.node('cls', { type: 'service' });
    const method = m.node('method', { type: 'method' });
    const db = m.node('db', { type: 'system' });
    const tableA = m.node('tableA', { type: 'table' });
    const tableB = m.node('tableB', { type: 'table' });
    service.contains(cls);
    cls.contains(method);
    db.contains(tableA, tableB);
    m.relate(method, tableA, { kind: 'reads' });
    m.relate(method, tableB, { kind: 'writes' });
    const j = m.toJSON();
    const top = compileView(j, { focus: [] }).edges;
    expect(top).toHaveLength(1);
    expect(top[0]).toMatchObject({ id: 'service=>db:', from: 'service', to: 'db', label: '2 relations' });
  });
});
