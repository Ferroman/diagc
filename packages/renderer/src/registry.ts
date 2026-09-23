import { PLAN_LAYOUT } from './plan-layout';

export type ShapeId = 'box' | 'cylinder' | 'pill' | 'hexagon' | 'person' | 'table' | 'bubble' | 'circle' | 'rounded' | 'diamond' | 'bar' | 'start-dot' | 'end-bullseye' | 'send-signal' | 'receive-signal' | 'note' | 'ellipse' | 'store';

export interface TypeStyle {
  shape: ShapeId;
  icon?: string;
  dashed?: boolean;
  /** display subtitle shown in place of the raw type id (e.g. C4 '[Software System]') */
  label?: string;
  /** C4-style outline: colored border + colored text over the default fill
   * (instead of the subtle tint), matching the standard C4 stencil */
  outline?: boolean;
  /** containers of this type never fold under semantic zoom (a lane is a band,
   * not a box with an inside); DiagramView pins them expanded alongside the
   * notation profile's node.alwaysExpanded hook */
  alwaysExpanded?: boolean;
  /** default leaf w/h when neither the model nor the layout overlay sizes the
   * node — how fixed-geometry glyphs (dots, bars, diamonds) get real footprints
   * from the DSL, where no palette template runs */
  defaultSize?: { width: number; height: number };
  /** expanded containers of this type draw their `image` as a square badge
   * flush in the top-left corner (the AWS group convention) instead of the
   * padded header thumbnail; leaves keep the typed-box look rather than the
   * image-body rendering, so a freshly placed group reads as a box */
  cornerBadge?: boolean;
  /** solid body fill (authentic-notation looks, e.g. C4 blue); an explicit
   * node color / model typeColors entry still wins */
  fill?: string;
  /** text color legible on `fill`; ignored without it */
  textOn?: string;
  /** what a legend calls this type. Set only on shapes that say nothing about what they
   * are on the canvas (a start dot, a DFD process — never a box that prints its own
   * subtitle): such a type is keyed without being asked for, and drawing one is what
   * offers a legend on a diagram that declared none. */
  legendLabel?: string;
}

export interface KindStyle {
  dashed?: boolean;
  animated?: boolean;
  width?: number;
  /** marker name (see DiagramEdge END_SHAPES) at the source end; e.g. 'crowsfoot' */
  startMarker?: string;
  /** marker name at the target end; overrides the default 'arrow' */
  endMarker?: string;
  /** draw a lightning-bolt jog at the path midpoint (UML interrupt flow) */
  zigzag?: boolean;
  /** what a legend calls this kind — see {@link TypeStyle.legendLabel}; the line's ends
   * and dashes are its whole meaning, and the raw id explains neither */
  legendLabel?: string;
}

export interface Registry<T> {
  resolve(id: string): T;
  register(id: string, style: T): void;
}

