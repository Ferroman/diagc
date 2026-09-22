import { consequenceOrders, GIT_STAGE_TYPE, TM_BOUNDARY_TYPE, valenceOf, type CompiledView, type DiagramModel, type DiagramNode, type NotationId, type Polarity, type Size, type ViewEdge } from '@diagc/core';
import { fishboneEdgeColor, fishboneLayout, fishboneNodeColors } from './fishbone-layout';
import { GIT_LAYOUT, gitEdgeColor, gitLayout, gitNodeColors } from './git-layout';
import type { LayoutResult } from './layout';
import { DEFAULT_TYPE_STYLES, type KindStyle, type TypeStyle } from './registry';

/** A visual language: default look plus registry/chrome overrides for a plane's notation. */
export interface NotationProfile {
  id: NotationId | 'default';
  className?: string;
  typeStyles?: Record<string, TypeStyle>;
  kindStyles?: Record<string, KindStyle>;
  edgeCurvature?: number;
  /** the plane's arrangement, replacing elk entirely: pure, synchronous, and
   * expected to place every node the view shows */
  layout?: (
    view: CompiledView,
    model: DiagramModel,
    plane: string | undefined,
    sizeHints?: ReadonlyMap<string, Size>,
  ) => LayoutResult;
  /** node id → layer partition: the notation derives an ORDER for its nodes and
   * elk keeps each in it, while still doing the arranging (unlike `layout`,
   * which replaces elk). Honoured by `layered` only, so the view runs a
   * partitioned plane through layered whatever its settings name. */
  partitionOf?: (model: DiagramModel, plane: string | undefined) => ReadonlyMap<string, number>;
  node?: {
    typelessAsText?: boolean;
    leafSize?: (n: DiagramNode) => Size | undefined;
    /** containers that never fold: the view pins them expanded whatever the
     * viewer's pins say (a git lane is a row, not a box with an inside) */
    alwaysExpanded?: (n: DiagramNode) => boolean;
    /** node id → accent colour, applied where the node sets none (a commit
     * takes its lane's colour) */
    colorOf?: (model: DiagramModel, plane: string | undefined) => ReadonlyMap<string, string>;
  };
  edge?: {
    marks?: boolean;
    bowed?: boolean;
    /** stroke colour per polarity, applied to the line *and* its +/− glyph when
     * nothing more specific (relation override, layer tint) claims the colour */
    polarityColors?: Record<Polarity, string>;
    /** stroke colour for an edge, below the layer tint and above the default */
    colorOf?: (e: ViewEdge, model: DiagramModel, plane: string | undefined) => string | undefined;
  };
  overlay?: 'loop-labels' | 'git-lanes' | 'order-bands';
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
// Filled in with the schedule layout, header and chips; the id must exist as
// soon as core declares the notation or the profile table stops typechecking.
const PLAN: NotationProfile = { id: 'plan', className: 'dg-notation-plan' };

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
