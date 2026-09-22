// Pure builders for the data channel React Flow carries into the custom
// DiagramNode/DiagramEdge components. DiagramView previously constructed these
// inline with ~18 conditional spreads per node (typo-fragile, and every node's
// `data` object was rebuilt every render — defeating memoization). Extracting
// the builders makes them unit-testable and lets the view memoize the built
// data: the cache below returns the SAME data object while every ctx input is
// referentially/primitive-identical, so a re-render that changes nothing a node
// reads reuses the previous object instead of churning the whole tree.
//
// Stability caveat (why full stability is impractical here): the editing host
// (apps/studio) passes inline closures for most callbacks, so their identity
// changes on every App render and the ctx comparison misses — exactly as the
// pre-refactor code recomputed derivedNodes on those renders. The cache's win
// is the renders where the ctx inputs genuinely didn't change (view-only
// re-renders, geometry updates after layout settles), which reuse the same data
// objects instead of rebuilding them.
//
// This module is pure — no React imports; the React Flow type-cast boundary
// lives in toRfNode/toRfEdge (see adapter.ts).

import type {
  Column,
  EdgeLabel,
  EdgeLabelPlacement,
  EdgeLabelSide,
  NotationId,
  TextRun,
  ThreatTarget,
  ViewEdge,
  ViewNode,
} from '@diagc/core';
import { runsToPlainText, threatSummary } from '@diagc/core';
import type { IconRegistry } from '@diagc/icons';
import type { AnnotationCounts } from './comment-badge';
import type { EdgePoint } from './layout';
import type { EdgeRouting } from './useViewLayout';
import type { KindStyle, Registry, TypeStyle } from './registry';
import type { StylePreset } from './stylePresets';
import type { DiagramEdgeData } from './DiagramEdge';
import type { DiagramNodeData } from './DiagramNode';

/** per-node data inputs the view threads in; kept as one object so the cache
 * can compare it field-by-field with === and skip rebuilds when nothing moved */
export interface NodeDataContext {
  metaKeys: string[];
  hiddenCounts: ReadonlyMap<string, number>;
  typeRegistry: Registry<TypeStyle>;
  /** the model's colour convention: default accent per node type, `*` as the
   * fallback. Applied only where the node itself declares no `color`. */
  typeColors?: Record<string, string>;
  /** notation-resolved accent per node id (e.g. a commit's lane colour); below
   * the node's own colour, above typeColors */
  nodeColors?: ReadonlyMap<string, string>;
  icons: IconRegistry;
  /** see DiagramViewProps.onOpenLink; only reaches a node whose model carries `link` */
  onOpenLink?: (link: string) => void;
  onToggleExpand?: (id: string, next: 'expanded' | 'collapsed') => void;
  onEnterNode?: (id: string) => void;
  editing: boolean;
  /** the node id currently in in-place rename (undefined = no label edit) */
  labelEditingId?: string;
  /** close the in-place label editor (called when a commit/cancel fires) */
  endLabelEdit?: () => void;
  onRenameNode?: (id: string, name: string) => void;
  onSetNodeRich?: (id: string, runs: TextRun[]) => void;
  assetBase?: string;
  /** URL prefix substituted for a leading '/library/' on bundled-icon refs
   * (see DiagramNodeData.libraryBase) */
  libraryBase?: string;
  onResize?: (id: string, w: number, h: number, pos: { x: number; y: number }) => void;
  onSetTableColumns?: (id: string, columns: Column[]) => void;
  /** see EditingApi.quickAdd; threaded as one object, read lazily by the
   * selected node only — never computed per node at build time. sameNodeCtx
   * compares it by identity, so a host that rebuilds the hook every render
   * rebuilds every node's data with it (the same bargain the callbacks above
   * already strike — see this file's stability caveat). */
  quickAdd?: { label: (id: string) => string | undefined; run: (id: string) => void };
  /** see EditingApi.onAddThreat — the host opens a new row on the element's
   * note. Threaded whole (the node passes its own id at click time); the badge
   * decides for itself whether to offer it, since only a threat model's canvas
   * should carry the affordance. */
  onAddThreat?: (target: ThreatTarget) => void;
  stylePreset?: StylePreset;
  notation?: NotationId;
}

