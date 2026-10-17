import {
  GIT_NOTATION,
  GIT_STAGE_TYPE,
  isActivityChrome,
  isPlanRole,
  type DiagramNode,
  type NotationId,
  type ViewEdge,
} from '@diagc/core/internal';

// How each node type and relation kind looks in text. The renderer's registry is the
// authority (packages/renderer/src/registry.ts), but the CLI cannot import it, so the
// part a terminal can draw — shape, subtitle, dashes, folding — is written out here
// and vocabulary.test.ts holds the two tables to each other.

/** The shapes a terminal can tell apart. */
export type TextShape = 'box' | 'rounded' | 'cylinder' | 'hexagon' | 'diamond' | 'dot' | 'bar' | 'note' | 'table';

export interface TypeLook {
  shape: TextShape;
  /** the subtitle in place of the raw type id; `''` prints none (the renderer's `label`) */
  label?: string;
  dashed?: boolean;
  /** a container of this type is always drawn open (the renderer's `alwaysExpanded`) */
  neverFolds?: boolean;
  /** the border colour a notation gives the type (C4's blues) */
  accent?: string;
  /** what a legend calls the type (the renderer's `legendLabel`): set only on a shape
   * that says nothing about itself, which a legend keys without being asked */
  legend?: string;
}

export type LineStyle = 'solid' | 'dashed' | 'heavy';
export type EndMark = 'arrow' | 'none' | 'dot' | 'square' | 'diamond' | 'many' | 'one';

export interface KindLook {
  line: LineStyle;
  end: EndMark;
  start?: EndMark;
  /** what a legend calls the kind, as `TypeLook.legend` */
  legend?: string;
}

const box = (label?: string, extra: Partial<TypeLook> = {}): TypeLook => ({
  shape: 'box',
  ...(label !== undefined ? { label } : {}),
  ...extra,
});
const shaped = (shape: TextShape, label?: string, extra: Partial<TypeLook> = {}): TypeLook => ({
  shape,
  ...(label !== undefined ? { label } : {}),
  ...extra,
});
const dashed = { dashed: true } as const;
const open = { neverFolds: true } as const;

