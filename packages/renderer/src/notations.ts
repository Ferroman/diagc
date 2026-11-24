import {
  buildHierarchy,
  CAUSAL_LOOP_NOTATION,
  consequenceOrders,
  DEPLOY_NOTATION,
  DEPLOY_ZONE_TYPES,
  FISHBONE_NOTATION,
  GIT_NOTATION,
  GIT_STAGE_TYPE,
  PLAN_ACTOR_TYPES,
  PLAN_EVENT_TYPE,
  PLAN_INTERRUPTS,
  PLAN_NOTATION,
  PLAN_ZONE_TYPE,
  SECOND_ORDER_NOTATION,
  SM_NOTATION,
  TM_BOUNDARY_TYPE,
  isPlanActor,
  isPlanEvent,
  isPlanPeriod,
  isPlanRole,
  periodSpanOf,
  planPeriodsOf,
  planSubtree,
  planSubtreeRange,
  isPlanZone,
  rolesOf,
  TM_NOTATION,
  valenceOf,
  type DeployZoneType,
  type DiagramModel,
  type DiagramNode,
  type NotationId,
  type Polarity,
  type PlanRole,
  type Point,
  type BoxSize,
  type ViewEdge,
} from '@diagc/core/internal';
import { fishboneEdgeColor, fishboneLayout, fishboneNodeColors } from './layout/fishbone-layout';
import { GIT_LAYOUT, gitEdgeColor, gitLayout, gitNodeColors } from './layout/git-layout';
import { ABOVE_BOXES_Z } from './canvas/stacking';
import { planArrow, type ArrowEnd } from './edge/plan-arrow';
import type { LayoutResult, NotationLayoutInput } from './layout/layout';
import { PLAN_LAYOUT, planChips, planGraphCached, planLabelSides, planLayout, planStripes } from './layout/plan-layout';
import { DEFAULT_TYPE_STYLES, type KindStyle, type TypeStyle } from './registry';
import { stateMachineColors, stateMachineEdgeColor } from './state-kinds';

/** A small chip in a node's badge row: one of the plan's role chips, the only
 * producer today. */
export interface NodeChip {
  /** the role the referenced node holds on this one */
  role: PlanRole;
  /** the node the chip stands for: the actor holding the role */
  refId: string;
  text: string;
  title: string;
  color?: string;
}

/** the side of its box a name drawn outside the box hangs on */
export type LabelSide = 'left' | 'right';

/** A stretch of a box hatched over — a plan period's days on a bar it
 * interrupts — in px from the box's left edge, with the period's name and colour. */
