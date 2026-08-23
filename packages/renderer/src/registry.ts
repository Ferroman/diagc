export type ShapeId = 'box' | 'cylinder' | 'pill' | 'hexagon' | 'table' | 'bubble' | 'circle' | 'rounded' | 'diamond' | 'bar' | 'start-dot' | 'end-bullseye' | 'send-signal' | 'receive-signal' | 'note';

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
  // ---- Activity diagram (UML) ------------------------------------------------
  // Shapes `box` used by frame/lane/region are never drawn — they render as
  // chrome branches in DiagramNode, but TypeStyle.shape is required.
  'activity-frame': { shape: 'box', alwaysExpanded: true },
  'activity-lane': { shape: 'box', alwaysExpanded: true },
  'activity-region': { shape: 'box', dashed: true, alwaysExpanded: true },
  'activity-action': { shape: 'rounded' },
  'activity-decision': { shape: 'diamond', defaultSize: { width: 48, height: 48 } },
  'activity-bar': { shape: 'bar', defaultSize: { width: 8, height: 100 } },
  'activity-start': { shape: 'start-dot', defaultSize: { width: 24, height: 24 } },
  'activity-end': { shape: 'end-bullseye', defaultSize: { width: 28, height: 28 } },
  'activity-send': { shape: 'send-signal', defaultSize: { width: 140, height: 44 } },
  'activity-receive': { shape: 'receive-signal', defaultSize: { width: 140, height: 44 } },
  'activity-object': { shape: 'box' },
  'activity-note': { shape: 'note', defaultSize: { width: 140, height: 64 } },
};

export const DEFAULT_KIND_STYLES: Record<string, KindStyle> = {
  sync: {},
  async: { dashed: true },
  reads: {},
  writes: { width: 2.5 },
  'hosted-on': { dashed: true },
  flow: { animated: true },
  mixed: { width: 2.5 },
  fk: { startMarker: 'crowsfoot', endMarker: 'one' },
  // ---- Activity diagram (UML) ------------------------------------------------
  control: {},
  'object-flow': { dashed: true },
  interrupt: { zigzag: true },
  'note-link': { dashed: true, endMarker: 'none' },
};

function createRegistry<T>(defaults: Record<string, T>, fallback: T, overrides?: Record<string, T>): Registry<T> {
  const entries = new Map(Object.entries({ ...defaults, ...overrides }));
  return {
    resolve: (id) => entries.get(id) ?? fallback,
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
