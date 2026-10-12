import {
  ACTIVITY_FRAME_TYPE,
  ACTIVITY_LANE_TYPE,
  childrenOf,
  defined,
  isActivityChrome,
  layoutPlaneKey,
  containmentOn,
  containmentPlaneOf,
  relationOnPlane,
  uniqueNodeId,
  viewedPlane,
  type DiagramModel,
  type DiagramNode,
  type DiagramRelation,
  type EditorCommand,
  type Point,
  type Size,
} from '@diagc/core/internal';
import { homeActivityParent } from '../activity/activityDrop';
import type { PlaneLayout } from '../layout/savedPositions';

/** The marker a pasted string must carry; anything else on the clipboard is
 * someone else's text and is left alone. Versioned so a later shape can refuse
 * (or migrate) an older copy instead of misreading it. */
export const CLIPBOARD_FORMAT = 'diagc/clipboard@1';

/** px each successive paste of the same copy steps down-right, so pastes never
 * land exactly on top of the originals or of each other */
export const PASTE_STEP = 24;

/**
 * What a copy carries: plain model fragments under their ORIGINAL ids, so the
 * payload stays readable and the id remap happens once, at paste, against the
 * model being pasted into (which may be another diagram).
 */
export interface ClipboardPayload {
  format: typeof CLIPBOARD_FORMAT;
  /** every copied node: the selected ones and all they contain */
  nodes: DiagramNode[];
  /** containment among the copied nodes (the active plane's, plane tag dropped) */
  containment: { parent: string; child: string }[];
  /** the copied subtrees' tops, with the parent each had where it was copied */
  roots: { id: string; parent?: string }[];
  /** relations with both ends among the copied nodes */
  relations: DiagramRelation[];
  /** parent-relative positions on the copied plane, where there were any */
  positions: Record<string, Point>;
  /** saved box sizes */
  sizes: Record<string, Size>;
}

/** The containment edges a view of `plane` reads (untagged = first-declared plane). */
function edgesOn(model: DiagramModel, plane: string | undefined) {
  return containmentOn(model, containmentPlaneOf(model, plane));
}

/**
 * Snapshot the selected nodes (plus everything inside them) for the clipboard,
 * or null when none of `ids` names a node. `onScreen` fills positions the layout
 * overlay does not hold — a manual plane, where elk will not place a paste, so
 * the copy must say where things were.
 */
export function copySelection(
  { model, layout, plane }: PlaneLayout,
  ids: readonly string[],
  onScreen: Record<string, Point> = {},
): ClipboardPayload | null {
  const byId = new Map(model.nodes.map((n) => [n.id, n]));
  const edges = edgesOn(model, plane);
  const parentOf = new Map(edges.map((e) => [e.child, e.parent]));
  // everything under the selection on THIS plane (another plane's hierarchy
  // over the same nodes is not what the user is looking at)
  const kids = childrenOf(edges);
  const picked = new Set<string>();
  const stack = ids.filter((id) => byId.has(id));
  for (let cur = stack.pop(); cur !== undefined; cur = stack.pop()) {
    if (picked.has(cur)) continue;
    picked.add(cur);
    stack.push(...(kids.get(cur) ?? []));
  }
  if (picked.size === 0) return null;
  const nodes = model.nodes.filter((n) => picked.has(n.id));
  const saved = layout?.planes[layoutPlaneKey(model, plane)] ?? {};
  const positions: Record<string, Point> = {};
  const sizes: Record<string, Size> = {};
  for (const n of nodes) {
    const p = saved[n.id] ?? onScreen[n.id];
    if (p !== undefined) positions[n.id] = { x: p.x, y: p.y };
    const s = layout?.sizes?.[n.id];
    if (s !== undefined) sizes[n.id] = { w: s.w, h: s.h };
  }
  return {
    format: CLIPBOARD_FORMAT,
    nodes,
    containment: edges
      .filter((e) => picked.has(e.parent) && picked.has(e.child))
      .map(({ parent, child }) => ({ parent, child })),
    roots: nodes
      .filter((n) => !picked.has(parentOf.get(n.id) ?? ''))
      .map((n) => {
        const parent = parentOf.get(n.id);
        return parent !== undefined ? { id: n.id, parent } : { id: n.id };
      }),
    // only what the plane in view draws: another plane's relation is not on screen
    relations: model.relations.filter(
      (r) => relationOnPlane(r, viewedPlane(model.planes, plane)?.id) && picked.has(r.from) && picked.has(r.to),
    ),
    positions,
    sizes,
  };
}

export const serializeClipboard = (p: ClipboardPayload): string => JSON.stringify(p);

