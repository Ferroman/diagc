import type {
  Column,
  Comment,
  ContainmentEdge,
  DiagramLayer,
  DiagramLegend,
  DiagramModel,
  DiagramNode,
  DiagramPlane,
  DiagramRelation,
  EdgeLabel,
  FontScale,
  LayerRule,
  Link,
  NotationId,
  Polarity,
  RelationStyle,
  TextAlign,
  TextRun,
  Threat,
} from './types';
import { nextCommentId, type ElementTarget } from './comments';
import { FB_CATEGORY_TYPE, FB_CAUSE_OF_KIND, FB_CAUSE_TYPE, FB_EFFECT_TYPE, FISHBONE_PRESETS, presetId, type FishbonePreset } from './fishbone';
import { GIT_STAGE_TYPE } from './git';
import { SO_DECISION_TYPE, SO_LEADS_TO_KIND, consequenceTypeOf, type Valence } from './second-order';
import {
  TM_BOUNDARY_TYPE,
  TM_ENTITY_TYPE,
  TM_FLOW_KIND,
  TM_NOTATION,
  TM_PROCESS_TYPE,
  TM_STORE_TYPE,
  type ThreatTarget,
} from './threat-model';
import { DiagramValidationError, validate } from './validate';
import { PLAN_EVENT_TYPE, PLAN_NOTATION, PLAN_PERSON_TYPE, PLAN_TEAM_TYPE, PLAN_ZONE_TYPE, type PlanRole } from './plan';

export interface NodeOpts {
  type?: string;
  name?: string;
  icon?: string;
  /** silhouette-mask ref (see DiagramNode.shape) */
  shape?: string;
  /** image ref for image-typed nodes (see DiagramNode.image) */
  image?: string;
  /** fill/accent color (see DiagramNode.color) */
  color?: string;
  /** label color override (see DiagramNode.textColor) */
  textColor?: string;
  /** implementation technology (see DiagramNode.technology) */
  technology?: string;
  /** navigation target (see DiagramNode.link) */
  link?: string;
  description?: string;
  /** rich-text label runs (see DiagramNode.rich) */
  rich?: TextRun[];
  /** label alignment (see DiagramNode.textAlign) */
  textAlign?: TextAlign;
  /** label size step (see DiagramNode.fontScale) */
  fontScale?: FontScale;
  metadata?: Record<string, unknown>;
  /** cross-diagram identity (see DiagramNode.key) */
  key?: string;
  /** compose another diagram's content under this node (see DiagramNode.include) */
  include?: string;
  /** structure plane to graft from the include (see DiagramNode.includePlane) */
  includePlane?: string;
  /** carry the include's planes over (see DiagramNode.includePlanes) */
  includePlanes?: boolean;
  /** restrict this node to a single plane (see DiagramNode.plane) */
  plane?: string;
  /** transparent-sheet membership (see DiagramNode.layer) */
  layer?: string;
  /** ER-table rows (see DiagramNode.columns) */
  columns?: Column[];
  /** STRIDE findings (see DiagramNode.threats) */
  threats?: Threat[];
  /** remarks shown in this node's bubble (see DiagramNode.comments) */
  comments?: Comment[];
  /** resources this node points at, listed in its bubble (see DiagramNode.links) */
  links?: Link[];
}

export interface RelateOpts {
  kind: string;
  /** explicit relation id; when omitted the builder synthesizes `${from}->${to}#${n}`.
   * The pair counter advances either way, so a later un-id'd relation on the same
   * pair gets the same suffix it would have gotten without the override. */
  id?: string;
  label?: string;
  /** positioned edge labels (see DiagramRelation.labels) */
  labels?: EdgeLabel[];
  style?: RelationStyle;
  description?: string;
  layer?: string;
  polarity?: Polarity;
  delay?: boolean;
  /** FK column on the source table (see DiagramRelation.fromColumn) */
  fromColumn?: string;
  /** referenced column on the target table (see DiagramRelation.toColumn) */
  toColumn?: string;
  /** STRIDE findings (see DiagramRelation.threats) */
  threats?: Threat[];
  /** remarks shown in this relation's bubble (see DiagramRelation.comments) */
  comments?: Comment[];
}

/** A threat as authored: the id is synthesized (`t1`, `t2`, …) unless given. */
export type ThreatOpts = Omit<Threat, 'id'> & { id?: string };

/** A comment as authored: the id is synthesized (`c1`, `c2`, …) unless given. */
export interface CommentOpts {
  id?: string;
  by?: string;
  at?: string;
}

export interface ContainsOpts {
  /** plane the containment belongs to; defaults to the model's first-declared plane */
  plane?: string;
}

export class NodeRef {
  constructor(
    readonly id: string,
    private readonly builder: ModelBuilder,
  ) {}

