import { createContext } from 'react';
import type { ThreatTarget } from '@diagramming/core';
import type { Point } from './note-place';

/**
 * Which threat bubbles are open, and the switch that flips one — read by the
 * node badge (DiagramNode) and the flow chip (DiagramEdge), provided by
 * DiagramView around the whole canvas (the LoopHighlightContext precedent).
 * A context rather than a field on the node data: a toggle then re-renders
 * the badges that read it and rebuilds no node data at all. `null` = no
 * bubbles on this canvas (a host passing notes={false}); badges stay passive.
 */
export interface NoteState {
  /** `key` is threatTargetKey(target) */
  isOpen: (key: string) => boolean;
  toggle: (target: ThreatTarget) => void;
  /** where a flow's chip is drawn, in flow coordinates, the unit direction it
   * was pushed off its line, and the line itself sampled end to end — reported
   * by the edge, which alone knows its routed curve, so the relation's bubble
   * can hang off the chip on the side away from the line and every bubble can
   * keep off the line. Stable across renders; a repeat is a no-op. */
  placeChip: (relation: string, at: Point, away: Point, line: readonly Point[]) => void;
}

export const NoteStateContext = createContext<NoteState | null>(null);
