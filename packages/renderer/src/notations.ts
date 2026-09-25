import { consequenceOrders, GIT_STAGE_TYPE, PLAN_EVENT_TYPE, PLAN_NOTATION, PLAN_ROLES, PLAN_ZONE_TYPE, TM_BOUNDARY_TYPE, isPlanActor, isPlanRole, isPlanZone, rolesOf, valenceOf, type CompiledView, type DiagramModel, type DiagramNode, type NotationId, type Polarity, type PlanRole, type Size, type ViewEdge } from '@diagc/core';
import { fishboneEdgeColor, fishboneLayout, fishboneNodeColors } from './fishbone-layout';
import { GIT_LAYOUT, gitEdgeColor, gitLayout, gitNodeColors } from './git-layout';
import type { LayoutResult } from './layout';
import { PLAN_LAYOUT, planGraphCached, planLayout } from './plan-layout';
import { DEFAULT_TYPE_STYLES, type KindStyle, type TypeStyle } from './registry';

/** A small chip in a node's badge row (the plan's role chips are the only
 * producer today, but the shape is generic — any notation could grow one). */
export interface NodeBadge {
  key: string;
  text: string;
  title: string;
  color?: string;
}

/** A visual language: default look plus registry/chrome overrides for a plane's notation. */
export interface NotationProfile {
  id: NotationId | 'default';
  className?: string;
  typeStyles?: Record<string, TypeStyle>;
  kindStyles?: Record<string, KindStyle>;
  edgeCurvature?: number;
  /** the plane's arrangement, replacing elk entirely: pure, synchronous, and
   * expected to place every node the view shows. `positions` is the plane's
   * SAVED, parent-relative positions (same gating as the overlay: none while
   * a viewer asked to ignore them, always the document while editing) — an
   * arrangement that owns its plane may honour a saved position for nodes it
   * chooses to (the plan does, for a zone's free-form children). Only reaches
   * this function when `layoutReadsPositions` says so below; every other
   * layout (elk, git-graph's, fishbone's) gets a stable `undefined` instead
   * (see useViewLayout's `layoutPositions`). */
  layout?: (
    view: CompiledView,
    model: DiagramModel,
    plane: string | undefined,
    sizeHints?: ReadonlyMap<string, Size>,
    positions?: Record<string, { x: number; y: number }>,
  ) => LayoutResult;
  /** the arrangement honours saved positions for some of its nodes and must be
   * re-run when they change; without it the layout never sees them and a drag
   * never re-arranges. Most notation layouts (git-graph, fishbone) ignore
   * `positions` entirely, so leaving this unset keeps their effect from
   * re-running on every drag the way `layoutSettings` keeps elk from re-running
   * on one (see useViewLayout's `layoutPositions`). */
  layoutReadsPositions?: boolean;
  /** node id → layer partition: the notation derives an ORDER for its nodes and
   * elk keeps each in it, while still doing the arranging (unlike `layout`,
   * which replaces elk). Honoured by `layered` only, so the view runs a
   * partitioned plane through layered whatever its settings name. */
  partitionOf?: (model: DiagramModel, plane: string | undefined) => ReadonlyMap<string, number>;
  /** nodes that belong in `id`'s selection neighbourhood although no drawn
   * edge joins them (`useLoopOverlay` unions the result into `neighborFocus`).
   * The plan needs this because role relations are hidden edges (`edge.hidden`
   * below) — selecting an actor would otherwise dim every zone it holds a
   * role on, the opposite of what a reader wants. */
  related?: (model: DiagramModel, plane: string | undefined, id: string) => readonly string[];
  node?: {
    typelessAsText?: boolean;
    leafSize?: (n: DiagramNode) => Size | undefined;
    /** containers that never fold: the view pins them expanded whatever the
     * viewer's pins say (a git lane is a row, not a box with an inside) */
    alwaysExpanded?: (n: DiagramNode) => boolean;
    /** node id → accent colour, applied where the node sets none (a commit
     * takes its lane's colour) */
    colorOf?: (model: DiagramModel, plane: string | undefined) => ReadonlyMap<string, string>;
    /** small chips in a node's badge row (the plan's role chips); keyed by
     * node id, one derivation per model like colorOf */
    badges?: (model: DiagramModel, plane: string | undefined) => ReadonlyMap<string, NodeBadge[]>;
    /** 'x' = the studio offers left/right resize handles on this node;
     * undefined = no notation resizer */
    resizable?: (n: DiagramNode) => 'x' | undefined;
    /** a node other nodes can be dropped into (see EditingApi.onDropInto) */
    dropTarget?: (n: DiagramNode) => boolean;
    /** a node that returns to its laid spot after every drag and is never
     * reported as moved — dragged only to be dropped somewhere */
    snapsBack?: (n: DiagramNode) => boolean;
    /** a `fixed` node whose drag still means something to the host: the plan reads a
     * zone's or event's displacement as days (`onNodesMoved` deltas). The overlay
     * still never stores a position for it — `fixed` keeps that meaning. */
    draggableWhenFixed?: (n: DiagramNode) => boolean;
  };
  edge?: {
    marks?: boolean;
    bowed?: boolean;
    /** stroke colour per polarity, applied to the line *and* its +/− glyph when
     * nothing more specific (relation override, layer tint) claims the colour */
    polarityColors?: Record<Polarity, string>;
    /** stroke colour for an edge, below the layer tint and above the default */
    colorOf?: (e: ViewEdge, model: DiagramModel, plane: string | undefined) => string | undefined;
    /** relation kinds the view never draws as edges (the legend skips them too) */
    hidden?: (kind: string) => boolean;
  };
  overlay?: 'loop-labels' | 'git-lanes' | 'order-bands' | 'time-axis';
}

