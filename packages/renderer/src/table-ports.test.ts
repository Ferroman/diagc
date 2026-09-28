import { describe, expect, it } from 'vitest';
import { Position } from '@xyflow/react';
import { compileView, type DiagramModel } from '@diagc/core';
import { TABLE_HEADER_H, TABLE_ROW_H, tableSize, rowCenterY, anchorToRow, withShownTableRows } from './table-ports';

describe('table-ports', () => {
  it('height grows one row per column', () => {
    const two = tableSize([{ name: 'a' }, { name: 'b' }]);
    expect(two.height).toBe(TABLE_HEADER_H + 2 * TABLE_ROW_H);
  });
  it('rowCenterY is the vertical middle of the row under the header', () => {
    expect(rowCenterY(0)).toBe(TABLE_HEADER_H + TABLE_ROW_H / 2);
    expect(rowCenterY(2)).toBe(TABLE_HEADER_H + 2 * TABLE_ROW_H + TABLE_ROW_H / 2);
  });
  it('anchorToRow pins y to the column row on a left/right face', () => {
    const node = { x: 100, y: 200, width: 180, height: 200, columns: [{ name: 'id' }, { name: 'ref' }] };
    const a = anchorToRow({ x: 100, y: 260, pos: Position.Left }, node, 'ref');
    expect(a).toEqual({ x: 100, y: 200 + rowCenterY(1), pos: Position.Left });
    const b = anchorToRow({ x: 280, y: 260, pos: Position.Right }, node, 'ref');
    expect(b.x).toBe(280); // node.x + width
  });
  it('anchorToRow leaves top/bottom faces and unknown columns unchanged', () => {
    const node = { x: 0, y: 0, width: 10, height: 10, columns: [{ name: 'id' }] };
    const top = { x: 5, y: 0, pos: Position.Top };
    expect(anchorToRow(top, node, 'id')).toEqual(top);
    expect(anchorToRow({ x: 0, y: 5, pos: Position.Left }, node, 'ghost')).toEqual({ x: 0, y: 5, pos: Position.Left });
  });
});

describe('withShownTableRows', () => {
  const m: DiagramModel = {
    version: 1,
    id: 'er',
    name: 'er',
    nodes: [
      { id: 't', name: 't', type: 'db-table', columns: [{ name: 'id' }, { name: 'flag', layer: 'flags' }] },
      { id: 'u', name: 'u', type: 'db-table', columns: [{ name: 'id' }] },
    ],
    containment: [],
    relations: [],
    layers: [{ id: 'flags', name: 'Flags' }],
    planes: [],
  };
  const hints = new Map([['t', tableSize(m.nodes[0]!.columns!, 't')]]);

  it('sizes a filtered table by the rows it draws', () => {
    const out = withShownTableRows(compileView(m, {}).roots, hints, undefined);
    expect(out.get('t')?.height).toBe(TABLE_HEADER_H + TABLE_ROW_H);
    expect(hints.get('t')?.height).toBe(TABLE_HEADER_H + 2 * TABLE_ROW_H); // input untouched
  });

  it('returns the hints as is when no row is hidden, or the table was resized by hand', () => {
    expect(withShownTableRows(compileView(m, { activeLayers: ['flags'] }).roots, hints, undefined)).toBe(hints);
    expect(withShownTableRows(compileView(m, {}).roots, hints, { t: { w: 200, h: 90 } })).toBe(hints);
  });
});
