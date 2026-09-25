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

/** Sentinel id the renderer's elk wrapper uses for its synthetic layout root.
 * Kept in core so validation can refuse a model node that would collide with
 * it — the renderer and validate() must agree on the exact string. */
export const RESERVED_NODE_ID = '__root__';

/** Node types whose containment children cannot be re-homed when the container
 * dies — an orphaned activity lane or git commit fails validation until undone.
 * Deleting one of these cascades to its subtree; every other container severs
 * only. Kept in core so the editor UI and the command algebra agree. */
export const CASCADE_DELETE_TYPES = ['activity-frame', 'branch'] as const;

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
  /** navigation target attached to the node — a URL (published HTML opens it in
   * a new tab) or a host-interpreted ref like an Obsidian [[wikilink]]; the
   * model records it and never interprets it */
  link?: string;
  /** cross-diagram identity: nodes sharing a key merge into one entity when
   * diagrams are composed via includes; inert otherwise */
  key?: string;
  /** URL or path (relative to the declaring source) of another diagram whose
   * content this node contains after compile-time expansion */
  include?: string;
  /** which of the included diagram's planes supplies the grafted structure
   * (default: its default plane); meaningful only beside `include` */
  includePlane?: string;
  /** carry the included diagram's planes over — namespaced, notations intact —
   * so its content stays viewable in its own visual language; opt-in */
  includePlanes?: boolean;
  /** accent color (border/background tint); overrides the type registry look */
  color?: string;
  /** label text color; overrides the default (which follows `color` for C4/shape
   * nodes). Independent of `color` so text can differ from the shape/border. */
  textColor?: string;
  /** implementation technology shown in the type subtitle, e.g. "Java/Spring"
   * renders `[Container: Java/Spring]`; meaningful in any notation */
  technology?: string;
  /** STRIDE findings against this node (see Threat) */
  threats?: Threat[];
  /** remarks shown in the element's bubble (see Comment) */
  comments?: Comment[];
  /** resources listed in the element's bubble (see Link) */
  links?: Link[];
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

export const EDGE_LABEL_SIDES = ['top', 'bottom', 'center'] as const;
export type EdgeLabelSide = (typeof EDGE_LABEL_SIDES)[number];
/** a positioned text label on a connector; a relation may carry several */
export interface EdgeLabel {
  id: string;
  text: string;
  /** position along the edge, 0..1 (default 0.5) */
  t?: number;
  /** perpendicular alignment relative to the line (default 'center') */
  side?: EdgeLabelSide;
}

export const STRIDE = ['S', 'T', 'R', 'I', 'D', 'E'] as const;
export type StrideCategory = (typeof STRIDE)[number];
export const THREAT_STATUSES = ['open', 'mitigated', 'accepted', 'not-applicable'] as const;
export type ThreatStatus = (typeof THREAT_STATUSES)[number];
export const THREAT_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type ThreatSeverity = (typeof THREAT_SEVERITIES)[number];

/** One STRIDE finding against the element that carries it. Threats live ON
 * the node or relation (not in a model-wide list) so they follow it through
 * delete, undo, `include` namespacing and eject without any cascade code;
 * the register is derived (see threat-model.ts). */
export interface Threat {
  /** unique within its element's list (`t1`, `t2`, … when synthesized) */
  id: string;
  category: StrideCategory;
  title: string;
  description?: string;
  /** unset = unrated */
  severity?: ThreatSeverity;
  /** unset = 'open' */
  status?: ThreatStatus;
  mitigation?: string;
}

/** A remark on an element: what was said, by whom, when. Generic like
 * `threats` — any node or relation in any notation can carry a list. Shown in
 * the element's bubble on the canvas; never affects layout. */
export interface Comment {
  /** unique within its element's list (`c1`, `c2`, … when synthesized) */
  id: string;
  text: string;
  /** author, free text */
  by?: string;
  /** `YYYY-MM-DD` */
  at?: string;
}

/** A resource an element points at, beyond the single navigation `link`: a
 * ticket, a design doc, a repo. Listed in the element's bubble. */