/** per-edge data inputs the view threads in (same cache contract as above) */
export interface EdgeDataContext {
  kindRegistry: Registry<KindStyle>;
  editing: boolean;
  onAddEdgeLabel?: (relationId: string, text: string, t: number, side: EdgeLabelSide) => void;
  onEditEdgeLabel?: (relationId: string, labelId: string, text: string) => void;
  onMoveEdgeLabel?: (relationId: string, labelId: string, t: number, side: EdgeLabelSide) => void;
  onSetEdgeSide?: (relationId: string, end: 'from' | 'to', side: import('./floating').Side | null) => void;
  /** see EditingApi.onAddThreat; bound to the edge's sole relation below, so
   * the chip in the renderer calls it with nothing */
  onAddThreat?: (target: ThreatTarget) => void;
  /** the sole-relation id currently showing endpoint pin dots (null = none) */
  pinEdgeRel: string | null;
  /** a correlated double-click asked to add a label on a specific edge */
  pendingAdd: { edgeId: string; x: number; y: number } | null;
  onPendingAddConsumed?: () => void;
  stylePreset?: StylePreset;
  notation?: NotationId;
  /** how the active plane draws routed edges; undefined = every edge floats */
  routing?: EdgeRouting;
  routes: ReadonlyMap<string, EdgePoint[]>;
  /** where the layout put each node (absolute top-left): an edge carries its
   * endpoints' spots along, and draws its route only while both still stand
   * there (DiagramEdge) — a moved node's route points at where it used to be */
  laidAt: ReadonlyMap<string, EdgePoint>;
  /** elk's reserved spot (centre) for a labelled edge's label */
  labelSpots: ReadonlyMap<string, EdgePoint>;
  /** where labels were slid to on this plane (saved overlay + view-mode
   * drags): relation id → label id → placement; overrides the label's own */
  labelMoves?: EdgeLabelMoves;
  /** view mode: a label was slid (Alt+drag). Absent ⇒ labels are not movable
   * there (a host that can neither keep nor save the move). */
  onViewMoveEdgeLabel?: (relationId: string, labelId: string, t: number, side: EdgeLabelSide) => void;
  /** notation-resolved stroke per edge id */
  edgeColors?: ReadonlyMap<string, string>;
}

/** relation id → label id → where the label sits along its edge */
export type EdgeLabelMoves = Readonly<Record<string, Readonly<Record<string, EdgeLabelPlacement>>>>;

/** A node's accent colour: its own `color`, else the model's convention for its
 * type, else the convention's `*` fallback (see DiagramModel.typeColors). */
export function typeColor(n: ViewNode, ctx: Pick<NodeDataContext, 'nodeColors' | 'typeColors'>): string | undefined {
  if (n.node.color !== undefined) return n.node.color;
  const byNotation = ctx.nodeColors?.get(n.id);
  if (byNotation !== undefined) return byNotation;
  const byType = ctx.typeColors;
  if (byType === undefined) return undefined;
  const own = n.node.type !== undefined ? byType[n.node.type] : undefined;
  return own ?? byType['*'];
}

/** Build the data channel for one view node. Pure: same inputs → equivalent
 * output; the wrapped callbacks bind the view's host callbacks to this node's
 * id (rename/rich-commit/resize/columns) exactly as the inline construction did. */
