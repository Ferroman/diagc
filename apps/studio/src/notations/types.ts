import type { ReactNode } from 'react';
import type { DiagramModel, EditorCommand, Point } from '@diagc/core/internal';
import type { DiagramSelection } from '@diagc/renderer';
import type { QuickAddRecipes } from '../canvas-editing/quickAddRecipe';

/** What a dock panel is rendered with: a notation's own, or a feature's (see DOCK_FEATURES). */
export interface NotationDockContext {
  model: DiagramModel;
  editing: boolean;
  /** the plane on screen */
  viewPlane: string | undefined;
  /** the plane a node the panel adds is tagged with: the plane on screen when it
   * keeps nodes of its own, none when it borrows its containment — the node is
   * then shared, since a borrowing plane's own id would hide it (see createNodeAt) */
  scopePlane: string | undefined;
  selection: DiagramSelection | null;
  /** the host's date, YYYY-MM-DD */
  today: string;
  onCommand: (command: EditorCommand) => void;
  select: (selection: DiagramSelection | null) => void;
  /** open a node the panel created for naming on the canvas */
  requestLabelEdit: (id: string) => void;
}

/** A panel in the right dock. `edit` panels show only while editing; `both`
 * also in view mode, for a panel that only reads the model. */
export interface DockEntry {
  modes: 'edit' | 'both';
  render: (ctx: NotationDockContext) => ReactNode;
}

/** A drag that ended: where each moved node sits now, parent-relative, and how far it went. */
export interface NodesMovedGesture {
  model: DiagramModel;
  plane: string | undefined;
  positions: Record<string, Point>;
  deltas: Record<string, { dx: number; dy: number }>;
}

/** A node dropped into another (see the renderer's `dropTarget`), at `rel` inside it. */
export interface DropIntoGesture {
  model: DiagramModel;
  plane: string | undefined;
  id: string;
  targetId: string;
  rel: Point;
}

/** A resize handle let go: the node's new box, and its origin when a top or left handle moved it. */
export interface ResizeGesture {
  model: DiagramModel;
  plane: string | undefined;
  id: string;
  w: number;
  h: number;
  pos: Point;
}

/**
 * Canvas gestures a notation reads its own way. A notation that answers one
 * consumes it: `undefined` means the gesture changed nothing, so nothing is
 * dispatched and undo has nothing to remember. `resize` alone may hand a node
 * back with `'generic'`, which saves its size and position like any box.
 */
export interface NotationGestures {
  nodesMoved?: (gesture: NodesMovedGesture) => EditorCommand | undefined;
  dropInto?: (gesture: DropIntoGesture) => EditorCommand | undefined;
  resize?: (gesture: ResizeGesture) => EditorCommand | undefined | 'generic';
}

/**
 * What a notation adds to the studio. Every field is optional, and absent means
 * the generic behaviour, so a stencil notation (C4, deployment) is `{}`. Callers
 * ask for a capability, never for a notation id.
 */
export interface StudioNotationProfile {
  /** the name the notation selects show; absent, derived from the id */
  label?: string;
  /** the notation's panel, first in the right dock */
  dock?: DockEntry;
  /** the leverage analysis in the left dock in view mode, and a ctrl-click
   * compare of two variables */
  loopAnalysis?: boolean;
  gestures?: NotationGestures;
  /** the relation kind a connect gesture or a connected quick add draws; absent, `sync` */
  connectKind?: (model: DiagramModel | undefined, from: string, to: string) => string;
  /** what `+` and Tab add on a node, asked after the activity's rules and
   * before the generic sibling */
  quickAdd?: QuickAddRecipes;
  /** x is a date on the notation's planes, so a zone or event placed by a drop
   * takes its day from the drop point (elsewhere it is still seeded, from its
   * parent or today) */
  datesFromDropPoint?: boolean;
  /** the node panel offers the plan dates of a zone or event */
  planSection?: boolean;
}