  /** children, optionally followed by a trailing `{ plane }` options object */
  contains(...args: (NodeRef | ContainsOpts)[]): this {
    const last = args[args.length - 1];
    const opts = last !== undefined && !(last instanceof NodeRef) ? last : undefined;
    for (const child of args) {
      if (child instanceof NodeRef) this.builder.addContainment(this.id, child.id, opts?.plane);
    }
    return this;
  }

  /** A STRIDE finding against this element. On every node ref, not just the
   * threat-model ones: threat-modelling an existing C4 or ER diagram annotates
   * the nodes it already has. */
  threat(opts: ThreatOpts): this {
    this.builder.addThreat({ node: this.id }, opts);
    return this;
  }

  /** A remark on this element, shown in its bubble. */
  comment(text: string, opts: CommentOpts = {}): this {
    this.builder.addComment({ node: this.id }, text, opts);
    return this;
  }

  /** A resource this element points at, listed in its bubble. */
  link(label: string, url: string): this {
    this.builder.addLink(this.id, { label, url });
    return this;
  }
}

export interface CommitOpts {
  /** default `${branchId}-${n}`, n = this branch's 1-based commit count */
  id?: string;
  /** the label drawn above the circle; absent = untagged (name '') */
  tag?: string;
  /** start a new segment branched off this commit (on another branch) — no
   * `commit` link from the lane's previous commit */
  from?: CommitRef;
  /** empty columns to leave before this commit (`metadata.gap`) */
  gap?: number;
  color?: string;
}
export type MergeOpts = Omit<CommitOpts, 'from'>;

export class CommitRef extends NodeRef {
  constructor(
    id: string,
    builder: ModelBuilder,
    readonly branch: BranchRef,
  ) {
    super(id, builder);
  }
}

/** One lane of a git graph. `commit()` chains from the lane's last commit; `merge()`
 * adds a commit that absorbs another lane's. Both hand back CommitRefs, which are
 * NodeRefs — relate them, layer them, describe them like any node. */
export class BranchRef extends NodeRef {
  private count = 0;
  private latest: CommitRef | undefined;
  constructor(
    id: string,
    private readonly m: ModelBuilder,
  ) {
    super(id, m);
  }

  commit(tagOrOpts: string | CommitOpts = {}): CommitRef {
    const opts: CommitOpts = typeof tagOrOpts === 'string' ? { tag: tagOrOpts } : tagOrOpts;
    if (opts.from !== undefined && opts.from.branch === this) {
      throw new Error(`branch '${this.id}': use commit() to continue a lane — 'from' must name a commit on another branch`);
    }
    const prev = this.latest;
    const c = this.create(opts);
    if (opts.from !== undefined) this.m.relate(opts.from, c, { kind: 'branch' });
    else if (prev !== undefined) this.m.relate(prev, c, { kind: 'commit' });
    return c;
  }

  merge(src: CommitRef, opts: MergeOpts = {}): CommitRef {
    if (src.branch === this) throw new Error(`branch '${this.id}': cannot merge a lane into itself`);
    const prev = this.latest;
    const c = this.create(opts);
    this.m.relate(src, c, { kind: 'merge' });
    if (prev !== undefined) this.m.relate(prev, c, { kind: 'commit' });
    return c;
  }

  private create(opts: MergeOpts): CommitRef {
    this.count += 1;
    const id = opts.id ?? `${this.id}-${this.count}`;
    this.m.node(id, {
      type: 'commit',
      name: opts.tag ?? '',
      ...(opts.color !== undefined ? { color: opts.color } : {}),
      ...(opts.gap !== undefined && opts.gap > 0 ? { metadata: { gap: opts.gap } } : {}),
    });
    this.m.addContainment(this.id, id);
    const ref = new CommitRef(id, this.m, this);
    this.latest = ref;
    return ref;
  }
}

export interface StageOpts {
  /** the label drawn at the top of the frame; defaults to the id */
  name?: string;
  /** the commit whose column the frame starts at */
  from: CommitRef;
  /** the commit whose column it ends at (inclusive); defaults to `from` */
  to?: CommitRef;
  color?: string;
}

export class GitGraphBuilder {
  constructor(private readonly m: ModelBuilder) {}
  /** A named frame across every lane, spanning the columns of `from`…`to` —
   * a phase of the history ("Development", "Release candidates"). Declare it
   * after the commits it names. */
  stage(id: string, opts: StageOpts): NodeRef {
    return this.m.node(id, {
      type: GIT_STAGE_TYPE,
      ...(opts.name !== undefined ? { name: opts.name } : {}),
      ...(opts.color !== undefined ? { color: opts.color } : {}),
      metadata: { from: opts.from.id, ...(opts.to !== undefined ? { to: opts.to.id } : {}) },
    });
  }
  /** lanes are drawn top-to-bottom in the order they are declared */
  branch(id: string, opts: { name?: string; color?: string } = {}): BranchRef {
    this.m.node(id, {
      type: 'branch',
      ...(opts.name !== undefined ? { name: opts.name } : {}),
      ...(opts.color !== undefined ? { color: opts.color } : {}),
    });
    return new BranchRef(id, this.m);
  }
}