const CLD: NotationProfile = {
  id: 'causal-loop',
  className: 'dg-notation-cld',
  edgeCurvature: 0.55,
  node: { typelessAsText: true, leafSize: (n) => (n.type === undefined ? { width: 140, height: 48 } : undefined) },
  // Signed links carry the colour, not just the glyph: at CLD densities a 13px
  // +/− is unreadable while a two-colour link mesh reads at a glance. Theme
  // tokens rather than literals so light/dark and future presets stay in charge.
  edge: {
    marks: true,
    bowed: true,
    polarityColors: { '+': 'var(--dg-polarity-positive)', '-': 'var(--dg-polarity-negative)' },
  },
  overlay: 'loop-labels',
};

const GIT: NotationProfile = {
  id: 'git-graph',
  className: 'dg-notation-git',
  typeStyles: { commit: { shape: 'circle' }, branch: { shape: 'box' }, [GIT_STAGE_TYPE]: { shape: 'box', label: '' } },
  // Links are lane lines and connectors, not arrows: dashed, no heads.
  kindStyles: {
    commit: { dashed: true, endMarker: 'none' },
    branch: { dashed: true, endMarker: 'none' },
    merge: { dashed: true, endMarker: 'none' },
  },
  layout: gitLayout,
  node: {
    alwaysExpanded: (n) => n.type === 'branch',
    leafSize: (n) => (n.type === 'commit' ? { width: GIT_LAYOUT.DIAMETER, height: GIT_LAYOUT.DIAMETER } : undefined),
    colorOf: gitNodeColors,
  },
  edge: { colorOf: gitEdgeColor },
  overlay: 'git-lanes',
};

// ---- C4 (https://c4model.com) ---------------------------------------------
// The palette is the notation's identity, so the fills are literals, not theme
// tokens — same hexes in both themes. Deliberate divergence from C4-PlantUML:
// dark text on the component light blue (white on #85bbf0 fails contrast).
const C4_PERSON = '#08427b';
const C4_SYSTEM = '#1168bd';
const C4_CONTAINER = '#438dd5';
const C4_COMPONENT = '#85bbf0';
const C4_EXTERNAL = '#999999';
const C4_ON_DARK = '#ffffff';
const C4_ON_LIGHT = '#0b1a2b';

/** A base registry entry plus the C4 solid look. Spread, never restate: the
 * registry replaces whole entries, so dropping a base field here would change
 * the stencil's shape/icon, not just its colour. */
const c4Solid = (id: string, fill: string, textOn: string, extra?: Partial<TypeStyle>): [string, TypeStyle] => [
  id,
  { ...DEFAULT_TYPE_STYLES[id]!, fill, textOn, ...extra },
];

