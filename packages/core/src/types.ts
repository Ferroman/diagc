export interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

export const TEXT_ALIGNS = ['left', 'center', 'right'] as const;
export type TextAlign = (typeof TEXT_ALIGNS)[number];
export const FONT_SCALES = ['sm', 'md', 'lg'] as const;
export type FontScale = (typeof FONT_SCALES)[number];

export const SIDES = ['top', 'right', 'bottom', 'left'] as const;
export type Side = (typeof SIDES)[number];

export const RELATION_SHAPES = ['curved', 'straight', 'step'] as const;
export const RELATION_LINES = ['solid', 'dashed', 'dotted'] as const;
export const RELATION_MARKERS = ['arrow', 'dot', 'square', 'diamond', 'none'] as const;

/** Default footprint for image nodes whose size is not known yet. Kept in
 * core so the editor and the renderer cannot drift apart. */
export const DEFAULT_IMAGE_NODE_SIZE = { w: 160, h: 120 } as const;

export interface Column {
  name: string;
  /** SQL-ish type shown right-aligned in the row, e.g. 'uuid', 'int', 'text' */
  type?: string;
  /** primary-key member */
  pk?: boolean;
  /** this column is a foreign key (drives the FK marker + row-port edge origin) */
  fk?: boolean;
}

export interface DiagramNode {
  id: string;
  name: string;
  /** free-form kind resolved by the renderer's registry; omit for a bare,
   * typeless node (just a label) */
  type?: string;
  icon?: string;
  /** asset file ref (content-hash name in .diagrams/src/assets/), e.g. "a3f9c2d4e5f6.png";
   * when set the node renders as the image itself */
  image?: string;
  /** ref to an SVG silhouette (same forms as `image`: a content-hash asset name
   * or a `/library/…` path) rendered as a tintable CSS mask filled with the
   * node's color, over an invisible box. Takes precedence over `image`. */
  shape?: string;
  /** cross-diagram identity: nodes sharing a key merge into one entity when
   * diagrams are composed via includes; inert otherwise */
  key?: string;
  /** URL or path (relative to the declaring source) of another diagram whose
   * content this node contains after compile-time expansion */
  include?: string;
  /** accent color (border/background tint); overrides the type registry look */
  color?: string;
  /** label text color; overrides the default (which follows `color` for C4/shape
   * nodes). Independent of `color` so text can differ from the shape/border. */
  textColor?: string;
  description?: string;
  /** rich multiline label; when present, name === rich.map(r => r.text).join('') */
  rich?: TextRun[];
  /** whole-label horizontal alignment (default 'left') */
  textAlign?: TextAlign;
  /** whole-label relative font size (default 'md') */
  fontScale?: FontScale;
  metadata?: Record<string, unknown>;
  /** restrict this node to a single plane (a view-local box); omit = shared
   *  across every plane. Re-nesting a shared node on one plane (via a
   *  plane-tagged containment edge) does NOT change its membership. */
  plane?: string;
  /** transparent-sheet membership: the node shows only while this layer is
   *  active (like relations); omit = the always-on base sheet. */
  layer?: string;
  /** ER-table rows; rendered when `type` is 'db-table' (see m.table) */
  columns?: Column[];
}

export interface ContainmentEdge {
  parent: string;
  child: string;
  /** plane this edge belongs to; absent = the model's default (first-declared) plane */
  plane?: string;
}