export interface ConsequenceOpts {
  /** good, bad or neutral (the default) — picks the node type */
  valence?: Valence;
  /** a label on the arrow that leads here */
  label?: string;
  description?: string;
  color?: string;
}

/** A decision or a consequence. `then()` IS the method of second-order
 * thinking — "and then what?" — so a chain of calls reads as the reasoning. */
export class ConsequenceRef extends NodeRef {
  constructor(
    id: string,
    private readonly m: ModelBuilder,
  ) {
    super(id, m);
  }

  /** what follows from this: a new consequence, and the arrow that leads to it */
  then(id: string, name?: string, opts: ConsequenceOpts = {}): ConsequenceRef {
    const { valence, label, ...rest } = opts;
    this.m.node(id, { type: consequenceTypeOf(valence ?? '0'), ...(name !== undefined ? { name } : {}), ...rest });
    const ref = new ConsequenceRef(id, this.m);
    this.leadsTo(ref, label !== undefined ? { label } : {});
    return ref;
  }

  /** join two branches: this also leads to a consequence declared elsewhere */
  leadsTo(to: NodeRef, opts: { label?: string } = {}): this {
    this.m.relate(this, to, { kind: SO_LEADS_TO_KIND, ...(opts.label !== undefined ? { label: opts.label } : {}) });
    return this;
  }
}

export class SecondOrderBuilder {
  constructor(private readonly m: ModelBuilder) {}
  /** the root of a tree; several decisions share one set of bands */
  decision(id: string, name?: string, opts: Omit<ConsequenceOpts, 'valence' | 'label'> = {}): ConsequenceRef {
    this.m.node(id, { type: SO_DECISION_TYPE, ...(name !== undefined ? { name } : {}), ...opts });
    return new ConsequenceRef(id, this.m);
  }
}

export interface FishboneOpts {
  description?: string;
  color?: string;
}

/** A cause (level 2) or a sub-cause (level 3). The level rides on the ref so a
 * fourth `.cause()` fails at build time, where the author is, rather than as a
 * validation issue at compile time. */
export class CauseRef extends NodeRef {
  constructor(
    id: string,
    private readonly m: ModelBuilder,
    private readonly level: 2 | 3,
  ) {
    super(id, m);
  }

  /** a sub-cause of this cause, and the arrow from it to here */
  cause(id: string, name?: string, opts: FishboneOpts = {}): CauseRef {
    if (this.level === 3) {
      throw new Error(`fishbone: '${id}' would be a fourth level below the effect; three levels (category, cause, sub-cause) is the limit`);
    }
    this.m.node(id, { type: FB_CAUSE_TYPE, ...(name !== undefined ? { name } : {}), ...opts });
    const ref = new CauseRef(id, this.m, 3);
    this.m.relate(ref, this, { kind: FB_CAUSE_OF_KIND });
    return ref;
  }
}

export class CategoryRef extends NodeRef {
  constructor(
    id: string,
    private readonly m: ModelBuilder,
  ) {
    super(id, m);
  }

  /** a cause on this bone, and the arrow from it to here */
  cause(id: string, name?: string, opts: FishboneOpts = {}): CauseRef {
    this.m.node(id, { type: FB_CAUSE_TYPE, ...(name !== undefined ? { name } : {}), ...opts });
    const ref = new CauseRef(id, this.m, 2);
    this.m.relate(ref, this, { kind: FB_CAUSE_OF_KIND });
    return ref;
  }
}

export class FishboneBuilder {
  constructor(
    private readonly m: ModelBuilder,
    private readonly effect: NodeRef,
  ) {}

  /** a major bone, and the arrow from it to the effect */
  category(id: string, name?: string, opts: FishboneOpts = {}): CategoryRef {
    this.m.node(id, { type: FB_CATEGORY_TYPE, ...(name !== undefined ? { name } : {}), ...opts });
    const ref = new CategoryRef(id, this.m);
    this.m.relate(ref, this.effect, { kind: FB_CAUSE_OF_KIND });
    return ref;
  }

  /** the bones of a standard set, keyed by their slug ids (`presetId`) */
  categories(preset: FishbonePreset): Record<string, CategoryRef> {
    return Object.fromEntries(
      FISHBONE_PRESETS[preset].map((name) => {
        const id = presetId(name);
        return [id, this.category(id, name)];
      }),
    );
  }
}

