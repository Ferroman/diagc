import { GIT_STAGE_TYPE, type CompiledView, type DiagramModel, type DiagramNode, type NotationId, type Polarity, type Size, type ViewEdge } from '@diagramming/core';
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
  overlay?: 'loop-labels' | 'git-lanes';
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

// Record<NotationId, ...> keying means adding a notation id to BUILTIN_NOTATIONS
// forces a compile error here until its profile is added — intended.
export const NOTATION_PROFILES: Record<NotationId, NotationProfile> = { 'causal-loop': CLD, 'git-graph': GIT, c4: C4 };

const DEFAULT_PROFILE: NotationProfile = { id: 'default' };

export const notationProfile = (id?: NotationId): NotationProfile =>
  id !== undefined ? (NOTATION_PROFILES[id] ?? DEFAULT_PROFILE) : DEFAULT_PROFILE;
