import type { Node } from '@xyflow/react';
import {
  elementKey,
  hasNoteContent,
  soleRelation,
  type Comment,
  type CompiledView,
  type ElementRef,
  type Link,
  type NotePlacement,
  type Point,
  type Threat,
  type ViewNode,
} from '@diagc/core/internal';
import { toRfNoteNode } from '../canvas/adapter';
import type { EditingApi } from '../canvas/view-types';
import type { Registry, TypeStyle } from '../registry';
import type { NoteData } from './NoteNode';
import {
  badgeCenter,
  estimateNoteHeight,
  lineObstacles,
  NOTE_WIDTH,
  obstaclesOf,
  placeNote,
  type BadgeKind,
  type Rect,
} from './note-place';

/** The note node id prefix. An id-based test for the filters that only need to
 * *exclude* notes from an id list; anything that READS the note data channel
 * gates on `node.type === 'note'` instead, because a model node is free to
 * carry an id that starts with `note:` and it would arrive here with box data. */
export const NOTE_PREFIX = 'note:';
export const isNoteId = (id: string): boolean => id.startsWith(NOTE_PREFIX);

/** Where a threat-carrying flow's counting badge is drawn, as the edge reports
 * it: flow coordinates, the side of the line it sits on, and the line itself. */
export interface BadgeSpot {
  at: Point;
  away: Point;
  line: readonly Point[];
}

/** What the note derivation reads. */
export interface DeriveNotesInput {
  compiled: CompiledView;
  /** the ARRANGED geometry, parent-relative */
  geometry: ReadonlyMap<string, Rect>;
  /** element keys whose note is open */
  open: ReadonlySet<string>;
  /** the plane's saved note placements (`layout.notes`), by element key */
  placements: Record<string, NotePlacement> | undefined;
  /** by relation id */
  badgeSpots: ReadonlyMap<string, BadgeSpot>;
  editing: boolean;
  /** the notation offers threats (a threat model's canvas) */
  offersThreats: boolean;
  /** the threat row a note holds open for typing */
  editingRow: { key: string; id: string } | null;
  onAddThreat: EditingApi['onAddThreat'];
  onRetitleThreat: EditingApi['onRetitleThreat'];
  onSetThreatStatus: EditingApi['onSetThreatStatus'];
  onEditThreatText: EditingApi['onEditThreatText'];
  onOpenLink: ((link: string) => void) | undefined;
  /** closes the open threat row */
  onEndEdit: () => void;
  /** node id → name, for a flow's note title */
  nameOf: ReadonlyMap<string, string>;
  typeRegistry: Registry<TypeStyle>;
}

/** One element's note, before it is placed. */
interface NoteRequest {
  target: ElementRef;
  name: string;
  threats: readonly Threat[];
  comments: readonly Comment[];
  links: readonly Link[];
  /** the badge's centre, absolute */
  badge: Point;
  /** the element's box, absolute; null for a flow */
  element: Rect | null;
  parentId?: string;
  /** a flow: the side of the line its badge sits on */
  away?: Point;
}

/**
 * Notes: one synthetic node per element that carries threats, comments or
 * links. Derived from the ARRANGED geometry (so a note follows its element
 * through drags and container growth) and never handed to elk — adding a
 * threat must not move a single box. A box's note is parented like the box
 * (parent-relative, rides inside the container); a flow's note is top-level.
 * Each hangs off its badge: an unmoved note takes the first spot next to the
 * badge that covers nothing (note-place.ts), a dragged one sits at badge + its
 * saved offset.
 */
export function deriveNoteNodes(input: DeriveNotesInput): Node[] {
  // Absolute boxes: the placement runs in one space for every element and
  // every obstacle (the geometry is parent-relative), and a flow's badge is
  // reported in flow coordinates.
  const { abs, obstacles } = absoluteBoxes(input.compiled.roots, input.geometry);
  // The lines of the flows that show a badge — one carrying threats or
  // comments (see EdgeNoteBadges) — so no note lies across one. Other lines and
  // edge labels are not obstacles: a note may cover them.
  for (const e of input.compiled.edges) {
    const r = soleRelation(e);
    const spot = r !== undefined ? input.badgeSpots.get(r.id) : undefined;
    if (spot !== undefined) obstacles.push(...lineObstacles(spot.line));
  }
  const requests = [
    ...elementRequests(input.compiled.roots, abs, input.typeRegistry),
    ...flowRequests(input.compiled.edges, abs, input.badgeSpots, input.nameOf),
  ];
  const out: Node[] = [];
  for (const request of requests) {
    const node = placeNoteNode(request, input, { abs, obstacles });
    if (node !== undefined) out.push(node);
  }
  return out;
}

function absoluteBoxes(
  roots: readonly ViewNode[],
  geometry: ReadonlyMap<string, Rect>,
): { abs: Map<string, Rect>; obstacles: Rect[] } {
  const abs = new Map<string, Rect>();
  const obstacles: Rect[] = [];
  const walk = (n: ViewNode, ox: number, oy: number) => {
    const g = geometry.get(n.id);
    if (g === undefined) return;
    const rect = { x: g.x + ox, y: g.y + oy, width: g.width, height: g.height };
    abs.set(n.id, rect);
    // an expanded container is hollow (its members' notes belong inside);
    // everything else is a box a note must not cover
    obstacles.push(...obstaclesOf([{ rect, kind: n.state === 'expanded' ? 'group' : 'box' }]));
    n.children.forEach((c) => walk(c, g.x + ox, g.y + oy));
  };
  roots.forEach((r) => walk(r, 0, 0));
  return { abs, obstacles };
}