/** A data flow: a relation ref that takes threats and comments, the way a NodeRef does. */
export class FlowRef {
  constructor(
    readonly id: string,
    private readonly m: ModelBuilder,
  ) {}

  threat(opts: ThreatOpts): this {
    this.m.addThreat({ relation: this.id }, opts);
    return this;
  }

  /** A remark on this flow, shown in its bubble. */
  comment(text: string, opts: CommentOpts = {}): this {
    this.m.addComment({ relation: this.id }, text, opts);
    return this;
  }
}

/** A DFD element's node options, minus the two its helper already supplies:
 * `type` from the helper itself, `name` from its second argument. */
export type ElementOpts = Omit<NodeOpts, 'type' | 'name'>;

/** The four DFD element kinds plus flows. Everything it hands back is an
 * ordinary NodeRef/FlowRef, so the rest of the builder — contains, relate,
 * layers, threat — composes with it unchanged. */
export class ThreatModelBuilder {
  constructor(private readonly m: ModelBuilder) {}

  private element(type: string, id: string, name: string | undefined, opts: ElementOpts): NodeRef {
    return this.m.node(id, { type, ...(name !== undefined ? { name } : {}), ...opts });
  }

  /** an external entity: a user, a third party, anything outside the system */
  entity(id: string, name?: string, opts: ElementOpts = {}): NodeRef {
    return this.element(TM_ENTITY_TYPE, id, name, opts);
  }
  /** a process: something the system does with the data */
  process(id: string, name?: string, opts: ElementOpts = {}): NodeRef {
    return this.element(TM_PROCESS_TYPE, id, name, opts);
  }
  /** a data store: where the data rests */
  store(id: string, name?: string, opts: ElementOpts = {}): NodeRef {
    return this.element(TM_STORE_TYPE, id, name, opts);
  }
  /** a trust boundary: nest elements with `.contains()` */
  boundary(id: string, name?: string, opts: ElementOpts = {}): NodeRef {
    return this.element(TM_BOUNDARY_TYPE, id, name, opts);
  }

  /** a data flow; a string is its label */
  flow(from: NodeRef, to: NodeRef, labelOrOpts: string | Omit<RelateOpts, 'kind'> = {}): FlowRef {
    const opts = typeof labelOrOpts === 'string' ? { label: labelOrOpts } : labelOrOpts;
    return new FlowRef(this.m.addRelation(from, to, { kind: TM_FLOW_KIND, ...opts }), this.m);
  }
}

/** A zone's node options: the two dates are required, `type`/`plane`/`metadata`
 * are the builder's. */
export interface ZoneOpts extends Omit<NodeOpts, 'type' | 'metadata' | 'plane'> {
  start: string;
  end: string;
}
export interface EventOpts extends Omit<NodeOpts, 'type' | 'metadata' | 'plane'> {
  at: string;
}

/**
 * A zone: a NodeRef (so comment/link/threat compose) whose helpers nest on the
 * PLAN plane. Everything a zone creates is scoped to that plane — a plan added
 * to an architecture model must not leak bars into the architecture view — and
 * every containment edge names the plane, so the plan need not be the first
 * plane declared.
 */
export class ZoneBuilder extends NodeRef {
  constructor(
    id: string,
    private readonly m: ModelBuilder,
    /** the plan plane's id */
    readonly plane: string,
  ) {
    super(id, m);
  }

  /** a nested zone */
  zone(id: string, opts: ZoneOpts): ZoneBuilder {
    const z = planZone(this.m, this.plane, id, opts);
    this.m.addContainment(this.id, id, this.plane);
    return z;
  }

  /** an event inside this zone */
  event(id: string, opts: EventOpts): NodeRef {
    const e = planEvent(this.m, this.plane, id, opts);
    this.m.addContainment(this.id, id, this.plane);
    return e;
  }

  /** schedule any node (a C4 container, an ER table…) inside this zone */
  override contains(...nodes: NodeRef[]): this {
    for (const n of nodes) this.m.addContainment(this.id, n.id, this.plane);
    return this;
  }

  private role(n: NodeRef, kind: PlanRole): this {
    this.m.addRelation(n, this, { kind });
    return this;
  }
  owner(n: NodeRef): this {
    return this.role(n, 'owns');
  }
  executor(n: NodeRef): this {
    return this.role(n, 'executes');
  }
  checker(n: NodeRef): this {
    return this.role(n, 'checks');
  }
}

function planZone(m: ModelBuilder, plane: string, id: string, opts: ZoneOpts): ZoneBuilder {
  const { start, end, ...rest } = opts;
  m.node(id, { type: PLAN_ZONE_TYPE, plane, metadata: { start, end }, ...rest });
  return new ZoneBuilder(id, m, plane);
}