/** An alternative containment context ("transparent sheet") over the same entities. */
export interface DiagramPlane {
  id: string;
  name: string;
  /** borrow another plane's containment instead of own edges (e.g. a flow view over architecture) */
  containmentOf?: string;
  /** layer ids activated by default when this plane is selected */
  layers?: string[];
  /** false = hide untagged (base) relations in this plane — only layer relations show */
  baseRelations?: boolean;
  /** visual language; absent = default look */
  notation?: string;
  /** shared node ids this plane hides, KEEPING their contents: a hidden box's
   *  children are promoted to where the box was, each with its own nesting
   *  intact. That is what composition needs — an umbrella hides the `include`
   *  wrapper to lift a whole service model into place. A node with `plane` set is
   *  already scoped, so it never belongs here. */
  hides?: string[];
  /** shared node ids this plane hides ALONG WITH everything inside them, however
   *  deep. A child with another still-visible parent survives (containment is a
   *  DAG). Use this to drop detail a view does not want — a database's tables —
   *  where `hides` would promote that detail to the top level instead. Hiding
   *  removes the hidden nodes' edges too, which is the point when a view is
   *  unreadable from edge density; `layout.export.collapsed` folds instead, and
   *  a folded box still anchors its children's edges. */
  hidesTree?: string[];
}

/** Per-relation visual overrides (whiteboard-style); anything unset falls back
 * to the kind registry's style and the layer tint. */
export interface RelationStyle {
  /** path geometry; default 'curved' (bezier) */
  shape?: (typeof RELATION_SHAPES)[number];
  /** any CSS color; overrides the layer tint */
  color?: string;
  /** stroke width in px */
  width?: number;
  line?: (typeof RELATION_LINES)[number];
  /** end marker at the arrow head; default 'arrow' */
  end?: (typeof RELATION_MARKERS)[number];
  /** pin which side of the source/target node the edge attaches to; unset = auto (facing side) */
  fromSide?: Side;
  toSide?: Side;
  animated?: boolean;
  /** bezier bend for 'curved'; default 0.25 */
  curvature?: number;
  /** which side a bowed arc bulges toward (same arrow direction); default 'left' */
  bow?: 'left' | 'right';
}

export type EdgeLabelSide = 'top' | 'bottom' | 'center';
/** a positioned text label on a connector; a relation may carry several */
export interface EdgeLabel {
  id: string;
  text: string;
  /** position along the edge, 0..1 (default 0.5) */
  t?: number;
  /** perpendicular alignment relative to the line (default 'center') */
  side?: EdgeLabelSide;
}

export interface DiagramRelation {
  id: string;
  from: string;
  to: string;
  kind: string;
  label?: string;
  /** positioned labels; when present, supersedes the legacy single `label`.
   * Read both through relationLabels() (bridges a legacy `label` string). */
  labels?: EdgeLabel[];
  style?: RelationStyle;
  description?: string;
  layer?: string;
  /** causal-loop-diagram polarity: '+' = same-direction influence, '-' = opposing */
  polarity?: Polarity;
  /** causal-loop-diagram delay marker on the influence */
  delay?: boolean;
  /** FK column on `from` (the many/child side) — anchors the edge to that row */
  fromColumn?: string;
  /** referenced column on `to` (the one/parent side); defaults to the target PK */
  toColumn?: string;
}

export interface DiagramLayer {
  id: string;
  name: string;
  tint?: string;
}

/** A hand-written legend row, for meaning the diagram cannot infer. */
export interface LegendItem {
  label: string;
  /** swatch drawn as this node type's shape (registry-resolved, free-form) */
  type?: string;
  /** swatch drawn as this relation kind's line (registry-resolved, free-form) */
  kind?: string;
  /** tint for whichever swatch is drawn; on its own = a plain colour chip */
  color?: string;
  icon?: string;
}

export const LEGEND_SECTIONS = ['layers', 'kinds', 'types'] as const;
export type LegendSection = (typeof LEGEND_SECTIONS)[number];

export const LEGEND_POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;
export type LegendPosition = (typeof LEGEND_POSITIONS)[number];

/** An opt-in key describing the diagram's own visual vocabulary. Rows are
 * derived from what is actually drawn; `items` adds what cannot be inferred. */
export interface DiagramLegend {
  /** default 'Legend' */
  title?: string;
  /** default 'bottom-right' — the only corner not already occupied by chrome */
  position?: LegendPosition;
  /** derived sections to include; default ['layers', 'kinds'] */
  show?: LegendSection[];
  /** hand-written rows, appended after the derived ones */
  items?: LegendItem[];
}