export const DEFAULT_TYPE_STYLES: Record<string, TypeStyle> = {
  system: { shape: 'box', dashed: true },
  platform: { shape: 'box', dashed: true },
  service: { shape: 'box', icon: 'service' },
  database: { shape: 'cylinder', icon: 'database' },
  'aws-rds': { shape: 'cylinder', icon: 'cloud' },
  table: { shape: 'cylinder', icon: 'table' },
  'db-table': { shape: 'table' },
  queue: { shape: 'pill', icon: 'queue' },
  infra: { shape: 'hexagon', icon: 'server' },
  person: { shape: 'pill', icon: 'user' },
  // A speech bubble for remarks about the diagram: an ordinary node (wire it up
  // with normal relations) that merely looks like an aside, not a component.
  comment: { shape: 'bubble', icon: 'comment' },
  // ---- C4 (https://c4model.com) -------------------------------------------
  // Every level's element plus its `external` twin (same stencil, grey accent
  // supplied by the library entry). Boundaries are dashed so they read as
  // context rather than as a deployable thing, both as a leaf and once they
  // contain children (DiagramNode applies `dashed` to expanded groups too).
  'c4-person': { shape: 'box', label: '[Person]' },
  'c4-person-external': { shape: 'box', label: '[Person]' },
  'c4-system': { shape: 'box', label: '[Software System]', outline: true },
  'c4-system-external': { shape: 'box', label: '[Software System]', outline: true },
  'c4-enterprise-boundary': { shape: 'box', label: '[Enterprise]', outline: true, dashed: true },
  'c4-system-boundary': { shape: 'box', label: '[System]', outline: true, dashed: true },
  'c4-group': { shape: 'box', label: '[Group]', outline: true, dashed: true },
  'c4-container': { shape: 'box', label: '[Container]', outline: true },
  'c4-container-external': { shape: 'box', label: '[Container]', outline: true },
  'c4-container-web': { shape: 'box', label: '[Container]', icon: 'browser', outline: true },
  'c4-container-spa': { shape: 'box', label: '[Container]', icon: 'spa', outline: true },
  'c4-container-mobile': { shape: 'box', label: '[Container]', icon: 'mobile', outline: true },
  'c4-container-desktop': { shape: 'box', label: '[Container]', icon: 'desktop', outline: true },
  'c4-container-api': { shape: 'box', label: '[Container]', icon: 'api', outline: true },
  'c4-container-function': { shape: 'box', label: '[Container]', icon: 'function', outline: true },
  'c4-container-cli': { shape: 'box', label: '[Container]', icon: 'cli', outline: true },
  'c4-container-db': { shape: 'cylinder', label: '[Container]', icon: 'database', outline: true },
  'c4-container-blob': { shape: 'cylinder', label: '[Container]', icon: 'blob', outline: true },
  'c4-container-search': { shape: 'cylinder', label: '[Container]', icon: 'search', outline: true },
  'c4-container-queue': { shape: 'pill', label: '[Container]', icon: 'queue', outline: true },
  'c4-container-boundary': { shape: 'box', label: '[Container]', outline: true, dashed: true },
  'c4-component': { shape: 'box', label: '[Component]', outline: true },
  'c4-component-external': { shape: 'box', label: '[Component]', outline: true },
  'c4-component-db': { shape: 'cylinder', label: '[Component]', icon: 'database', outline: true },
  'c4-component-queue': { shape: 'pill', label: '[Component]', icon: 'queue', outline: true },
  'c4-deployment-node': { shape: 'box', label: '[Deployment Node]', outline: true, dashed: true },
  'c4-infrastructure-node': { shape: 'hexagon', label: '[Infrastructure Node]', icon: 'node', outline: true },
  'c4-container-instance': { shape: 'box', label: '[Container Instance]', icon: 'instance', outline: true },
  'c4-class': { shape: 'box', label: '[Class]', icon: 'class', outline: true },
  'c4-interface': { shape: 'box', label: '[Interface]', icon: 'interface', outline: true, dashed: true },
  'c4-enum': { shape: 'box', label: '[Enumeration]', icon: 'class', outline: true },
  // ---- AWS infrastructure groups (https://aws.amazon.com/architecture/icons/)
  // The registry carries the stencil's structure — line style, no-tint outline,
  // corner badge; the badge image and authentic accent color come from the
  // library entries (palette sampled from the official group icons themselves).
  // Empty labels: these are boundaries, a type subtitle would read as content.
  'aws-group': { shape: 'box', outline: true, cornerBadge: true, label: '' },
  'aws-account': { shape: 'box', outline: true, cornerBadge: true, label: '' },
  'aws-cloud': { shape: 'box', outline: true, cornerBadge: true, label: '' },
  'aws-vpc': { shape: 'box', outline: true, cornerBadge: true, label: '' },
  'aws-region': { shape: 'box', outline: true, cornerBadge: true, dashed: true, label: '' },
  'aws-auto-scaling-group': { shape: 'box', outline: true, cornerBadge: true, dashed: true, label: '' },
  'aws-az': { shape: 'box', outline: true, dashed: true, label: '' },
  'aws-subnet-public': { shape: 'box', cornerBadge: true, label: '' },
  'aws-subnet-private': { shape: 'box', cornerBadge: true, label: '' },
  // ---- Activity diagram (UML) ------------------------------------------------
  // Shapes `box` used by frame/lane/region are never drawn — they render as
  // chrome branches in DiagramNode, but TypeStyle.shape is required.
  'activity-frame': { shape: 'box', alwaysExpanded: true },
  'activity-lane': { shape: 'box', alwaysExpanded: true },
  'activity-region': { shape: 'box', dashed: true, alwaysExpanded: true, legendLabel: 'Interruptible region' },
  // UML glyphs carry no type subtitle; an empty label suppresses the `.dg-type` fallback.
  // The frame, a lane and a note get no `legendLabel`: each already says what it is.
  'activity-action': { shape: 'rounded', label: '', legendLabel: 'Action' },
  'activity-decision': { shape: 'diamond', defaultSize: { width: 48, height: 48 }, label: '', legendLabel: 'Decision / merge' },
  'activity-bar': { shape: 'bar', defaultSize: { width: 8, height: 100 }, label: '', legendLabel: 'Fork / join' },
  'activity-start': { shape: 'start-dot', defaultSize: { width: 24, height: 24 }, label: '', legendLabel: 'Start' },
  'activity-end': { shape: 'end-bullseye', defaultSize: { width: 28, height: 28 }, label: '', legendLabel: 'End' },
  'activity-send': { shape: 'send-signal', defaultSize: { width: 140, height: 44 }, label: '', legendLabel: 'Send signal' },
  'activity-receive': { shape: 'receive-signal', defaultSize: { width: 140, height: 44 }, label: '', legendLabel: 'Receive signal' },
  'activity-object': { shape: 'box', label: '', legendLabel: 'Object' },
  'activity-note': { shape: 'note', defaultSize: { width: 140, height: 64 }, label: '' },
  // ---- Second-order thinking -------------------------------------------------
  // The decision is the solid root (theme tokens, so it inverts with the theme);
  // a consequence's tint comes from the notation profile's colorOf, by valence.
  'so-decision': { shape: 'rounded', icon: 'decision', label: '', fill: 'var(--dg-text)', textOn: 'var(--dg-surface)' },
  'so-consequence-positive': { shape: 'rounded', icon: 'plus', label: '' },
  'so-consequence-negative': { shape: 'rounded', icon: 'minus', label: '' },
  'so-consequence-neutral': { shape: 'rounded', icon: 'dot', label: '' },
  // ---- Fishbone (Ishikawa) ----------------------------------------------------
  // The head and a cause have their own looks (DiagramNode's fb branches +
  // styles.css); a category is the plain box in its bone colour, which arrives
  // through the notation profile's colorOf. `label: ''` keeps the raw type id
  // off the box.
  'fb-effect': { shape: 'box', label: '' },
  'fb-category': { shape: 'box', label: '' },
  'fb-cause': { shape: 'box', label: '' },
  // ---- Threat model (STRIDE data flow) ----------------------------------------
  // The shape is the type, as in every DFD, so no `[Process]` subtitle. A
  // boundary keeps the dashed outline look; its red arrives through the
  // notation profile's colorOf, not here, so an author's own colour still wins.
  // `alwaysExpanded` on the boundary for the same reason an activity frame and a
  // git lane carry it: a trust boundary is a line drawn AROUND things, never a
  // drill level. Folded it would re-anchor every crossing flow to the boundary
  // box and hide the very elements those crossings are about — the picture would
  // lose the thing it exists to show. DiagramView folds registry `alwaysExpanded`
  // into `effectivePins` and blocks drilling into it.
  'tm-entity': { shape: 'box', label: '', legendLabel: 'External entity' },
  'tm-process': { shape: 'ellipse', label: '', defaultSize: { width: 150, height: 90 }, legendLabel: 'Process' },
  'tm-store': { shape: 'store', label: '', defaultSize: { width: 150, height: 56 }, legendLabel: 'Data store' },
  'tm-boundary': { shape: 'box', label: '', outline: true, dashed: true, alwaysExpanded: true, legendLabel: 'Trust boundary' },
  // ---- Plan (schedule): a zone is a date-spanned container (the plan layout sizes
  // it; the studio's left/right handles resize it into dates), an event a
  // point marker whose name is drawn beside it.
  'plan-zone': { shape: 'rounded', label: '', legendLabel: 'Zone' },
  'plan-event': { shape: 'diamond', defaultSize: { width: PLAN_LAYOUT.EVENT, height: PLAN_LAYOUT.EVENT }, label: '', legendLabel: 'Event' },
};