function planEvent(m: ModelBuilder, plane: string, id: string, opts: EventOpts): NodeRef {
  const { at, ...rest } = opts;
  return m.node(id, { type: PLAN_EVENT_TYPE, plane, metadata: { at }, ...rest });
}

/** Root-level plan helpers; see ZoneBuilder for the nested ones. */
export class PlanBuilder {
  constructor(
    private readonly m: ModelBuilder,
    readonly plane: string,
  ) {}

  /** a top-level zone */
  zone(id: string, opts: ZoneOpts): ZoneBuilder {
    return planZone(this.m, this.plane, id, opts);
  }
  /** a top-level event, drawn in the header */
  event(id: string, opts: EventOpts): NodeRef {
    return planEvent(this.m, this.plane, id, opts);
  }
  /** a person to hand roles to (`zone.owner(p)` …). `plane` is omitted, not
   * just overridden: a person is always scoped to the plan plane, and `...opts`
   * spreads after `plane: this.plane`, so a merely-overridden plane would
   * silently win over the forced one. */
  person(id: string, name?: string, opts: Omit<ElementOpts, 'plane'> = {}): NodeRef {
    return this.m.node(id, { type: PLAN_PERSON_TYPE, plane: this.plane, ...(name !== undefined ? { name } : {}), ...opts });
  }
  /** a team to hand roles to, same deal as `person` — an actor that holds a
   * role but is never an individual. Same forced-plane guard. */
  team(id: string, name?: string, opts: Omit<ElementOpts, 'plane'> = {}): NodeRef {
    return this.m.node(id, { type: PLAN_TEAM_TYPE, plane: this.plane, ...(name !== undefined ? { name } : {}), ...opts });
  }
}

export interface ActivityElementOpts {
  color?: string;
}

/** Shared element surface of a lane and a region: each helper creates a typed
 * node contained by this scope and hands back a plain NodeRef, so everything
 * composes with the rest of the builder (relate, layers, contains). */
export abstract class ActivityScope extends NodeRef {
  private counters = new Map<string, number>();
  constructor(
    id: string,
    protected readonly m: ModelBuilder,
  ) {
    super(id, m);
  }

  /** `${scopeId}-<suffix>` for the first of a kind, `-<n>` after — deterministic
   * from declaration order, so layout-overlay keys stay stable. */
  protected autoId(suffix: string): string {
    const n = (this.counters.get(suffix) ?? 0) + 1;
    this.counters.set(suffix, n);
    return n === 1 ? `${this.id}-${suffix}` : `${this.id}-${suffix}-${n}`;
  }

  protected element(id: string, type: string, name: string, opts: ActivityElementOpts = {}): NodeRef {
    const ref = this.m.node(id, { type, name, ...(opts.color !== undefined ? { color: opts.color } : {}) });
    this.m.addContainment(this.id, id);
    return ref;
  }

  action(id: string, name: string, opts?: ActivityElementOpts): NodeRef {
    return this.element(id, 'activity-action', name, opts);
  }
  object(id: string, name: string, opts?: ActivityElementOpts): NodeRef {
    return this.element(id, 'activity-object', name, opts);
  }
  send(id: string, name: string, opts?: ActivityElementOpts): NodeRef {
    return this.element(id, 'activity-send', name, opts);
  }
  receive(id: string, name: string, opts?: ActivityElementOpts): NodeRef {
    return this.element(id, 'activity-receive', name, opts);
  }
  note(id: string, text: string): NodeRef {
    return this.element(id, 'activity-note', text);
  }
  decision(id?: string, name = ''): NodeRef {
    return this.element(id ?? this.autoId('decision'), 'activity-decision', name);
  }
  bar(id?: string): NodeRef {
    return this.element(id ?? this.autoId('bar'), 'activity-bar', '');
  }
  start(id?: string): NodeRef {
    return this.element(id ?? this.autoId('start'), 'activity-start', '');
  }
  end(id?: string): NodeRef {
    return this.element(id ?? this.autoId('end'), 'activity-end', '');
  }
}

export class RegionRef extends ActivityScope {}

export class LaneRef extends ActivityScope {
  /** interruptible region: a dashed container inside this lane */
  region(id?: string, name = ''): RegionRef {
    const rid = id ?? this.autoId('region');
    this.element(rid, 'activity-region', name);
    return new RegionRef(rid, this.m);
  }
}

/** One activity diagram: the frame node itself (this IS its NodeRef) plus lane
 * and cross-lane flow helpers. Call m.activity() once per frame — several
 * frames coexist on one canvas. */
