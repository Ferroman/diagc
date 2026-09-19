import type { Node, XYPosition } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import type { NoteData } from './NoteNode';
import { splitNoteDrag } from './note-drag';

const note = (id: string, position: XYPosition, data: Partial<NoteData>): Node => ({
  id,
  type: 'note',
  position,
  data: data as unknown as Record<string, unknown>,
});
const box = (id: string, position: XYPosition): Node => ({ id, position, data: {} });
const at = (...entries: [string, XYPosition][]): ReadonlyMap<string, XYPosition> => new Map(entries);

describe('splitNoteDrag', () => {
  it('measures a note as the offset from its anchor, signed', () => {
    const n = note('note:node:web', { x: 10, y: 5 }, { target: { node: 'web' }, anchor: { x: 50, y: 40 } });
    const { notes } = splitNoteDrag([n], at(['note:node:web', { x: 10, y: 5 }]));
    // dragged up and to the LEFT of where the element puts it: both negative
    expect(notes).toEqual([{ target: { node: 'web' }, offset: { dx: -40, dy: -35 } }]);
  });

  it('rounds the offset to whole pixels', () => {
    const n = note('note:relation:f', { x: 0, y: 0 }, { target: { relation: 'f' }, anchor: { x: 0, y: 0 } });
    const { notes } = splitNoteDrag([n], at(['note:relation:f', { x: 12.4, y: 12.6 }]));
    // the overlay is a hand-editable file: .4 down, .6 up, nothing longer
    expect(notes[0]?.offset).toEqual({ dx: 12, dy: 13 });
  });

  it('reads position and anchor in the same (parent-relative) space', () => {
    // A note parented to a container carries a parent-relative position, and
    // its anchor is derived from the same geometry — so a note sitting exactly
    // `anchor + (10, 20)` reads as (10, 20) whatever the container's own origin.
    const n = note('note:node:web', { x: 0, y: 0 }, { target: { node: 'web' }, anchor: { x: 200, y: 120 } });
    const { notes } = splitNoteDrag([n], at(['note:node:web', { x: 210, y: 140 }]));
    expect(notes[0]?.offset).toEqual({ dx: 10, dy: 20 });
  });

  it('skips a note with nothing to measure from', () => {
    const n = note('note:node:web', { x: 10, y: 10 }, { target: { node: 'web' } }); // no anchor
    const out = splitNoteDrag([n], at(['note:node:web', { x: 10, y: 10 }]));
    expect(out).toEqual({ notes: [], boxes: {} });
  });

  it('splits a mixed batch, and no note id reaches the box positions', () => {
    const nodes = [
      box('web', { x: 0, y: 0 }),
      note('note:node:web', { x: 0, y: 0 }, { target: { node: 'web' }, anchor: { x: 100, y: 0 } }),
      box('db', { x: 9, y: 9 }), // absent from the map: falls back to its own position
    ];
    const { notes, boxes } = splitNoteDrag(
      nodes,
      at(['web', { x: 30, y: 60 }], ['note:node:web', { x: 130, y: 20 }]),
    );
    expect(notes).toEqual([{ target: { node: 'web' }, offset: { dx: 30, dy: 20 } }]);
    expect(boxes).toEqual({ web: { x: 30, y: 60 }, db: { x: 9, y: 9 } });
    expect(Object.keys(boxes).some((id) => id.startsWith('note:'))).toBe(false);
  });

  it('a model node whose id starts with `note:` is a box, not a note', () => {
    // The id prefix is a convention, not a guarantee — only the node TYPE says
    // the data channel is a note's, and this one's is a box's.
    const { notes, boxes } = splitNoteDrag([box('note:x', { x: 4, y: 4 })], at(['note:x', { x: 7, y: 8 }]));
    expect(notes).toEqual([]);
    expect(boxes).toEqual({ 'note:x': { x: 7, y: 8 } });
  });

  it('gives an empty batch an empty result', () => {
    expect(splitNoteDrag([], at())).toEqual({ notes: [], boxes: {} });
  });
});