export function buildNodeData(n: ViewNode, ctx: NodeDataContext): DiagramNodeData {
  const metaBadges = ctx.metaKeys
    .map((k) => n.node.metadata?.[k])
    .filter((v): v is NonNullable<typeof v> => v !== undefined && v !== null)
    .map(String);
  // Counted here rather than in the component so the badge costs one pass over
  // the threats per data build, not one per render.
  const threats = threatSummary(n.node.threats);
  // Counts, not the lists: the badge only needs numbers, and the data channel
  // is compared field by field (see the equality below) — a fresh array would
  // re-render every node every frame.
  const comments = n.node.comments?.length ?? 0;
  const links = n.node.links?.length ?? 0;
  const annotations: AnnotationCounts | undefined = comments > 0 || links > 0 ? { comments, links } : undefined;
  const data: DiagramNodeData = {
    label: n.node.name,
    state: n.state,
    promoted: n.promoted,
    sharedMembers: n.sharedMembers,
    hiddenCount: ctx.hiddenCounts.get(n.id) ?? 0,
    metaBadges,
    typeRegistry: ctx.typeRegistry,
    icons: ctx.icons,
    ...(n.node.type !== undefined ? { typeId: n.node.type } : {}),
    ...(n.node.icon !== undefined ? { icon: n.node.icon } : {}),
    ...(typeColor(n, ctx) !== undefined ? { color: typeColor(n, ctx) } : {}),
    ...(n.node.textColor !== undefined ? { textColor: n.node.textColor } : {}),
    ...(n.node.technology !== undefined ? { technology: n.node.technology } : {}),
    ...(n.node.rich !== undefined ? { rich: n.node.rich } : {}),
    ...(n.node.textAlign !== undefined ? { textAlign: n.node.textAlign } : {}),
    ...(n.node.fontScale !== undefined ? { fontScale: n.node.fontScale } : {}),
    ...(ctx.onToggleExpand !== undefined ? { onToggleExpand: ctx.onToggleExpand } : {}),
    ...(n.state !== 'leaf' ? { onEnterNode: ctx.onEnterNode } : {}),
    ...(n.external !== undefined ? { external: true } : {}),
    ...(ctx.labelEditingId === n.id
      ? {
          labelEditing: true,
          onLabelCommit: (value: string | null) => {
            ctx.endLabelEdit?.();
            const name = value?.trim() ?? '';
            if (name !== '' && name !== n.node.name) ctx.onRenameNode?.(n.id, name);
          },
          onRichCommit: (runs: TextRun[] | null) => {
            ctx.endLabelEdit?.();
            if (runs !== null && runsToPlainText(runs).trim() !== '') ctx.onSetNodeRich?.(n.id, runs);
          },
        }
      : {}),
    ...(n.node.image !== undefined
      ? {
          image: n.node.image,
          ...(ctx.assetBase !== undefined ? { assetBase: ctx.assetBase } : {}),
          ...(ctx.libraryBase !== undefined ? { libraryBase: ctx.libraryBase } : {}),
          ...(ctx.editing && ctx.onResize !== undefined ? { onResize: ctx.onResize } : {}),
        }
      : {}),
    ...(n.node.shape !== undefined
      ? {
          shape: n.node.shape,
          ...(ctx.assetBase !== undefined ? { assetBase: ctx.assetBase } : {}),
          ...(ctx.libraryBase !== undefined ? { libraryBase: ctx.libraryBase } : {}),
        }
      : {}),
    ...(n.node.link !== undefined
      ? { link: n.node.link, ...(ctx.onOpenLink !== undefined ? { onOpenLink: ctx.onOpenLink } : {}) }
      : {}),
    ...(n.node.columns !== undefined ? { columns: n.node.columns } : {}),
    ...(ctx.editing && n.node.type === 'db-table' && ctx.onSetTableColumns !== undefined
      ? { onColumnsChange: (columns: Column[]) => ctx.onSetTableColumns?.(n.id, columns) }
      : {}),
    ...(ctx.editing && ctx.quickAdd !== undefined ? { quickAdd: ctx.quickAdd } : {}),
    ...(ctx.editing && ctx.onAddThreat !== undefined ? { onAddThreat: ctx.onAddThreat } : {}),
    ...(ctx.stylePreset !== undefined ? { stylePreset: ctx.stylePreset } : {}),
    ...(ctx.notation !== undefined ? { notation: ctx.notation } : {}),
    ...(threats.total > 0 ? { threats } : {}),
    ...(annotations !== undefined ? { annotations } : {}),
  };
  return data;
}

/** A sole relation's labels with any slid placement laid over their own. The
 * same array back when nothing was moved, so the data cache stays warm. */
function placedLabels(e: ViewEdge, moves: EdgeLabelMoves | undefined): EdgeLabel[] {
  const labels = e.labels ?? [];
  const moved = e.constituents.length === 1 ? moves?.[e.constituents[0]!.id] : undefined;
  if (moved === undefined) return labels;
  return labels.map((l) => {
    const to = moved[l.id];
    if (to === undefined) return l;
    const { side: _side, ...rest } = l;
    return { ...rest, t: to.t, ...(to.side !== undefined ? { side: to.side } : {}) };
  });
}

