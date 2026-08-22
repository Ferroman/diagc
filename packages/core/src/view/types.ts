import type { DiagramNode, DiagramRelation, EdgeLabel, Polarity, RelationStyle } from '../types';

export type NodeViewState = 'leaf' | 'expanded' | 'collapsed';

/** Collapse decisions for container nodes only; leaves never appear. */
export type LodState = Record<string, 'expanded' | 'collapsed'>;

export interface ViewportState {
  /** active plane id; absent = the model's first-declared plane (or the implicit one) */
  plane?: string;
  /** container ids the viewer is zoomed into (renderer-computed focus chain) */
  focus?: string[];
  pins?: Record<string, 'expanded' | 'collapsed'>;
  /** layer ids to draw. ABSENT = the host has no opinion, so the active plane's
   * `layers` presets apply; PRESENT = the host's own choice, which replaces the
   * presets entirely — an empty array therefore means "no layers at all", not
   * "presets only". A host with a layer switch seeds its state from the plane's
   * `layers` (on load and on every plane change) and owns it from then on. */
  activeLayers?: string[];
  /** nested-zoom drill root: when set, the view is scoped to this node's INTERIOR
   * — its children become the top-level content (the node itself isn't drawn) and
   * everything outside its subtree disappears. Relations crossing the boundary are
   * re-pointed to an external stub node (see ViewNode.external). */
  root?: string;
}

export interface Size {
  width: number;
  height: number;
}

export interface ViewNode {
  id: string;
  node: DiagramNode;
  state: NodeViewState;
  children: ViewNode[];
  promoted: boolean;
  /** Ids of shared nodes contained here but rendered elsewhere. */
  sharedMembers: string[];
  /** Set on a drill-view stub node: the id of the real (off-frame) node it stands
   * in for — an edge to something outside the current drill root. Clicking it
   * navigates into that node. */
  external?: string;
}

export interface ViewEdge {
  id: string;
  from: string;
  to: string;
  kind: string;
  label?: string;
  /** the sole constituent's positioned labels; aggregated edges have none */
  labels?: EdgeLabel[];
  layer?: string;
  tint?: string;
  /** the sole constituent's per-relation style; aggregated edges have none */
  style?: RelationStyle;
  /** CLD polarity: a single constituent's sign, or an aggregate's shared sign when every constituent agrees; absent when constituents disagree or any lacks a sign */
  polarity?: Polarity;
  /** the sole constituent's CLD delay marker; aggregated edges have none */
  delay?: boolean;
  constituents: DiagramRelation[];
}

export interface CompiledView {
  roots: ViewNode[];
  /** the arrows to DRAW (filtered by active layers / plane) */
  edges: ViewEdge[];
  /** the arrows to LAYOUT BY (all layers + base) — stable across overlay
   * toggles and structure-sharing planes, so boxes never jump */
  layoutEdges: ViewEdge[];
  lod: LodState;
  /** drill view only: stub node id -> the real off-frame node it represents. */
  externals?: Map<string, string>;
}