export class ActivityBuilder extends NodeRef {
  constructor(
    id: string,
    private readonly b: ModelBuilder,
  ) {
    super(id, b);
  }

  /** lanes are drawn top-to-bottom in the order they are declared */
  lane(id: string, opts: { name?: string; color?: string } = {}): LaneRef {
    this.b.node(id, {
      type: 'activity-lane',
      ...(opts.name !== undefined ? { name: opts.name } : {}),
      ...(opts.color !== undefined ? { color: opts.color } : {}),
    });
    this.b.addContainment(this.id, id);
    return new LaneRef(id, this.b);
  }

  flow(from: NodeRef, to: NodeRef, label?: string): this {
    this.b.relate(from, to, { kind: 'control', ...(label !== undefined ? { label } : {}) });
    return this;
  }
  objectFlow(from: NodeRef, to: NodeRef, label?: string): this {
    this.b.relate(from, to, { kind: 'object-flow', ...(label !== undefined ? { label } : {}) });
    return this;
  }
  interrupt(from: NodeRef, to: NodeRef, label?: string): this {
    this.b.relate(from, to, { kind: 'interrupt', ...(label !== undefined ? { label } : {}) });
    return this;
  }
  noteLink(note: NodeRef, target: NodeRef): this {
    this.b.relate(note, target, { kind: 'note-link' });
    return this;
  }
}

export class ModelBuilder {
  private nodes: DiagramNode[] = [];
  private containment: ContainmentEdge[] = [];
  private relations: DiagramRelation[] = [];
  private layers: DiagramLayer[] = [];
  private planes: DiagramPlane[] = [];
  private legendConfig: DiagramLegend | undefined;
  private typeColorMap: Record<string, string> | undefined;
  private layerRuleList: LayerRule[] | undefined;
  private modelNotation: string | undefined;
  private modelStyle: string | undefined;
  private pairCounters = new Map<string, number>();
  private git: GitGraphBuilder | undefined;
  private so: SecondOrderBuilder | undefined;
  private fb: FishboneBuilder | undefined;
  private tm: ThreatModelBuilder | undefined;
  private pl: PlanBuilder | undefined;

  constructor(
    private readonly id: string,
    private readonly name: string,
  ) {}

  node(id: string, opts: NodeOpts = {}): NodeRef {
    const { name, ...rest } = opts;
    this.nodes.push({ id, name: name ?? id, ...pruneUndefined(rest) });
    return new NodeRef(id, this);
  }

  /** ER table: a node of type 'db-table' carrying `columns`. */
  table(id: string, opts: Omit<NodeOpts, 'type'> & { columns: Column[] }): NodeRef {
    return this.node(id, { type: 'db-table', ...opts });
  }

  /**
   * Foreign key: a `kind:'fk'` relation from `from.fromColumn` to `to.toColumn`.
   * `toColumn` defaults to the target table's single primary-key column; declare
   * the target table (with its PK) before calling.
   */
  fk(
    from: NodeRef,
    fromColumn: string,
    to: NodeRef,
    toColumn?: string,
    opts: Omit<RelateOpts, 'kind' | 'fromColumn' | 'toColumn'> = {},
  ): this {
    let resolved = toColumn;
    if (resolved === undefined) {
      const target = this.nodes.find((n) => n.id === to.id);
      const pks = (target?.columns ?? []).filter((c) => c.pk === true);
      if (pks.length !== 1) {
        throw new Error(
          `m.fk: target table '${to.id}' must have exactly one primary-key column (or pass toColumn); found ${pks.length}`,
        );
      }
      resolved = pks[0]!.name;
    }
    return this.relate(from, to, { kind: 'fk', ...opts, fromColumn, toColumn: resolved });
  }

  /** internal — used by NodeRef */
  addContainment(parent: string, child: string, plane?: string): void {
    const exists = this.containment.some(
      (e) => e.parent === parent && e.child === child && e.plane === plane,
    );
    if (!exists) this.containment.push({ parent, child, ...pruneUndefined({ plane }) });
  }

  /** internal — appends a threat to the node or relation `target` names; used by
   * NodeRef.threat() and FlowRef.threat() */
  addThreat(target: ThreatTarget, opts: ThreatOpts): void {
    const element =
      'node' in target
        ? this.nodes.find((n) => n.id === target.node)
        : this.relations.find((r) => r.id === target.relation);
    if (element === undefined) {
      throw new Error(
        'node' in target
          ? `threat(): unknown node '${target.node}'`
          : `threat(): unknown relation '${target.relation}'`,
      );
    }
    const threats = element.threats ?? [];
    const { id, category, title, ...rest } = opts;
    // Synthesized from the list's length, not a model-wide counter: an id only
    // has to be unique within its own element (see Threat.id), so two elements'
    // first findings are both `t1` and neither shifts when the other changes.
    const threat: Threat = { id: id ?? `t${threats.length + 1}`, category, title, ...pruneUndefined(rest) };
    if (threats.some((t) => t.id === threat.id)) {
      throw new Error(`threat(): duplicate threat id '${threat.id}' on '${element.id}'`);
    }
    element.threats = [...threats, threat];
  }