/** Build the data channel for one view edge (pure; same contract as buildNodeData). */
export function buildEdgeData(e: ViewEdge, ctx: EdgeDataContext): DiagramEdgeData {
  const notationColor = ctx.edgeColors?.get(e.id);
  // A drawn edge can stand for several relations (a bundled arrow), so the
  // badge counts the whole bundle — otherwise a threat would disappear the
  // moment two flows merged into one line.
  const threats = e.constituents.reduce(
    (acc, c) => {
      const t = threatSummary(c.threats);
      return { open: acc.open + t.open, total: acc.total + t.total };
    },
    { open: 0, total: 0 },
  );
  // A bundled arrow's badge counts every constituent's comments, as the threat
  // chip does — or a comment would vanish the moment two flows merged.
  const comments = e.constituents.reduce((acc, c) => acc + (c.comments?.length ?? 0), 0);
  const annotations: AnnotationCounts | undefined = comments > 0 ? { comments, links: 0 } : undefined;
  const data: DiagramEdgeData = {
    kind: e.kind,
    constituentCount: e.constituents.length,
    kindRegistry: ctx.kindRegistry,
    ...(e.label !== undefined ? { label: e.label } : {}),
    ...(e.labels !== undefined ? { labels: placedLabels(e, ctx.labelMoves) } : {}),
    ...(e.tint !== undefined ? { tint: e.tint } : {}),
    ...(e.style !== undefined ? { relStyle: e.style } : {}),
    ...(ctx.stylePreset !== undefined ? { stylePreset: ctx.stylePreset } : {}),
    ...(ctx.notation !== undefined ? { notation: ctx.notation } : {}),
    ...(e.polarity !== undefined ? { polarity: e.polarity } : {}),
    ...(e.delay !== undefined ? { delay: e.delay } : {}),
    ...(notationColor !== undefined ? { notationColor } : {}),
    ...(threats.total > 0 ? { threats } : {}),
    ...(annotations !== undefined ? { annotations } : {}),
  };
  const soleRelation = e.constituents.length === 1 ? e.constituents[0] : undefined;
  // Both modes: the counting chip toggles this relation's bubble in view mode
  // too (the canvas's own session state), so the id has to travel regardless
  // of `editing`. A string, so the cached-data comparison stays a field check.
  if (soleRelation !== undefined) data.threatRelation = soleRelation.id;
  if (soleRelation?.fromColumn !== undefined) data.fromColumn = soleRelation.fromColumn;
  if (soleRelation?.toColumn !== undefined) data.toColumn = soleRelation.toColumn;
  if (ctx.editing && soleRelation !== undefined) {
    // The geometry owner (DiagramEdge) drives label add/edit/drag because it
    // holds the path params; here we just bind the callbacks to this edge's
    // sole relation id.
    data.editableLabels = true;
    data.onAddLabel = (text, t, side) => ctx.onAddEdgeLabel?.(soleRelation.id, text, t, side);
    data.onEditLabel = (labelId, text) => ctx.onEditEdgeLabel?.(soleRelation.id, labelId, text);
    data.onMoveLabel = (labelId, t, side) => ctx.onMoveEdgeLabel?.(soleRelation.id, labelId, t, side);
    // A threat hangs off a relation, not off the drawn arrow: the target is
    // bound here, where the constituent is known. A bundled arrow names no
    // single relation, so it gets no offer at all (this block is sole-relation
    // only) — the panel is where a bundle's threats are written.
    if (ctx.onAddThreat !== undefined) {
      const add = ctx.onAddThreat;
      data.onAddThreat = () => add({ relation: soleRelation.id });
    }
  }
  if (!ctx.editing && soleRelation !== undefined && ctx.onViewMoveEdgeLabel !== undefined) {
    // View mode: a label can be slid along its edge with Alt held (the same
    // modifier that unlocks dragging a box); the move is the host's to keep.
    data.movableLabels = true;
    data.onMoveLabel = (labelId, t, side) => ctx.onViewMoveEdgeLabel?.(soleRelation.id, labelId, t, side);
  }
  if (ctx.editing && soleRelation !== undefined && ctx.onSetEdgeSide !== undefined) {
    data.onSetSide = (end, side) => ctx.onSetEdgeSide?.(soleRelation.id, end, side);
    if (soleRelation.id === ctx.pinEdgeRel) data.pinsActive = true;
  }
  if (ctx.editing && soleRelation !== undefined && ctx.pendingAdd?.edgeId === e.id) {
    // a correlated double-click asked to add a label on this edge — the
    // renderer projects the point and renders the new-label editor (kept until
    // the user commits/cancels; survives the edges-layer remount)
    data.pendingAdd = { x: ctx.pendingAdd.x, y: ctx.pendingAdd.y };
    data.onPendingAddConsumed = ctx.onPendingAddConsumed;
  }
  if (ctx.routing !== undefined) {
    const route = ctx.routes.get(e.id);
    const from = ctx.laidAt.get(e.from);
    const to = ctx.laidAt.get(e.to);
    if (route !== undefined && route.length >= 2 && from !== undefined && to !== undefined) {
      data.route = route;
      data.routeCorner = ctx.routing.corner;
      data.routeFrom = from;
      data.routeTo = to;
      const spot = ctx.labelSpots.get(e.id);
      if (spot !== undefined) data.labelSpot = spot;
    }
  }
  return data;
}