export interface NodeStripe {
  x: number;
  width: number;
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
  /** the elk algorithm a plane gets when its settings name none. A sidecar's
   * own choice still wins, `layered` included — so for a notation with a
   * default, `layered` must be stored rather than left `undefined`. */
  defaultAlgorithm?: string;
  /** the plane's arrangement, replacing elk entirely: pure, synchronous, and
   * expected to place every node the view shows. `positions` is the plane's
   * SAVED, parent-relative positions (same gating as the overlay: none while
   * a viewer asked to ignore them, always the document while editing) — an
   * arrangement that owns its plane may honour a saved position for nodes it
   * chooses to (the plan does, for a zone's free-form children). Only reaches
   * this function when `layoutReadsPositions` says so below; every other
   * layout (elk, git-graph's, fishbone's) gets a stable `undefined` instead
   * (see useViewLayout's `layoutPositions`). */
  layout?: (input: NotationLayoutInput) => LayoutResult;
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
  /** nodes outside a drilled container carried into its view as themselves
   * (ViewportState.carry): a plan's people and teams belong to no zone, but an
   * opened zone without the ones holding its roles is a schedule nobody runs */
  drillCarry?: (model: DiagramModel, plane: string | undefined, root: string) => readonly string[];
  /** the canvas offers an element's first threat: the empty threat badge on a
   * node or a flow, and a note's add row. Elsewhere a threat is added in the
   * panel; a badge on every box of a C4 diagram would be noise. */
  offersThreats?: boolean;
  node?: {
    typelessAsText?: boolean;
    leafSize?: (n: DiagramNode) => BoxSize | undefined;
    /** containers that never fold: the view pins them expanded whatever the
     * viewer's pins say (a git lane is a row, not a box with an inside) */
    alwaysExpanded?: (n: DiagramNode) => boolean;
    /** containers drawn open until the viewer folds them: the view pins them
     * expanded unless the host's pins say collapsed. A plan zone is a bar with
     * rows in it — folded by default it would hide the schedule it exists to
     * show — but it still folds and opens like any box. */
    restsOpen?: (n: DiagramNode) => boolean;
    /** node id → accent colour, applied where the node sets none (a commit
     * takes its lane's colour) */
    colorOf?: (model: DiagramModel, plane: string | undefined) => ReadonlyMap<string, string>;
    /** small chips in a node's badge row (the plan's role chips); keyed by
     * node id, one derivation per model like colorOf */
    chips?: (model: DiagramModel, plane: string | undefined) => ReadonlyMap<string, NodeChip[]>;
    /** leaf boxes whose name is drawn OUTSIDE the box, on the given side: a
     * box whose width means something (a plan bar's is its dates) and is too
     * narrow for its name. Keyed by node id, one derivation per model like
     * chips; absent = the name sits inside, as on every other box. */
    labelSides?: (model: DiagramModel, plane: string | undefined) => ReadonlyMap<string, LabelSide>;
    /** stretches drawn hatched over a box (a plan bar's interrupted days),
     * keyed by node id, one derivation per model like chips; part of the box,
     * so they move and resize with it */
    stripes?: (model: DiagramModel, plane: string | undefined) => ReadonlyMap<string, NodeStripe[]>;
    /** a role chip opens a menu that changes or removes the role, in edit mode */
    roleChips?: boolean;
    /** types outlined in their own colour when the selection's neighbourhood
     * takes them in: the plan's people and teams. A type check alone would
     * mark a C4 person on a plane that has never heard of roles. */
    actorOutline?: (type: string) => boolean;
    /** types drawn as a lane, a full-width row rather than a box, with or
     * without children: a git branch. An empty one compiles as a leaf. */
    isLane?: (type: string) => boolean;
    /** 'x' = the studio offers left/right resize handles on this node;
     * undefined = no notation resizer */
    resizable?: (n: DiagramNode) => 'x' | undefined;
    /** a node other nodes can be dropped into (see EditingApi.onDropInto) */
    dropTarget?: (n: DiagramNode) => boolean;
    /** a node a drag may drop into a target (see dropTarget); every other
     * node is always moved */
    canDrop?: (n: DiagramNode) => boolean;
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
    /** the notation's own ends for an edge between two boxes as drawn
     * (absolute): a curve leaving `from` rightward and arriving at `to`
     * rightward, used instead of floating whenever both ends are measured, the
     * relation names no shape or side and this returns them: a plan's
     * finish-to-start arrow between two dated rows (edge/plan-arrow.ts) */
    endToStart?: (source: ArrowEnd, target: ArrowEnd) => { from: Point; to: Point } | undefined;
    /** React Flow's stacking order for every edge: ABOVE_BOXES_Z draws them
     * over the boxes however deep they nest, under the notes (canvas/adapter.ts).
     * Unset = React Flow's own, under the boxes. */
    zIndex?: number;
  };
  /** what the notation draws above the diagram */
  canvasOverlay?: 'loop-labels' | 'git-lanes' | 'order-bands' | 'time-axis';
}

const CLD: NotationProfile = {
  id: CAUSAL_LOOP_NOTATION,
  className: 'dg-notation-cld',
  edgeCurvature: 0.55,
  // A loop is the thing a CLD shows, and layered draws every cycle as a line
  // with one edge running back up it. stress places nodes by graph distance,
  // so a feedback loop comes out as a ring (see STRESS_EDGE_LENGTH, overlap.ts).
  defaultAlgorithm: 'stress',
  node: { typelessAsText: true, leafSize: (n) => (n.type === undefined ? { width: 140, height: 48 } : undefined) },
  // Signed links carry the colour, not just the glyph: at CLD densities a 13px
  // +/− is unreadable while a two-colour link mesh reads at a glance. Theme
  // tokens rather than literals so light/dark and future presets stay in charge.
  edge: {
    marks: true,
    bowed: true,
    polarityColors: { '+': 'var(--dg-polarity-positive)', '-': 'var(--dg-polarity-negative)' },
  },
  canvasOverlay: 'loop-labels',
};

const GIT: NotationProfile = {
  id: GIT_NOTATION,
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
    isLane: (type) => type === 'branch',
    leafSize: (n) => (n.type === 'commit' ? { width: GIT_LAYOUT.DIAMETER, height: GIT_LAYOUT.DIAMETER } : undefined),
    colorOf: gitNodeColors,
  },
  edge: { colorOf: gitEdgeColor },
  canvasOverlay: 'git-lanes',
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
  id: SECOND_ORDER_NOTATION,
  className: 'dg-notation-so',
  partitionOf: (model) => consequenceOrders(model).orders,
  node: { colorOf: valenceColors },
  canvasOverlay: 'order-bands',
};