/** One entry per type the renderer styles, in its order. */
export const TYPE_LOOKS: Readonly<Record<string, TypeLook>> = {
  system: box(undefined, dashed),
  platform: box(undefined, dashed),
  service: box(),
  database: shaped('cylinder'),
  'aws-rds': shaped('cylinder'),
  table: shaped('cylinder'),
  'db-table': shaped('table'),
  queue: shaped('rounded'),
  infra: shaped('hexagon'),
  person: shaped('rounded'),
  team: shaped('rounded'),
  comment: shaped('rounded'),
  'c4-person': box('[Person]'),
  'c4-person-external': box('[Person]'),
  'c4-system': box('[Software System]'),
  'c4-system-external': box('[Software System]'),
  'c4-enterprise-boundary': box('[Enterprise]', dashed),
  'c4-system-boundary': box('[System]', dashed),
  'c4-group': box('[Group]', dashed),
  'c4-container': box('[Container]'),
  'c4-container-external': box('[Container]'),
  'c4-container-web': box('[Container]'),
  'c4-container-spa': box('[Container]'),
  'c4-container-mobile': box('[Container]'),
  'c4-container-desktop': box('[Container]'),
  'c4-container-api': box('[Container]'),
  'c4-container-function': box('[Container]'),
  'c4-container-cli': box('[Container]'),
  'c4-container-db': shaped('cylinder', '[Container]'),
  'c4-container-blob': shaped('cylinder', '[Container]'),
  'c4-container-search': shaped('cylinder', '[Container]'),
  'c4-container-queue': shaped('rounded', '[Container]'),
  'c4-container-boundary': box('[Container]', dashed),
  'c4-component': box('[Component]'),
  'c4-component-external': box('[Component]'),
  'c4-component-db': shaped('cylinder', '[Component]'),
  'c4-component-queue': shaped('rounded', '[Component]'),
  'c4-deployment-node': box('[Deployment Node]', dashed),
  'c4-infrastructure-node': shaped('hexagon', '[Infrastructure Node]'),
  'c4-container-instance': box('[Container Instance]'),
  'c4-class': box('[Class]'),
  'c4-interface': box('[Interface]', dashed),
  'c4-enum': box('[Enumeration]'),
  'aws-group': box(''),
  'aws-account': box(''),
  'aws-cloud': box(''),
  'aws-vpc': box(''),
  'aws-region': box('', dashed),
  'aws-auto-scaling-group': box('', dashed),
  'aws-az': box('', dashed),
  'aws-subnet-public': box(''),
  'aws-subnet-private': box(''),
  'activity-frame': box(undefined, open),
  'activity-lane': box(undefined, open),
  'activity-region': box(undefined, { ...dashed, ...open, legend: 'Interruptible region' }),
  'activity-action': shaped('rounded', '', { legend: 'Action' }),
  'activity-decision': shaped('diamond', '', { legend: 'Decision / merge' }),
  'activity-bar': shaped('bar', '', { legend: 'Fork / join' }),
  'activity-start': shaped('dot', '', { legend: 'Start' }),
  'activity-end': shaped('dot', '', { legend: 'End' }),
  'activity-send': box('', { legend: 'Send signal' }),
  'activity-receive': box('', { legend: 'Receive signal' }),
  'activity-object': box('', { legend: 'Object' }),
  'activity-note': shaped('note', ''),
  'so-decision': shaped('rounded', ''),
  'so-consequence-positive': shaped('rounded', ''),
  'so-consequence-negative': shaped('rounded', ''),
  'so-consequence-neutral': shaped('rounded', ''),
  'fb-effect': box(''),
  'fb-category': box(''),
  'fb-cause': box(''),
  'deploy-environment': box('[Environment]', { legend: 'Environment' }),
  'deploy-region': box('[Region]', { legend: 'Region' }),
  'deploy-zone': box('[Availability zone]', { ...dashed, legend: 'Availability zone' }),
  'deploy-network': box('[Network]', { legend: 'Network' }),
  'deploy-subnet-public': box('[Public subnet]', { legend: 'Public subnet' }),
  'deploy-subnet-private': box('[Private subnet]', { legend: 'Private subnet' }),
  'deploy-cluster': box('[Cluster]', { ...dashed, legend: 'Cluster' }),
  'deploy-host': box('[Host]'),
  'deploy-service': shaped('rounded', '[Service]'),
  'deploy-database': shaped('cylinder', '[Database]'),
  'deploy-queue': shaped('rounded', '[Queue]'),
  'deploy-storage': shaped('cylinder', '[Storage]'),
  'deploy-load-balancer': shaped('hexagon', '[Load balancer]'),
  'deploy-gateway': shaped('hexagon', '[Gateway]'),
  'deploy-firewall': box('[Firewall]'),
  'deploy-internet': shaped('rounded', '[External network]', dashed),
  'tm-entity': box('', { legend: 'External entity' }),
  'tm-process': shaped('rounded', '', { legend: 'Process' }),
  'tm-store': shaped('cylinder', '', { legend: 'Data store' }),
  'tm-boundary': box('', { ...dashed, ...open, legend: 'Trust boundary' }),
  'plan-zone': shaped('rounded', '', { legend: 'Zone' }),
  'plan-event': shaped('diamond', '', { legend: 'Event' }),
};

const solid: KindLook = { line: 'solid', end: 'arrow' };

/** One entry per kind the renderer styles, in its order. */
export const KIND_LOOKS: Readonly<Record<string, KindLook>> = {
  sync: solid,
  async: { line: 'dashed', end: 'arrow' },
  reads: solid,
  writes: { line: 'heavy', end: 'arrow' },
  'hosted-on': { line: 'dashed', end: 'arrow' },
  flow: solid,
  mixed: { line: 'heavy', end: 'arrow' },
  fk: { line: 'solid', end: 'one', start: 'many', legend: 'Foreign key: many to one' },
  control: { ...solid, legend: 'Control flow' },
  'object-flow': { line: 'dashed', end: 'arrow', legend: 'Object flow' },
  interrupt: { ...solid, legend: 'Interrupt' },
  'note-link': { line: 'dashed', end: 'none', legend: 'Note link' },
  influence: solid,
  network: solid,
  'leads-to': solid,
  'cause-of': solid,
  'data-flow': { ...solid, legend: 'Data flow' },
  owns: { ...solid, legend: 'Owns' },
  executes: { ...solid, legend: 'Executes' },
  checks: { ...solid, legend: 'Checks' },
};