/** The boxes' notes, in model order. */
function elementRequests(
  roots: readonly ViewNode[],
  abs: ReadonlyMap<string, Rect>,
  typeRegistry: Registry<TypeStyle>,
): NoteRequest[] {
  // How the badge sits on this element — the stylesheet's three placements
  // (see badgeCenter): in the header band of an expanded container, tucked
  // into an ellipse, over the corner of anything else.
  const badgeKindOf = (n: ViewNode): BadgeKind => {
    if (n.state === 'expanded') return 'group';
    const shape = n.node.type !== undefined ? typeRegistry.resolve(n.node.type).shape : undefined;
    return shape === 'ellipse' ? 'ellipse' : 'box';
  };
  const out: NoteRequest[] = [];
  const walk = (n: ViewNode, parent?: string) => {
    const rect = abs.get(n.id);
    if (rect === undefined) return;
    // An external stub stands in for an off-frame node (drill views): its
    // threats/comments/links belong to the view that really draws it, or the
    // same note would appear twice, in two coordinate frames. What counts as
    // content is core's own predicate — the one layout pruning prunes by, so
    // a note drawn here always keeps its saved place (see pruneNotes).
    if (n.external === undefined && hasNoteContent(n.node))
      out.push({
        target: { node: n.id },
        name: n.node.name,
        threats: n.node.threats ?? [],
        comments: n.node.comments ?? [],
        links: n.node.links ?? [],
        badge: badgeCenter(rect, badgeKindOf(n)),
        element: rect,
        parentId: parent,
      });
    n.children.forEach((c) => walk(c, n.id));
  };
  roots.forEach((r) => walk(r));
  return out;
}

/** The flows' notes. `edges` is the DRAWN set, so a layer-hidden flow takes its
 * note with it. An aggregated edge gets none: its threats and comments belong
 * to particular relations, and a note on the bundle could not say which. (A
 * relation carries no `links` field, so a flow's note never lists any.) */
function flowRequests(
  edges: CompiledView['edges'],
  abs: ReadonlyMap<string, Rect>,
  badgeSpots: ReadonlyMap<string, BadgeSpot>,
  nameOf: ReadonlyMap<string, string>,
): NoteRequest[] {
  const out: NoteRequest[] = [];
  for (const e of edges) {
    const r = soleRelation(e);
    if (r === undefined || !hasNoteContent(r)) continue;
    const a = abs.get(e.from);
    const b = abs.get(e.to);
    if (a === undefined || b === undefined) continue;
    // The badge's spot arrives from the edge a frame after it first draws;
    // until then the straight-line midpoint of the two ends stands in.
    const badgeSpot = badgeSpots.get(r.id);
    const at = badgeSpot?.at ?? {
      x: (a.x + a.width / 2 + b.x + b.width / 2) / 2,
      y: (a.y + a.height / 2 + b.y + b.height / 2) / 2,
    };
    const label = r.label !== undefined && r.label !== '' ? ` (${r.label})` : '';
    out.push({
      target: { relation: r.id },
      name: `${nameOf.get(r.from) ?? r.from} → ${nameOf.get(r.to) ?? r.to}${label}`,
      threats: r.threats ?? [],
      comments: r.comments ?? [],
      links: [],
      badge: at,
      element: null,
      away: badgeSpot?.away,
    });
  }
  return out;
}

/** One open note, placed and turned into its node; undefined for a closed one.
 * Each placed note joins `obstacles`, so a later one (model order) never stacks
 * on it. */
function placeNoteNode(
  request: NoteRequest,
  input: DeriveNotesInput,
  space: { abs: ReadonlyMap<string, Rect>; obstacles: Rect[] },
): Node | undefined {
  const { target, name, threats, comments, links, badge, element, parentId, away } = request;
  const key = elementKey(target);
  if (!input.open.has(key)) return undefined;
  const { editing } = input;
  // The offer to start a register belongs where threats do: an element that
  // already has one, or a threat model's canvas — the gate ThreatBadge and
  // both studio panels apply. A host wires onAddThreat whatever the diagram
  // is, so without this a remark on a plain C4 box would offer to threat-
  // model it. The height estimate reads the same boolean, or it would
  // reserve ADD_ROW for a button that never draws.
  const offerThreat = editing && (threats.length > 0 || input.offersThreats);
  const size = { width: NOTE_WIDTH, height: estimateNoteHeight(name, threats, offerThreat, comments, links) };
  const p = input.placements?.[key];
  // {0,0} is "automatic" — `set-note-offset null` writes it, and the
  // normaliser drops it — so a saved offset is anything else
  const at =
    p !== undefined && (p.dx !== 0 || p.dy !== 0)
      ? { x: badge.x + p.dx, y: badge.y + p.dy }
      : placeNote(badge, element, size, space.obstacles, away);
  space.obstacles.push({ ...at, ...size });
  // back to the parent's frame: a box's note is parented like the box
  const shift = (parentId !== undefined ? space.abs.get(parentId) : undefined) ?? { x: 0, y: 0 };
  const data: NoteData = {
    target,
    name,
    threats,
    comments,
    links,
    anchor: { x: badge.x - shift.x, y: badge.y - shift.y },
    badge,
    editing,
    editingId: input.editingRow !== null && input.editingRow.key === key ? input.editingRow.id : undefined,
    onAddThreat: offerThreat ? input.onAddThreat : undefined,
    onRetitleThreat: editing ? input.onRetitleThreat : undefined,
    onSetThreatStatus: editing ? input.onSetThreatStatus : undefined,
    onEditThreatText: editing ? input.onEditThreatText : undefined,
    onOpenLink: input.onOpenLink,
    onEndEdit: input.onEndEdit,
  };
  return toRfNoteNode({
    id: NOTE_PREFIX + key,
    position: { x: at.x - shift.x, y: at.y - shift.y },
    data,
    parentId,
    draggable: editing,
  });
}
