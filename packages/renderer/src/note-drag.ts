import type { Node, XYPosition } from '@xyflow/react';
import type { ThreatTarget } from '@diagc/core';
import type { NoteData } from './NoteNode';
import type { Positions } from './useNudge';

/** one note the gesture moved, as the host wants to hear about it */
export interface NoteMove {
  target: ThreatTarget;
  offset: { dx: number; dy: number };
}

/**
 * Split one drag batch into the notes it moved and the boxes it moved.
 *
 * React Flow hands over every node a gesture touched (a selection drags as
 * one), and the two kinds land in different places: a box's new position is a
 * position, a note's is an OFFSET from the anchor its element gives it, saved
 * on its own key. Writing a note's position into the box overlay would pin a
 * phantom node there — nothing in the model answers to a `note:` id.
 *
 * Both spaces are the same: a note is parented like the element it annotates
 * (see DiagramView's note derivation), so its position and its anchor are both
 * parent-relative and the difference is the offset, whatever container the
 * element sits in. Rounded because the overlay is a hand-editable file and a
 * pointer gesture has no business writing 37.000000000001 into it.
 *
 * Pure so the arithmetic can be tested: React Flow's drag is a pointer gesture
 * jsdom cannot drive (see the note in DiagramView.test.tsx), which leaves the
 * component test able to prove the wiring but not the sums.
 *
 * `positions` is the caller's own node copy — for a child with `expandParent`,
 * the drag event carries XYDrag's raw position, which is neither clamped to the
 * (moving) parent nor guide-snapped. A node missing from it falls back to the
 * position it arrived with.
 */
export function splitNoteDrag(
  nodes: readonly Node[],
  positions: ReadonlyMap<string, XYPosition>,
): { notes: NoteMove[]; boxes: Positions } {
  const notes: NoteMove[] = [];
  const boxes: Positions = {};
  for (const n of nodes) {
    const pos = positions.get(n.id) ?? n.position;
    if (n.type !== 'note') {
      boxes[n.id] = pos;
      continue;
    }
    // Read the channel as partial: a note whose element vanished mid-gesture
    // (or any future note without an anchor) has nothing to measure from, and
    // guessing an offset would move it on the next render.
    const d = n.data as unknown as Partial<NoteData>;
    if (d.target === undefined || d.anchor === undefined) continue;
    notes.push({
      target: d.target,
      offset: { dx: Math.round(pos.x - d.anchor.x), dy: Math.round(pos.y - d.anchor.y) },
    });
  }
  return { notes, boxes };
}