// ---- Fishbone ---------------------------------------------------------------
// The notation owns the arrangement (as git-graph does): the fish's shape IS
// its structure, so elk has nothing to decide. Bones take their category's
// colour; the head and cause looks are their own node bodies (node/bodies/).
const FISHBONE: NotationProfile = {
  id: FISHBONE_NOTATION,
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
 * notation's identity, one red for both themes. The boundary is an outline, so
 * on the dark canvas it is lifted as any outline's colour is (outline-ink.ts). */
export const TM_BOUNDARY_COLOR = '#c62828';

function boundaryColors(model: DiagramModel): ReadonlyMap<string, string> {
  return new Map(model.nodes.filter((n) => n.type === TM_BOUNDARY_TYPE).map((n) => [n.id, TM_BOUNDARY_COLOR]));
}

const THREAT_MODEL: NotationProfile = {
  id: TM_NOTATION,
  className: 'dg-notation-tm',
  offersThreats: true,
  node: { colorOf: boundaryColors },
};

// ---- Deployment ---------------------------------------------------------------
// A stencil notation like C4 and the threat model: registry shapes carry the
// vocabulary and elk arranges. The profile colours the zones — theme tokens,
// through colorOf, so an explicit node colour still wins — and styles.css turns
// each zone's header into a tab in that colour. A C4 deployment node draws as
// the host it is.
const DEPLOY_ZONE_COLOR: Record<DeployZoneType, string> = Object.fromEntries(
  DEPLOY_ZONE_TYPES.map((t) => [t, `var(--dg-${t})`]),
) as Record<DeployZoneType, string>;
const ZONE_COLOR_OF: ReadonlyMap<string, string> = new Map<string, string>([
  ...Object.entries(DEPLOY_ZONE_COLOR),
  ['c4-deployment-node', DEPLOY_ZONE_COLOR['deploy-host']],
]);

function zoneColors(model: DiagramModel): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const n of model.nodes) {
    const c = n.type !== undefined ? ZONE_COLOR_OF.get(n.type) : undefined;
    if (c !== undefined) out.set(n.id, c);
  }
  return out;
}

const DEPLOYMENT: NotationProfile = {
  id: DEPLOY_NOTATION,
  className: 'dg-notation-deploy',
  typeStyles: {
    'c4-deployment-node': { ...DEFAULT_TYPE_STYLES['c4-deployment-node']!, icon: 'server', dashed: false },
  },
  node: { colorOf: zoneColors },
};

// ---- Plan -------------------------------------------------------------------
// The notation owns the arrangement (as git-graph does) because x IS a date.
// Roles are relations actor → zone that never draw as edges: they become
// chips on the zone, so the picture stays a Gantt chart, not a web.
// ROLE_LABEL and planChips live beside the layout (plan-layout.ts): the layout
// measures a zone's chips to size its title band, so both read one derivation.
export { ROLE_LABEL, planChips } from './layout/plan-layout';

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

/** What an opened zone carries in (`drillCarry`), in the roster's order: the
 * actors holding a role on it or on any zone inside it, and the actors with
 * no role anywhere yet. Those are the pool a zone is staffed from, and a
 * person or team just added (Add person, `+` beside an actor) is one of them:
 * left out, it would be created off screen. Someone busy only elsewhere stays
 * out, which is the noise an opened zone is for removing. */
function planDrillCarry(model: DiagramModel, plane: string | undefined, root: string): readonly string[] {
  const g = planGraphCached(model, plane);
  const zones = new Set(planSubtree(g, root));
  const roles = model.relations.filter((r) => isPlanRole(r.kind));
  const holders = new Set(roles.filter((r) => zones.has(r.to)).map((r) => r.from));
  const busy = new Set(roles.map((r) => r.from));
  // the pool is not in `g.actors` (a role holder list); the whole plan's
  // roster draws it after them, from the plane's own nodes, and so does this
  const onPlane = buildHierarchy(model, plane).childrenOf;
  const pool = model.nodes.filter((n) => isPlanActor(n) && !busy.has(n.id) && onPlane.has(n.id)).map((n) => n.id);
  return [...g.actors.filter((id) => holders.has(id)), ...pool, ...carriedPeriods(model, g, zones, root)];
}

/** The periods an opened zone still shows: those interrupting it or a zone in
 * it, and those interrupting nobody (a holiday for everyone) whose days touch
 * its own. A period pausing only some other zone is that zone's business. */
