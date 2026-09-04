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

import type { Column, EdgeLabelSide, NotationId, TextRun, ViewEdge, ViewNode } from '@diagramming/core';
import { runsToPlainText } from '@diagramming/core';
import type { IconRegistry } from '@diagramming/icons';
import type { EdgePoint } from './layout';
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
  pins?: Record<string, 'expanded' | 'collapsed'>;
  onTogglePin?: (id: string) => void;
  onToggleExpand?: (id: string) => void;
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
  /** the sole-relation id currently showing endpoint pin dots (null = none) */
  pinEdgeRel: string | null;
  /** a correlated double-click asked to add a label on a specific edge */
  pendingAdd: { edgeId: string; x: number; y: number } | null;
  onPendingAddConsumed?: () => void;
  stylePreset?: StylePreset;
  notation?: NotationId;
  /** the active plane routes orthogonally (elk waypoints are usable) */
  orthogonal: boolean;
  /** endpoints whose position is manually overridden — their stored route is
   * stale, so those edges fall back to floating paths (undefined = no pinning) */
  pinnedIds?: Set<string>;
  routes: ReadonlyMap<string, EdgePoint[]>;
  /** notation-resolved stroke per edge id */
  edgeColors?: ReadonlyMap<string, string>;
}

/** A node's accent colour: its own `color`, else the model's convention for its
 * type, else the convention's `*` fallback (see DiagramModel.typeColors). */
function typeColor(n: ViewNode, ctx: NodeDataContext): string | undefined {
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
    ...(ctx.pins?.[n.id] !== undefined ? { pinned: ctx.pins[n.id] } : {}),
    ...(ctx.onTogglePin !== undefined ? { onTogglePin: ctx.onTogglePin } : {}),
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
    ...(n.node.columns !== undefined ? { columns: n.node.columns } : {}),
    ...(ctx.editing && n.node.type === 'db-table' && ctx.onSetTableColumns !== undefined
      ? { onColumnsChange: (columns: Column[]) => ctx.onSetTableColumns?.(n.id, columns) }
      : {}),
    ...(ctx.stylePreset !== undefined ? { stylePreset: ctx.stylePreset } : {}),
    ...(ctx.notation !== undefined ? { notation: ctx.notation } : {}),
  };
  return data;
}

/** Build the data channel for one view edge (pure; same contract as buildNodeData). */
export function buildEdgeData(e: ViewEdge, ctx: EdgeDataContext): DiagramEdgeData {
  const notationColor = ctx.edgeColors?.get(e.id);
  const data: DiagramEdgeData = {
    kind: e.kind,
    constituentCount: e.constituents.length,
    kindRegistry: ctx.kindRegistry,
    ...(e.label !== undefined ? { label: e.label } : {}),
    ...(e.labels !== undefined ? { labels: e.labels } : {}),
    ...(e.tint !== undefined ? { tint: e.tint } : {}),
    ...(e.style !== undefined ? { relStyle: e.style } : {}),
    ...(ctx.stylePreset !== undefined ? { stylePreset: ctx.stylePreset } : {}),
    ...(ctx.notation !== undefined ? { notation: ctx.notation } : {}),
    ...(e.polarity !== undefined ? { polarity: e.polarity } : {}),
    ...(e.delay !== undefined ? { delay: e.delay } : {}),
    ...(notationColor !== undefined ? { notationColor } : {}),
  };
  const soleRelation = e.constituents.length === 1 ? e.constituents[0] : undefined;
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
  if (ctx.orthogonal && ctx.pinnedIds !== undefined && !ctx.pinnedIds.has(e.from) && !ctx.pinnedIds.has(e.to)) {
    const route = ctx.routes.get(e.id);
    if (route !== undefined && route.length >= 2) {
      data.route = route;
      data.orthogonal = true;
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
    a.pins === b.pins &&
    a.onTogglePin === b.onTogglePin &&
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
    a.pinEdgeRel === b.pinEdgeRel &&
    a.pendingAdd === b.pendingAdd &&
    a.onPendingAddConsumed === b.onPendingAddConsumed &&
    a.stylePreset === b.stylePreset &&
    a.notation === b.notation &&
    a.orthogonal === b.orthogonal &&
    a.pinnedIds === b.pinnedIds &&
    a.routes === b.routes &&
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