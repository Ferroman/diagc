import type { Column } from '@diagramming/core';
import { Position } from '@xyflow/react';

export const TABLE_HEADER_H = 30;
export const TABLE_ROW_H = 22;

const CHAR_W = 7.2; // matches label-size md metrics
const PAD_X = 20;
const MARKER_W = 24; // reserved lead column for 🔑 / FK markers
const TYPE_GAP = 16; // gap between column name and its type
const MIN_TABLE_W = 160;
const MAX_TABLE_W = 340;

/** Deterministic (no-DOM) intrinsic size for an ER table, fed into elk. */
export function tableSize(columns: Column[], title = ''): { width: number; height: number } {
  const rowW = (c: Column) => MARKER_W + c.name.length * CHAR_W + TYPE_GAP + (c.type?.length ?? 0) * CHAR_W;
  const body = columns.reduce((max, c) => Math.max(max, rowW(c)), 0);
  const head = title.length * CHAR_W;
  const width = Math.min(MAX_TABLE_W, Math.max(MIN_TABLE_W, Math.round(Math.max(body, head) + PAD_X)));
  const height = TABLE_HEADER_H + columns.length * TABLE_ROW_H;
  return { width, height };
}

/** Vertical center of column `index`'s row, relative to the table node's top. */
export function rowCenterY(index: number): number {
  return TABLE_HEADER_H + index * TABLE_ROW_H + TABLE_ROW_H / 2;
}

export interface TableEndpointRect {
  x: number;
  y: number;
  width: number;
  height: number;
  columns?: Column[];
}

/**
 * Override an edge endpoint's y to a column's row center, keeping x on the
 * facing left/right border. Returns the endpoint unchanged for top/bottom faces
 * (a row port only reads on the vertical edges) or an unknown column.
 */
export function anchorToRow(
  end: { x: number; y: number; pos: Position },
  node: TableEndpointRect,
  columnName: string | undefined,
): { x: number; y: number; pos: Position } {
  if (columnName === undefined || node.columns === undefined) return end;
  if (end.pos !== Position.Left && end.pos !== Position.Right) return end;
  const index = node.columns.findIndex((c) => c.name === columnName);
  if (index < 0) return end;
  const x = end.pos === Position.Left ? node.x : node.x + node.width;
  return { x, y: node.y + rowCenterY(index), pos: end.pos };
}