function carriedPeriods(
  model: DiagramModel,
  g: ReturnType<typeof planGraphCached>,
  zones: ReadonlySet<string>,
  root: string,
): string[] {
  const range = planSubtreeRange(g, model, root);
  const pausing = new Set([...zones].flatMap((z) => planPeriodsOf(model, z)));
  const byId = new Map(model.nodes.map((n) => [n.id, n] as const));
  const interruptsAny = new Set(model.relations.filter((r) => r.kind === PLAN_INTERRUPTS).map((r) => r.from));
  return g.periods.filter((id) => {
    if (pausing.has(id)) return true;
    const span = periodSpanOf(byId.get(id)!);
    return (
      !interruptsAny.has(id) &&
      span !== undefined &&
      range !== undefined &&
      span.start <= range.end &&
      span.end >= range.start
    );
  });
}

const PLAN: NotationProfile = {
  id: PLAN_NOTATION,
  className: 'dg-notation-plan',
  layout: planLayout,
  // planLayout reads a zone's saved child positions (a free-form "other")
  // and clamps them itself, so it must re-run when a drag changes them.
  layoutReadsPositions: true,
  related: planRelated,
  drillCarry: planDrillCarry,
  node: {
    restsOpen: (n) => n.type === PLAN_ZONE_TYPE,
    leafSize: (n) => (n.type === PLAN_EVENT_TYPE ? { width: PLAN_LAYOUT.EVENT, height: PLAN_LAYOUT.EVENT } : undefined),
    chips: planChips,
    labelSides: planLabelSides,
    stripes: planStripes,
    roleChips: true,
    actorOutline: (type) => PLAN_ACTOR_TYPES.has(type),
    resizable: (n) => (n.type === PLAN_ZONE_TYPE ? 'x' : undefined),
    // A zone receives a drop (an actor's role, a plain node's containment).
    // isPlanZone, not a nested-only check: a root zone's Y is free and can
    // overlap a sibling's rect just as readily as a nested one crosses its
    // own parent's.
    dropTarget: isPlanZone,
    // A zone's or an event's drag is its date move; an actor or a plain box
    // is what a zone receives, so those are what a drag may drop.
    canDrop: (n) => isPlanActor(n) || (!isPlanZone(n) && !isPlanEvent(n)),
    // An actor is dragged only to be dropped on a zone; it never keeps the
    // position a drag left it at — the roster is a list, not a seating chart.
    snapsBack: isPlanActor,
    // Everything fixed drags, actors included: an actor drags only to be
    // dropped (drop-to-assign) and always snaps back after (see snapsBack
    // above). A period does not: its days are edited in the source.
    draggableWhenFixed: (n) => !isPlanPeriod(n),
  },
  // A dependency's drops cross every row between its two bars: under them it
  // vanishes behind each one, so plan edges are drawn over the bars.
  // A period's `interrupts` is drawn as the stripe on the bar, never a line.
  edge: { hidden: (k) => isPlanRole(k) || k === PLAN_INTERRUPTS, endToStart: planArrow, zIndex: ABOVE_BOXES_Z },
  canvasOverlay: 'time-axis',
};

/** A UML state machine: states, pseudo-states and transitions. The type vocabulary
 * lives in the registry; the profile adds the colours that are not UML's — a zone's
 * wash, a state's kind, and the failure colour on the way into a failed state. */
const STATE_MACHINE: NotationProfile = {
  id: SM_NOTATION,
  className: 'dg-notation-sm',
  node: { colorOf: stateMachineColors },
  edge: { colorOf: stateMachineEdgeColor },
};

// Record<NotationId, ...> keying means adding a notation id to BUILTIN_NOTATIONS
// forces a compile error here until its profile is added — intended.
export const NOTATION_PROFILES: Record<NotationId, NotationProfile> = {
  [CAUSAL_LOOP_NOTATION]: CLD,
  [GIT_NOTATION]: GIT,
  c4: C4,
  [SECOND_ORDER_NOTATION]: SECOND_ORDER,
  [FISHBONE_NOTATION]: FISHBONE,
  [TM_NOTATION]: THREAT_MODEL,
  [PLAN_NOTATION]: PLAN,
  [DEPLOY_NOTATION]: DEPLOYMENT,
  [SM_NOTATION]: STATE_MACHINE,
};

const DEFAULT_PROFILE: NotationProfile = { id: 'default' };

export const notationProfile = (id?: NotationId): NotationProfile =>
  id !== undefined ? (NOTATION_PROFILES[id] ?? DEFAULT_PROFILE) : DEFAULT_PROFILE;