const C4_TYPE_STYLES: Record<string, TypeStyle> = Object.fromEntries([
  c4Solid('c4-person', C4_PERSON, C4_ON_DARK, { shape: 'person' }),
  c4Solid('c4-person-external', C4_EXTERNAL, C4_ON_DARK, { shape: 'person' }),
  c4Solid('c4-system', C4_SYSTEM, C4_ON_DARK),
  c4Solid('c4-system-external', C4_EXTERNAL, C4_ON_DARK),
  ...['', '-web', '-spa', '-mobile', '-desktop', '-api', '-function', '-cli', '-db', '-blob', '-search', '-queue'].map(
    (suffix) => c4Solid(`c4-container${suffix}`, C4_CONTAINER, C4_ON_DARK),
  ),
  c4Solid('c4-container-external', C4_EXTERNAL, C4_ON_DARK),
  c4Solid('c4-component', C4_COMPONENT, C4_ON_LIGHT),
  c4Solid('c4-component-db', C4_COMPONENT, C4_ON_LIGHT),
  c4Solid('c4-component-queue', C4_COMPONENT, C4_ON_LIGHT),
  c4Solid('c4-component-external', C4_EXTERNAL, C4_ON_DARK),
]);

// Boundaries (`c4-*-boundary`, `c4-enterprise-boundary`, `c4-group`), deployment
// (`c4-deployment-node`, `c4-infrastructure-node`, `c4-container-instance`) and
// code-level (`c4-class`, `c4-interface`, `c4-enum`) types get no override — they
// keep the base dashed/outline look by design.
const C4: NotationProfile = {
  id: 'c4',
  className: 'dg-notation-c4',
  typeStyles: C4_TYPE_STYLES,
};

// ---- Second-order thinking --------------------------------------------------
const VALENCE_COLOR = { '+': 'var(--dg-polarity-positive)', '-': 'var(--dg-polarity-negative)' } as const;

/** Accent per consequence, by valence — theme tokens, never literals. Neutral
 * gets none and keeps the plain box. */
function valenceColors(model: DiagramModel): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const n of model.nodes) {
    const v = valenceOf(n.type);
    if (v === '+' || v === '-') out.set(n.id, VALENCE_COLOR[v]);
  }
  return out;
}

const SECOND_ORDER: NotationProfile = {
  id: 'second-order',
  className: 'dg-notation-so',
  partitionOf: (model) => consequenceOrders(model).orders,
  node: { colorOf: valenceColors },
  overlay: 'order-bands',
};

// ---- Fishbone ---------------------------------------------------------------
// The notation owns the arrangement (as git-graph does): the fish's shape IS
// its structure, so elk has nothing to decide. Bones take their category's
// colour; the head and cause looks are DiagramNode's own branches.
const FISHBONE: NotationProfile = {
  id: 'fishbone',
  className: 'dg-notation-fb',
  layout: fishboneLayout,
  node: { colorOf: fishboneNodeColors },
  edge: { colorOf: fishboneEdgeColor },
};

// ---- Threat model -------------------------------------------------------------
// A stencil notation like C4: registry shapes carry the vocabulary and elk
// arranges. The one thing the profile adds is the boundary red — id-keyed
// through colorOf so it applies whatever the diagram's typeColors say, while an
// explicit node colour still wins (the accent chain is unchanged).
/** Trust-boundary red. A literal, like the C4 palette above: it is the
 * notation's identity and reads the same in both themes. */
export const TM_BOUNDARY_COLOR = '#c62828';

function boundaryColors(model: DiagramModel): ReadonlyMap<string, string> {
  return new Map(model.nodes.filter((n) => n.type === TM_BOUNDARY_TYPE).map((n) => [n.id, TM_BOUNDARY_COLOR]));
}

const THREAT_MODEL: NotationProfile = {
  id: 'threat-model',
  className: 'dg-notation-tm',
  node: { colorOf: boundaryColors },
};

// ---- Plan -------------------------------------------------------------------
// The notation owns the arrangement (as git-graph does) because x IS a date.
// Roles are relations actor → zone that never draw as edges: they become
// chips on the zone, so the picture stays a Gantt chart, not a web.
const ROLE_LABEL: Record<PlanRole, { initial: string; title: string }> = {
  owns: { initial: 'O', title: 'Owner' },
  executes: { initial: 'E', title: 'Executor' },
  checks: { initial: 'C', title: 'Checker' },
};

/** Role chips per zone, in owns / executes / checks order: `O·Alice` (first
 * word of the name), titled `Owner: Alice Ng`, in the actor's colour. Reads
 * the relation's `from` node whatever its type — a person or a team, alike. */