  /** internal — appends a comment to the node or relation `target` names; used by
   * NodeRef.comment() and FlowRef.comment() */
  addComment(target: ElementTarget, text: string, opts: CommentOpts): void {
    const element =
      'node' in target
        ? this.nodes.find((n) => n.id === target.node)
        : this.relations.find((r) => r.id === target.relation);
    if (element === undefined) {
      throw new Error(
        'node' in target
          ? `comment(): unknown node '${target.node}'`
          : `comment(): unknown relation '${target.relation}'`,
      );
    }
    const comments = element.comments ?? [];
    const { id, ...rest } = opts;
    // per-element ids, as threats: two elements' first comments are both c1
    const comment: Comment = { id: id ?? nextCommentId(comments), text, ...pruneUndefined(rest) };
    if (comments.some((c) => c.id === comment.id)) {
      throw new Error(`comment(): duplicate comment id '${comment.id}' on '${element.id}'`);
    }
    element.comments = [...comments, comment];
  }

  /** internal — appends a link to a node; used by NodeRef.link() */
  addLink(nodeId: string, link: Link): void {
    const node = this.nodes.find((n) => n.id === nodeId);
    if (node === undefined) throw new Error(`link(): unknown node '${nodeId}'`);
    node.links = [...(node.links ?? []), link];
  }

  relate(from: NodeRef, to: NodeRef, opts: RelateOpts): this {
    this.addRelation(from, to, opts);
    return this;
  }

  /** internal — like relate(), but returns the new relation's id (FlowRef needs
   * it to hang threats off the flow) */
  addRelation(from: NodeRef, to: NodeRef, opts: RelateOpts): string {
    const pair = `${from.id}->${to.id}`;
    const n = this.pairCounters.get(pair) ?? 0;
    this.pairCounters.set(pair, n + 1);
    const { kind, id, ...rest } = opts;
    const relationId = id ?? `${pair}#${n}`;
    this.relations.push({
      id: relationId,
      from: from.id,
      to: to.id,
      kind,
      ...pruneUndefined(rest),
    });
    return relationId;
  }

  layer(id: string, opts: { name?: string; tint?: string } = {}): this {
    this.layers.push({ id, name: opts.name ?? id, ...pruneUndefined({ tint: opts.tint }) });
    return this;
  }

  plane(
    id: string,
    opts: {
      name?: string;
      containmentOf?: string;
      layers?: string[];
      baseRelations?: boolean;
      notation?: NotationId;
      hides?: string[];
      hidesTree?: string[];
    } = {},
  ): this {
    this.planes.push({
      id,
      name: opts.name ?? id,
      ...pruneUndefined({
        containmentOf: opts.containmentOf,
        layers: opts.layers,
        baseRelations: opts.baseRelations,
        notation: opts.notation,
        hides: opts.hides,
        hidesTree: opts.hidesTree,
      }),
    });
    return this;
  }

  /**
   * Declare this model a git graph: a plane with the `git-graph` notation that
   * must be the default (first-declared) plane, so the lanes' containment needs
   * no plane tag. Returns the builder for lanes; see BranchRef.
   */
  gitGraph(opts: { plane?: string; name?: string } = {}): GitGraphBuilder {
    if (this.git !== undefined) throw new Error('gitGraph() already declared');
    if (this.planes.length > 0) {
      throw new Error('gitGraph() must come before plane(): the git plane has to be the default (first-declared) plane');
    }
    this.plane(opts.plane ?? 'git-graph', { name: opts.name ?? 'Git graph', notation: 'git-graph' });
    this.git = new GitGraphBuilder(this);
    return this.git;
  }

  /**
   * Declare a second-order thinking diagram. With no `plane` the NOTATION is
   * model-wide (nothing about it needs a plane — the notation is flat); name a
   * plane to keep it beside other views of the same model.
   */
  secondOrder(opts: { plane?: string; name?: string } = {}): SecondOrderBuilder {
    if (this.so !== undefined) throw new Error('secondOrder() already declared');
    if (opts.plane !== undefined) this.plane(opts.plane, { name: opts.name ?? 'Consequences', notation: 'second-order' });
    else this.notation('second-order');
    this.so = new SecondOrderBuilder(this);
    return this.so;
  }