// ---------------------------------------------------------------------------
// Data-identity cache: keyed by the stable ViewNode/ViewEdge objects (each
// compiled view keeps the same nodes/edges until it recompiles), with the ctx
// snapshot compared field-by-field by ===. Equivalent ctx ⇒ the same data
// object comes back, so React Flow's node/edge re-renders see no prop churn.
// ---------------------------------------------------------------------------

interface NodeCacheEntry {
  ctx: NodeDataContext;
  data: DiagramNodeData;
}

interface EdgeCacheEntry {
  ctx: EdgeDataContext;
  data: DiagramEdgeData;
}

const nodeCache = new WeakMap<ViewNode, NodeCacheEntry>();
const edgeCache = new WeakMap<ViewEdge, EdgeCacheEntry>();

function sameNodeCtx(a: NodeDataContext, b: NodeDataContext): boolean {
  return (
    a.metaKeys === b.metaKeys &&
    a.hiddenCounts === b.hiddenCounts &&
    a.typeRegistry === b.typeRegistry &&
    a.icons === b.icons &&
    a.onOpenLink === b.onOpenLink &&
    a.onToggleExpand === b.onToggleExpand &&
    a.onEnterNode === b.onEnterNode &&
    a.editing === b.editing &&
    a.labelEditingId === b.labelEditingId &&
    a.endLabelEdit === b.endLabelEdit &&
    a.onRenameNode === b.onRenameNode &&
    a.onSetNodeRich === b.onSetNodeRich &&
    a.assetBase === b.assetBase &&
    a.libraryBase === b.libraryBase &&
    a.onResize === b.onResize &&
    a.onSetTableColumns === b.onSetTableColumns &&
    a.quickAdd === b.quickAdd &&
    a.onAddThreat === b.onAddThreat &&
    a.stylePreset === b.stylePreset &&
    a.notation === b.notation &&
    a.nodeColors === b.nodeColors
  );
}

function sameEdgeCtx(a: EdgeDataContext, b: EdgeDataContext): boolean {
  return (
    a.kindRegistry === b.kindRegistry &&
    a.editing === b.editing &&
    a.onAddEdgeLabel === b.onAddEdgeLabel &&
    a.onEditEdgeLabel === b.onEditEdgeLabel &&
    a.onMoveEdgeLabel === b.onMoveEdgeLabel &&
    a.onSetEdgeSide === b.onSetEdgeSide &&
    a.onAddThreat === b.onAddThreat &&
    a.pinEdgeRel === b.pinEdgeRel &&
    a.pendingAdd === b.pendingAdd &&
    a.onPendingAddConsumed === b.onPendingAddConsumed &&
    a.stylePreset === b.stylePreset &&
    a.notation === b.notation &&
    a.routing === b.routing &&
    a.routes === b.routes &&
    a.laidAt === b.laidAt &&
    a.labelSpots === b.labelSpots &&
    a.labelMoves === b.labelMoves &&
    a.onViewMoveEdgeLabel === b.onViewMoveEdgeLabel &&
    a.edgeColors === b.edgeColors
  );
}

/** buildNodeData + identity-stable cache: returns the previous data object when
 * every ctx input is unchanged. Designed for use inside a memoized walk so the
 * (cheap) per-field compare only runs when the walk itself re-runs. */
export function buildNodeDataCached(n: ViewNode, ctx: NodeDataContext): DiagramNodeData {
  const hit = nodeCache.get(n);
  if (hit !== undefined && sameNodeCtx(hit.ctx, ctx)) return hit.data;
  const data = buildNodeData(n, ctx);
  nodeCache.set(n, { ctx, data });
  return data;
}

/** buildEdgeData + identity-stable cache (same contract as buildNodeDataCached) */
export function buildEdgeDataCached(e: ViewEdge, ctx: EdgeDataContext): DiagramEdgeData {
  const hit = edgeCache.get(e);
  if (hit !== undefined && sameEdgeCtx(hit.ctx, ctx)) return hit.data;
  const data = buildEdgeData(e, ctx);
  edgeCache.set(e, { ctx, data });
  return data;
}