// What a notation's profile changes (packages/renderer/src/notations.ts). Not pinned
// by the test: the profiles are code, not tables, and these are the few looks a
// terminal can show — C4's person shape and colours, deployment's solid node, git's
// round commits and headless dashed links.
const C4_COLOURS: Record<string, string> = {
  'c4-person': '#08427b',
  'c4-person-external': '#999999',
  'c4-system': '#1168bd',
  'c4-system-external': '#999999',
  'c4-container-external': '#999999',
  'c4-component': '#85bbf0',
  'c4-component-db': '#85bbf0',
  'c4-component-queue': '#85bbf0',
  'c4-component-external': '#999999',
  ...Object.fromEntries(
    ['', '-web', '-spa', '-mobile', '-desktop', '-api', '-function', '-cli', '-db', '-blob', '-search', '-queue'].map(
      (suffix) => [`c4-container${suffix}`, '#438dd5'],
    ),
  ),
};

const NOTATION_TYPES: Partial<Record<NotationId, Record<string, TypeLook>>> = {
  c4: Object.fromEntries(
    Object.entries(C4_COLOURS).map(([type, accent]) => [
      type,
      { ...TYPE_LOOKS[type]!, accent, ...(type.startsWith('c4-person') ? { shape: 'rounded' as const } : {}) },
    ]),
  ),
  deployment: { 'c4-deployment-node': box('[Deployment Node]') },
  // a commit is a dot and a branch a lane in the browser: neither prints its type
  [GIT_NOTATION]: { commit: shaped('dot', ''), branch: box('', open), [GIT_STAGE_TYPE]: box('') },
  plan: { 'plan-zone': { ...TYPE_LOOKS['plan-zone']!, ...open } },
};

const NOTATION_KINDS: Partial<Record<NotationId, Record<string, KindLook>>> = {
  [GIT_NOTATION]: {
    commit: { line: 'dashed', end: 'none' },
    branch: { line: 'dashed', end: 'none' },
    merge: { line: 'dashed', end: 'none' },
  },
};

export function typeLook(type: string | undefined, notation: NotationId | undefined): TypeLook {
  if (type === undefined) return { shape: 'box' };
  const own = notation !== undefined ? NOTATION_TYPES[notation]?.[type] : undefined;
  return own ?? TYPE_LOOKS[type] ?? { shape: 'box' };
}

export function kindLook(edge: Pick<ViewEdge, 'kind' | 'style'>, notation: NotationId | undefined): KindLook {
  const own = notation !== undefined ? NOTATION_KINDS[notation]?.[edge.kind] : undefined;
  const base = own ?? KIND_LOOKS[edge.kind] ?? solid;
  const style = edge.style;
  if (style === undefined) return base;
  const line: LineStyle =
    style.line === 'dashed' || style.line === 'dotted'
      ? 'dashed'
      : (style.width ?? 0) >= 2.5
        ? 'heavy'
        : style.line === 'solid'
          ? 'solid'
          : base.line;
  return { ...base, line, ...(style.end !== undefined ? { end: style.end } : {}) };
}

/** Kinds a notation never draws as lines: a plan's roles become chips on the zone. */
export function hidesKind(kind: string, notation: NotationId | undefined): boolean {
  return notation === 'plan' && isPlanRole(kind);
}

/** The renderer's `typeSubtitle`: `[Container]` + `Java` → `[Container: Java]`. An
 * empty label stays empty, so a glyph type's technology cannot resurrect it. */
function typeSubtitle(label: string, technology?: string): string {
  if (technology === undefined || label === '') return label;
  return label.endsWith(']') ? `${label.slice(0, -1)}: ${technology}]` : `${label}: ${technology}`;
}

/** The subtitle a box prints under its name, as the renderer prints it: the type's
 * label, or the raw type id for a type without one; `''` for none. */
export function subtitleOf(node: DiagramNode, notation: NotationId | undefined): string {
  // The activity frame, lanes and regions are drawn as bodies of their own, which
  // print the name alone; their registry entries carry no label only because they
  // are never drawn as a plain box.
  if (node.type === undefined || isActivityChrome(node.type)) return '';
  return typeSubtitle(typeLook(node.type, notation).label ?? node.type, node.technology);
}

export function neverFolds(node: DiagramNode, notation: NotationId | undefined): boolean {
  return typeLook(node.type, notation).neverFolds === true;
}