export function planBadges(model: DiagramModel, plane: string | undefined): ReadonlyMap<string, NodeBadge[]> {
  const byId = new Map(model.nodes.map((n) => [n.id, n] as const));
  const out = new Map<string, NodeBadge[]>();
  for (const id of planGraphCached(model, plane).zones) {
    const roles = rolesOf(model, id);
    const chips: NodeBadge[] = [];
    for (const role of PLAN_ROLES) {
      for (const actorId of roles[role]) {
        const actor = byId.get(actorId);
        if (actor === undefined) continue;
        const first = actor.name.trim().split(/\s+/)[0] ?? actor.id;
        chips.push({
          key: `${role}:${actorId}`,
          text: `${ROLE_LABEL[role].initial}·${first}`,
          title: `${ROLE_LABEL[role].title}: ${actor.name}`,
          ...(actor.color !== undefined ? { color: actor.color } : {}),
        });
      }
    }
    if (chips.length > 0) out.set(id, chips);
  }
  return out;
}

/** The other half of a role relation, whichever end `id` is: an actor's
 * selection neighbourhood is every zone it holds a role on, and a zone's is
 * every actor holding a role on it — both from the same `owns`/`executes`/
 * `checks` relations `edge.hidden` keeps off the canvas. Anything else (a
 * dependency-linked node, say) has no extra neighbours here; the edge it
 * drew with already puts it in `neighborFocus`. */
function planRelated(model: DiagramModel, plane: string | undefined, id: string): readonly string[] {
  const node = model.nodes.find((n) => n.id === id);
  if (node === undefined) return [];
  if (isPlanActor(node)) {
    const zones = new Set(planGraphCached(model, plane).zones);
    return model.relations.filter((r) => r.from === id && isPlanRole(r.kind) && zones.has(r.to)).map((r) => r.to);
  }
  if (isPlanZone(node)) {
    const roles = rolesOf(model, id);
    return [...roles.owns, ...roles.executes, ...roles.checks];
  }
  return [];
}

const PLAN: NotationProfile = {
  id: PLAN_NOTATION,
  className: 'dg-notation-plan',
  layout: planLayout,
  // planLayout reads a zone's saved child positions (a free-form "other")
  // and clamps them itself, so it must re-run when a drag changes them.
  layoutReadsPositions: true,
  related: planRelated,
  node: {
    alwaysExpanded: (n) => n.type === PLAN_ZONE_TYPE,
    leafSize: (n) => (n.type === PLAN_EVENT_TYPE ? { width: PLAN_LAYOUT.EVENT, height: PLAN_LAYOUT.EVENT } : undefined),
    badges: planBadges,
    resizable: (n) => (n.type === PLAN_ZONE_TYPE ? 'x' : undefined),
    // A zone receives a drop (an actor's role, a plain node's containment);
    // it is never itself dropped (DiagramView also excludes it via `fixed`,
    // since a zone's own drag already means a date change — see the plan's
    // rulings). isPlanZone, not a nested-only check: a root zone's Y is free
    // and can overlap a sibling's rect just as readily as a nested one.
    dropTarget: isPlanZone,
    // An actor is dragged only to be dropped on a zone; it never keeps the
    // position a drag left it at — the roster is a list, not a seating chart.
    snapsBack: isPlanActor,
    // Everything fixed drags now, actors included: an actor drags only to be
    // dropped (drop-to-assign) and always snaps back after (see snapsBack
    // above) — it used to be excluded here because that gesture didn't exist.
    draggableWhenFixed: () => true,
  },
  edge: { hidden: isPlanRole },
  overlay: 'time-axis',
};

// Record<NotationId, ...> keying means adding a notation id to BUILTIN_NOTATIONS
// forces a compile error here until its profile is added — intended.
export const NOTATION_PROFILES: Record<NotationId, NotationProfile> = {
  'causal-loop': CLD,
  'git-graph': GIT,
  c4: C4,
  'second-order': SECOND_ORDER,
  fishbone: FISHBONE,
  'threat-model': THREAT_MODEL,
  plan: PLAN,
};

const DEFAULT_PROFILE: NotationProfile = { id: 'default' };

export const notationProfile = (id?: NotationId): NotationProfile =>
  id !== undefined ? (NOTATION_PROFILES[id] ?? DEFAULT_PROFILE) : DEFAULT_PROFILE;
