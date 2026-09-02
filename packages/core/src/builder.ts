import type {
  Column,
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
  NotationId,
  Polarity,
  RelationStyle,
  TextAlign,
  TextRun,
} from './types';
import { DiagramValidationError, validate } from './validate';

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
  /** restrict this node to a single plane (see DiagramNode.plane) */
  plane?: string;
  /** transparent-sheet membership (see DiagramNode.layer) */
  layer?: string;
  /** ER-table rows (see DiagramNode.columns) */
  columns?: Column[];
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

export class GitGraphBuilder {
  constructor(private readonly m: ModelBuilder) {}
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

  relate(from: NodeRef, to: NodeRef, opts: RelateOpts): this {
    const pair = `${from.id}->${to.id}`;
    const n = this.pairCounters.get(pair) ?? 0;
    this.pairCounters.set(pair, n + 1);
    const { kind, id, ...rest } = opts;
    this.relations.push({
      id: id ?? `${pair}#${n}`,
      from: from.id,
      to: to.id,
      kind,
      ...pruneUndefined(rest),
    });
    return this;
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