/** The payload in `text`, or null when it is not one of ours. */
export function parseClipboard(text: string): ClipboardPayload | null {
  if (!text.includes(CLIPBOARD_FORMAT)) return null;
  try {
    const p = JSON.parse(text) as Partial<ClipboardPayload>;
    return p.format === CLIPBOARD_FORMAT && Array.isArray(p.nodes) && Array.isArray(p.roots)
      ? (p as ClipboardPayload)
      : null;
  } catch {
    return null;
  }
}

export interface PasteContext {
  /** the active plane (createNodeAt's scoping) */
  plane: string | undefined;
  borrowsContainment: boolean;
  /** the pen layer pasted nodes land on when their own layer does not exist here */
  penLayer: string | null;
  /** the selected node, if any: paste goes into it when it is a container, else beside it */
  selected: string | undefined;
  /** how many times this same copy was pasted before (the offset multiplier) */
  repeat: number;
}

export interface PasteResult {
  /** one batch: one undo step */
  command: EditorCommand;
  /** the new ids of the pasted tops, in copy order */
  roots: string[];
}

/**
 * Turn a clipboard payload into one batch against `model`: fresh ids, the
 * copied containment and relations rewired to them, sizes carried, and the
 * pasted tops nested where the selection says —
 *
 *  - a selected container (anything with children here, or activity chrome)
 *    that was not itself copied → inside it;
 *  - any other selected node → beside it, under its parent;
 *  - nothing selected → under the originals' parent when it exists here
 *    (a duplicate in place), else at top level.
 *
 * Activity rules ride on top: a lane only ever lands in a frame, anything else
 * aimed at a frame or a glyph is re-homed to a lane (homeActivityParent). Tops
 * that had a position step PASTE_STEP × (repeat + 1) down-right of it; nested
 * nodes keep theirs, relative to their (pasted) parent.
 */
export function pasteCommand(model: DiagramModel, payload: ClipboardPayload, ctx: PasteContext): PasteResult | null {
  if (payload.nodes.length === 0) return null;
  const idMap = freshIds(model, payload);
  const rootParent = homesOf(model, payload, ctx);
  const layers = new Set(model.layers.map((l) => l.id));
  // a layer that exists here is kept, any other gives way to the pen
  const onLayer = (layer: string | undefined) =>
    layer !== undefined && layers.has(layer) ? layer : (ctx.penLayer ?? undefined);
  const scopedPlane = ctx.plane !== undefined && !ctx.borrowsContainment ? ctx.plane : undefined;
  const planeOpt = defined({ plane: ctx.plane });
  const fresh = (n: DiagramNode): DiagramNode => {
    // `key` is cross-diagram identity: a copy sharing it would MERGE with its
    // original on compose. Plane and layer are re-scoped to where it lands.
    const { key: _key, plane: _plane, layer, ...rest } = n;
    return { ...rest, id: idMap.get(n.id)!, ...defined({ plane: scopedPlane, layer: onLayer(layer) }) };
  };

  const rootIds = new Set(payload.roots.map((r) => r.id));
  const innerParent = new Map(payload.containment.map((e) => [e.child, e.parent]));
  const commands: EditorCommand[] = [];
  // Parents before children: payload.nodes keeps model order, which need not
  // put a container first, so add every node, then every membership.
  for (const n of payload.nodes) commands.push({ type: 'add-node', node: fresh(n) });
  for (const n of payload.nodes) {
    const parent = rootIds.has(n.id) ? rootParent.get(n.id) : idMap.get(innerParent.get(n.id) ?? '');
    if (parent !== undefined) {
      commands.push({ type: 'add-containment', parent, child: idMap.get(n.id)!, ...planeOpt });
    }
  }
  commands.push(...placeCommands(payload, idMap, { step: PASTE_STEP * (ctx.repeat + 1), rootIds, planeOpt }));
  // A relation drawn on one plane is drawn on the plane it lands on, a shared one
  // stays shared: borrowing planes included, as a relation matches the plane itself.
  // The Default view draws the first plane, so that is where it lands there.
  const landing = viewedPlane(model.planes, ctx.plane)?.id;
  const onPlane = (plane: string | undefined) => (plane !== undefined ? landing : undefined);
  commands.push(...relationCommands(payload, idMap, { onLayer, onPlane }));
  return { command: { type: 'batch', commands }, roots: payload.roots.map((r) => idMap.get(r.id)!) };
}

/** Fresh ids, reserved as they are taken so two copies of one id in a paste stay apart. */
function freshIds(model: DiagramModel, payload: ClipboardPayload): Map<string, string> {
  const taken: DiagramModel = { ...model, nodes: [...model.nodes] };
  const idMap = new Map<string, string>();
  for (const n of payload.nodes) {
    const id = uniqueNodeId(taken, n.id);
    idMap.set(n.id, id);
    taken.nodes.push({ id, name: '' });
  }
  return idMap;
}