export interface Link {
  label: string;
  url: string;
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
  /** STRIDE findings against this flow (see Threat) */
  threats?: Threat[];
  /** remarks shown in the relation's bubble (see Comment) */
  comments?: Comment[];
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

/** `marks` is what is neither a node type nor a line kind: a threat badge, a table's
 * key and foreign-key column tags. */
export const LEGEND_SECTIONS = ['layers', 'kinds', 'types', 'marks'] as const;
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
  /** derived sections to include, exactly. Absent = `layers`, `kinds`, `marks`, plus the
   * element shapes that carry no words of their own on the canvas (a start dot, a DFD
   * process); every other element waits for an explicit `types`. */
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
  /** visual language for the whole diagram (travels with the file); a plane's
   * own `notation` wins where one is declared. Unlike `style`, unknown ids are
   * rejected at validation (`unknown-notation`) — a closed vocabulary the
   * renderer keys a `Record` on, not an open preset id */
  notation?: string;
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
  /** elk.direction for layered — 'DOWN' | 'RIGHT' | 'LEFT' | 'UP'. Absent ⇒
   * `defaultLayoutDirection(model)`: down, or right where activity frames are drawn. */
  direction?: string;
  /** base node-node spacing in px; between-layers spacing is derived from it */
  spacing?: number;
  /** how routed edges are DRAWN. Both follow the layout's own waypoints (which
   * is what keeps a line off the boxes it was steered around): 'curved'
   * (default) rounds the bends generously, 'orthogonal' keeps them tight. An
   * edge whose endpoint was moved by hand floats as a bezier either way. */
  edgeRouting?: 'curved' | 'orthogonal';
  /** layered only: target width÷height. When set, elk wraps long chains onto
   * several rows (`elk.layered.wrapping.strategy = MULTI_EDGE`) aiming at this
   * ratio. Absent = no wrapping (one unbounded row/column, the default). */
  aspectRatio?: number;
}

/** Editor-managed node positions, keyed by resolved containment plane. */
/** a label's place along its edge: `t` 0..1 from the source, and which side of
 * the line it sits on (absent ⇒ centred on it) */
export interface EdgeLabelPlacement {
  t: number;
  side?: EdgeLabelSide;
}

/** a threat bubble's saved state — see LayoutOverlay.notes. `open` is only
 * ever `true`: "closed" is spelled by omitting it, as `manual` spells
 * "automatic", so there is one way to write each state. */
export interface NotePlacement {
  dx: number;
  dy: number;
  open?: true;
}

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
  /** the containers each plane OPENS with unfolded, keyed like `planes` (via
   * layoutPlaneKey). Saved together with the positions, because a hand-placed
   * interior only means something while its container is open: without this a
   * saved arrangement reopens fully folded and has to be unfolded by hand to be
   * seen again. A starting point, not a lock — the reader folds and unfolds
   * freely from there. Absent ⇒ the plane rests fully folded. Ignored by the
   * PNG export, which unfolds everything (see `export.collapsed`). */
  unfolded?: Record<string, string[]>;
  /** where a VIEWER slid an edge label (Alt+drag in view mode), keyed like
   * `planes`, then by relation id, then by label id (`legacy` for a relation's
   * plain `label`). Overrides the label's own `t`/`side` on that plane. It
   * lives here rather than on the relation for the same reason positions do:
   * it is "where I put it in this picture", and a generated diagram has no
   * model file the studio may write. Editing a label's position in the model
   * drops the entry (see applyCommand), so the document never loses to it. */
  edgeLabels?: Record<string, Record<string, Record<string, EdgeLabelPlacement>>>;
  /** one threat bubble's state in this picture: where it was dragged (an offset
   * from its automatic anchor beside the element) and whether it is open.
   * Absent entry = automatic spot, closed. The threat text itself stays on the
   * element; this is only "how I left the bubble in this picture", the
   * `edgeLabels` reasoning. Keyed like `planes`, then by `threatTargetKey`. */
  notes?: Record<string, Record<string, NotePlacement>>;
  /** how the PNG export should differ from the interactive page. Ignored by the
   * interactive page, which opens as `unfolded` says and lets the reader
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

/** One freehand stroke from the studio's pen. Coordinates are ABSOLUTE flow
 * coordinates at the top level of the diagram (never drilled): a stroke is an
 * overlay on the canvas, not a property of a node, so a re-layout can slide
 * boxes out from under it — the accepted trade for "draw anywhere". */
export interface Stroke {
  id: string;
  /** flat `[x0, y0, x1, y1, …]`, integer-rounded at capture; length ≥ 2 and even.
   * A single point is a tap, drawn as a dot by round caps. */
  points: number[];
  /** any CSS color; absent → the theme's ink token (`--dg-ink`) */
  color?: string;
  /** flow px; absent → DEFAULT_STROKE_WIDTH */
  width?: number;
}

/** `<name>.drawings.json` — the second thing kept out of the model, in its own
 * file rather than the layout overlay so a box nudge and a scribble never land
 * in one hunk (see .claude/specs/2026-08-23-drawings-sidecar-design.md).
 * Keyed exactly like `LayoutOverlay.planes` (layoutPlaneKey). */
export interface Drawings {
  version: 1;
  planes: Record<string, Stroke[]>;
}

/** Pen width when a stroke names none. In core so editor and renderer cannot drift. */
export const DEFAULT_STROKE_WIDTH = 3;

export const BUILTIN_NOTATIONS = ['causal-loop', 'git-graph', 'c4', 'second-order', 'fishbone', 'threat-model'] as const;
export type NotationId = (typeof BUILTIN_NOTATIONS)[number];
export type Polarity = '+' | '-';