export interface DiagramModel {
  version: 1;
  id: string;
  name: string;
  /** id of a renderer style preset pinned by this diagram (travels with the
   * file); unknown ids are legal — the renderer falls back to the app-level
   * preference */
  style?: string;
  /** opt-in key for this diagram's visual vocabulary; absent = no legend */
  legend?: DiagramLegend;
  /** default accent colour per node type, so a composed diagram can carry a
   * colour convention its included models know nothing about. `*` is the
   * fallback for any type without an entry. A node's own `color` always wins,
   * and an include's `typeColors` is dropped on graft: the host owns the look. */
  typeColors?: Record<string, string>;
  /** Class -> layer for relations that carry no `layer` of their own, so a
   * composed diagram can put included relations on layers it declares (an
   * umbrella cannot edit grafted relations). A rule matches when every field it
   * names equals the relation's (`kind`, `style.color`); first match wins; an
   * explicit `layer` always beats the rules. Presentation, so dropped from
   * included models on graft: the host owns the look. */
  layerRules?: LayerRule[];
  nodes: DiagramNode[];
  containment: ContainmentEdge[];
  relations: DiagramRelation[];
  layers: DiagramLayer[];
  /** empty = single implicit plane (all containment, no switcher) */
  planes: DiagramPlane[];
}

/** One `layerRules` entry. Set at least one of `kind` / `color`. */
export interface LayerRule {
  kind?: string;
  color?: string;
  layer: string;
}

/** Per-plane automatic-layout tuning. Every field is optional; an absent field
 * falls back to the renderer's tuned default (see layoutOptionsFor). Travels in
 * the layout overlay so a published diagram inherits the author's choices. */
export interface LayoutSettings {
  /** elk.algorithm — 'layered' (default) | 'force' | 'stress' | 'mrtree' | 'radial' | 'rectpacking' */
  algorithm?: string;
  /** elk.direction for layered — 'RIGHT' (default) | 'DOWN' | 'LEFT' | 'UP' */
  direction?: string;
  /** base node-node spacing in px; between-layers spacing is derived from it */
  spacing?: number;
  /** how drawn edges are routed: 'curved' floating beziers (default) or
   * 'orthogonal' along elk-computed waypoints */
  edgeRouting?: 'curved' | 'orthogonal';
}

/** Editor-managed node positions, keyed by resolved containment plane. */
export interface LayoutOverlay {
  version: 1;
  planes: Record<string, Record<string, { x: number; y: number }>>;
  /** editor-resized node footprints (image nodes); plane-independent — a
   * node's size is the same on every plane, unlike its position */
  sizes?: Record<string, { w: number; h: number }>;
  /** planes switched to manual layout (automatic layout off); keyed like
   * `planes` (via layoutPlaneKey). Absent/omitted ⇒ automatic layout. */
  manual?: Record<string, true>;
  /** per-plane automatic-layout settings, keyed like `planes` (via
   * layoutPlaneKey). Absent ⇒ tuned defaults everywhere. */
  settings?: Record<string, LayoutSettings>;
  /** how the PNG export should differ from the interactive page. Ignored by the
   * interactive page, which always rests fully folded and lets the reader
   * unfold what they want. */
  export?: {
    /** node ids kept folded in PNG export; ignored by the interactive page.
     * The exporter unfolds every container to get a full overview, which makes a
     * view with hundreds of leaves an unreadable thumbnail. Listing a container
     * here folds it back up for the image only. Folding is the right tool
     * (rather than the plane's `hides`) because a folded box still ANCHORS its
     * hidden children's edges, where a hidden node drops them. Ids that are not
     * containers have no effect. */
    collapsed?: string[];
  };
}

export const BUILTIN_NOTATIONS = ['causal-loop'] as const;
export type NotationId = (typeof BUILTIN_NOTATIONS)[number];
export type Polarity = '+' | '-';