/** Where each pasted top goes, by its original id: the selection's rule (see
 * pasteCommand), then the activity re-homing. */
function homesOf(model: DiagramModel, payload: ClipboardPayload, ctx: PasteContext): Map<string, string | undefined> {
  const typeOf = (id: string | undefined) =>
    id === undefined ? undefined : model.nodes.find((n) => n.id === id)?.type;
  const exists = (id: string | undefined) => id !== undefined && model.nodes.some((n) => n.id === id);
  const edges = edgesOn(model, ctx.plane);
  const hereParent = (id: string) => edges.find((e) => e.child === id)?.parent;
  const copied = new Set(payload.nodes.map((n) => n.id));

  // Where the tops go, before activity re-homing.
  const selected = exists(ctx.selected) ? ctx.selected : undefined;
  // something with children here, or activity chrome (an empty lane is still a lane)
  const isContainer = (id: string) => edges.some((e) => e.parent === id) || isActivityChrome(typeOf(id));
  const targetFor = (root: { parent?: string }): string | undefined => {
    if (selected !== undefined && !copied.has(selected)) return isContainer(selected) ? selected : hereParent(selected);
    if (selected !== undefined) return hereParent(selected); // pasting over the copy itself: beside it
    return exists(root.parent) ? root.parent : undefined;
  };
  // the frame at or above `id` — the only home a lane has
  const frameOf = (id: string | undefined): string | undefined => {
    for (let cur = id, guard = 0; cur !== undefined && guard < 64; cur = hereParent(cur), guard++) {
      if (typeOf(cur) === ACTIVITY_FRAME_TYPE) return cur;
    }
    return undefined;
  };

  const rootParent = new Map<string, string | undefined>();
  for (const r of payload.roots) {
    const raw = targetFor(r);
    const type = payload.nodes.find((n) => n.id === r.id)?.type;
    rootParent.set(
      r.id,
      type === ACTIVITY_LANE_TYPE ? frameOf(raw) : homeActivityParent(model, ctx.plane, { targetId: raw }),
    );
  }
  return rootParent;
}

/** Each node's saved position and size, node by node: a top steps `step`
 * down-right of where it was, a nested node keeps its parent-relative spot. */
function placeCommands(
  payload: ClipboardPayload,
  idMap: Map<string, string>,
  { step, rootIds, planeOpt }: { step: number; rootIds: Set<string>; planeOpt: { plane?: string } },
): EditorCommand[] {
  const commands: EditorCommand[] = [];
  for (const n of payload.nodes) {
    const p = payload.positions[n.id];
    if (p !== undefined) {
      const d = rootIds.has(n.id) ? step : 0;
      commands.push({ type: 'set-position', nodeId: idMap.get(n.id)!, x: p.x + d, y: p.y + d, ...planeOpt });
    }
    const s = payload.sizes[n.id];
    if (s !== undefined) commands.push({ type: 'set-size', nodeId: idMap.get(n.id)!, w: s.w, h: s.h });
  }
  return commands;
}

/** Where a pasted relation lands: its layer and its plane, each by its copy's own. */
interface RelationPlacement {
  onLayer: (layer: string | undefined) => string | undefined;
  onPlane: (plane: string | undefined) => string | undefined;
}

/** The copied relations between the fresh ids, with their labels. */
function relationCommands(
  payload: ClipboardPayload,
  idMap: Map<string, string>,
  { onLayer, onPlane }: RelationPlacement,
): EditorCommand[] {
  const commands: EditorCommand[] = [];
  // Relations: add-relation mints `from->to#i`; every endpoint is brand new, so
  // the i for each pair is just how many of that pair came before in this paste.
  const pairs = new Map<string, number>();
  for (const r of payload.relations) {
    const from = idMap.get(r.from)!;
    const to = idMap.get(r.to)!;
    const i = pairs.get(`${from}->${to}`) ?? 0;
    pairs.set(`${from}->${to}`, i + 1);
    commands.push({
      type: 'add-relation',
      from,
      to,
      opts: {
        kind: r.kind,
        ...defined({
          label: r.label,
          layer: onLayer(r.layer),
          plane: onPlane(r.plane),
          description: r.description,
          style: r.style,
          polarity: r.polarity,
          delay: r.delay,
          fromColumn: r.fromColumn,
          toColumn: r.toColumn,
        }),
      },
    });
    if (r.labels !== undefined) {
      commands.push({ type: 'update-relation', id: `${from}->${to}#${i}`, patch: { labels: r.labels } });
    }
  }
  return commands;
}