  /**
   * Declare a fishbone diagram: the effect at the head, then `.category()` /
   * `.cause()` to hang bones on it. With no `plane` the NOTATION is model-wide
   * (the notation is flat); name a plane to keep it beside other views of the
   * same model. The effect's own options ride in `opts` too.
   */
  fishbone(id: string, name?: string, opts: FishboneOpts & { plane?: string; planeName?: string } = {}): FishboneBuilder {
    if (this.fb !== undefined) throw new Error('fishbone() already declared');
    const { plane, planeName, ...rest } = opts;
    if (plane !== undefined) this.plane(plane, { name: planeName ?? 'Causes', notation: 'fishbone' });
    else this.notation('fishbone');
    const effect = this.node(id, { type: FB_EFFECT_TYPE, ...(name !== undefined ? { name } : {}), ...rest });
    this.fb = new FishboneBuilder(this, effect);
    return this.fb;
  }

  /**
   * Declare a threat model (STRIDE data-flow diagram). With no `plane` the
   * NOTATION is model-wide; name a plane to threat-model an existing
   * architecture beside its other views — the plane holds its own boundary
   * containment over the same nodes.
   */
  threatModel(opts: { plane?: string; name?: string } = {}): ThreatModelBuilder {
    if (this.tm !== undefined) throw new Error('threatModel() already declared');
    if (opts.plane !== undefined) this.plane(opts.plane, { name: opts.name ?? 'Threat model', notation: TM_NOTATION });
    else this.notation(TM_NOTATION);
    this.tm = new ThreatModelBuilder(this);
    return this.tm;
  }

  /**
   * Declare a plan (schedule) plane. Always a plane — zones are containers with
   * dates, and the plan's containment must not be the architecture's. Need not
   * be the first plane: the intended use is a plan plane added to an existing
   * model, scheduling that model's nodes inside its zones.
   */
  plan(id = 'plan', opts: { name?: string } = {}): PlanBuilder {
    if (this.pl !== undefined) throw new Error('plan() already declared');
    this.plane(id, { name: opts.name ?? 'Plan', notation: PLAN_NOTATION });
    this.pl = new PlanBuilder(this, id);
    return this.pl;
  }

  /** Declare an activity diagram: a framed swimlane flow. Repeatable — each
   * call is one frame; frames are ordinary containers on whatever plane the
   * model uses (no notation, no plane creation). */
  activity(id: string, opts: { name?: string } = {}): ActivityBuilder {
    this.node(id, { type: 'activity-frame', ...(opts.name !== undefined ? { name: opts.name } : {}) });
    return new ActivityBuilder(id, this);
  }

  /** Declare a legend. Bare `legend()` means derived sections only. */
  legend(opts: DiagramLegend = {}): this {
    this.legendConfig = opts;
    return this;
  }

  /** Default accent colour per node type; `*` is the fallback for the rest.
   * The one way to colour nodes a composed diagram did not author. Successive
   * calls merge, last wins per key; a node's own `color` still wins over both. */
  typeColors(map: Record<string, string>): this {
    this.typeColorMap = { ...(this.typeColorMap ?? {}), ...map };
    return this;
  }

  /** Put unlayered relations on layers by class (`kind` and/or `style.color`),
   * first match wins. The one way a composed diagram can layer relations an
   * include brought in. Successive calls append; an explicit relation `layer`
   * still beats every rule. */
  layerRules(rules: LayerRule[]): this {
    this.layerRuleList = [...(this.layerRuleList ?? []), ...rules];
    return this;
  }

  /** pin the whole diagram's visual language (see DiagramModel.notation) */
  notation(id: string): this {
    this.modelNotation = id;
    return this;
  }

  /** pin the model-level renderer style preset (see DiagramModel.style) */
  style(id: string): this {
    this.modelStyle = id;
    return this;
  }

  toJSON(): DiagramModel {
    const json: DiagramModel = {
      version: 1,
      id: this.id,
      name: this.name,
      nodes: this.nodes,
      containment: this.containment,
      relations: this.relations,
      layers: this.layers,
      planes: this.planes,
      ...(this.legendConfig !== undefined ? { legend: this.legendConfig } : {}),
      ...(this.typeColorMap !== undefined ? { typeColors: this.typeColorMap } : {}),
      ...(this.layerRuleList !== undefined ? { layerRules: this.layerRuleList } : {}),
      ...(this.modelNotation !== undefined ? { notation: this.modelNotation } : {}),
      ...(this.modelStyle !== undefined ? { style: this.modelStyle } : {}),
    };
    const issues = validate(json);
    if (issues.length > 0) throw new DiagramValidationError(issues);
    return json;
  }
}

export function model(id: string, opts: { name?: string } = {}): ModelBuilder {
  return new ModelBuilder(id, opts.name ?? id);
}

function pruneUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}