export const DEFAULT_KIND_STYLES: Record<string, KindStyle> = {
  sync: {},
  async: { dashed: true },
  reads: {},
  writes: { width: 2.5 },
  'hosted-on': { dashed: true },
  flow: { animated: true },
  mixed: { width: 2.5 },
  fk: { startMarker: 'crowsfoot', endMarker: 'one', legendLabel: 'Foreign key: many to one' },
  // ---- Activity diagram (UML) ------------------------------------------------
  control: { legendLabel: 'Control flow' },
  'object-flow': { dashed: true, legendLabel: 'Object flow' },
  interrupt: { zigzag: true, legendLabel: 'Interrupt' },
  'note-link': { dashed: true, endMarker: 'none', legendLabel: 'Note link' },
  // ---- Second-order thinking -------------------------------------------------
  'leads-to': {},
  // ---- Fishbone (Ishikawa) ----------------------------------------------------
  'cause-of': {}, // solid, arrow end — the defaults
  // ---- Threat model (STRIDE data flow) ----------------------------------------
  'data-flow': { legendLabel: 'Data flow' }, // a plain arrow: the DFD's only line style
  // ---- Plan (schedule) --------------------------------------------------------
  // Roles, person → zone. Registered so the legend, the studio's kind picker
  // and validation know them; the plan profile never draws them as edges (they
  // become chips on the zone — see planBadges).
  owns: { legendLabel: 'Owns' },
  executes: { legendLabel: 'Executes' },
  checks: { legendLabel: 'Checks' },
};

function createRegistry<T>(defaults: Record<string, T>, fallback: T, overrides?: Record<string, T>): Registry<T> {
  const entries = new Map(Object.entries({ ...defaults, ...overrides }));
  // One shared fallback serves every unknown id, so freeze it: an accidental
  // mutation must throw where it happens, not restyle all unknown ids at once.
  const frozenFallback = Object.freeze({ ...fallback });
  return {
    resolve: (id) => entries.get(id) ?? frozenFallback,
    register: (id, style) => {
      entries.set(id, style);
    },
  };
}

export function createTypeRegistry(overrides?: Record<string, TypeStyle>): Registry<TypeStyle> {
  return createRegistry(DEFAULT_TYPE_STYLES, { shape: 'box' }, overrides);
}

export function createKindRegistry(overrides?: Record<string, KindStyle>): Registry<KindStyle> {
  return createRegistry(DEFAULT_KIND_STYLES, {}, overrides);
}
