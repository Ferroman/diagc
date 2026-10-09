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
  LayerRule,
  Link,
  NotationId,
  Threat,
} from '../types';
import { nextCommentId } from '../comments';
import { findElement, isNodeRef, type ElementRef } from '../elements';
import { defined } from '../util';
import { DiagramValidationError, validate } from '../validate/index';
import { ActivityBuilder } from '../activity/builder';
import { FishboneBuilder, type FishboneOpts } from '../notations/fishbone/builder';
import { FB_EFFECT_TYPE } from '../notations/fishbone/fishbone';
import { GitGraphBuilder } from '../notations/git-graph/builder';
import { PlanBuilder } from '../notations/plan/builder';
import { PLAN_NOTATION } from '../notations/plan/plan';
import { SecondOrderBuilder } from '../notations/second-order/builder';
import { ThreatModelBuilder } from '../notations/threat-model/builder';
import { TM_NOTATION } from '../notations/threat-model/threat-model';
import { NodeRef, type CommentOpts, type NodeOpts, type RelateOpts, type ThreatOpts } from './node-ref';

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
    this.nodes.push({ id, name: name ?? id, ...defined(rest) });
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
    const exists = this.containment.some((e) => e.parent === parent && e.child === child && e.plane === plane);
    if (!exists) this.containment.push({ parent, child, ...defined({ plane }) });
  }

  /** internal — appends a threat to the node or relation `target` names; used by
   * NodeRef.threat() and FlowRef.threat() */
  addThreat(target: ElementRef, opts: ThreatOpts): void {
    const element = findElement({ nodes: this.nodes, relations: this.relations }, target);
    if (element === undefined) {
      throw new Error(
        isNodeRef(target)
          ? `threat(): unknown node '${target.node}'`
          : `threat(): unknown relation '${target.relation}'`,
      );
    }
    const threats = element.threats ?? [];
    const { id, category, title, ...rest } = opts;
    // Synthesized from the list's length, not a model-wide counter: an id only
    // has to be unique within its own element (see Threat.id), so two elements'
    // first findings are both `t1` and neither shifts when the other changes.
    const threat: Threat = { id: id ?? `t${threats.length + 1}`, category, title, ...defined(rest) };
    if (threats.some((t) => t.id === threat.id)) {
      throw new Error(`threat(): duplicate threat id '${threat.id}' on '${element.id}'`);
    }
    element.threats = [...threats, threat];
  }

  /** internal — appends a comment to the node or relation `target` names; used by
   * NodeRef.comment() and FlowRef.comment() */
  addComment(target: ElementRef, text: string, opts: CommentOpts): void {
    const element = findElement({ nodes: this.nodes, relations: this.relations }, target);
    if (element === undefined) {
      throw new Error(
        isNodeRef(target)
          ? `comment(): unknown node '${target.node}'`
          : `comment(): unknown relation '${target.relation}'`,
      );
    }
    const comments = element.comments ?? [];
    const { id, ...rest } = opts;
    // per-element ids, as threats: two elements' first comments are both c1
    const comment: Comment = { id: id ?? nextCommentId(comments), text, ...defined(rest) };
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
      ...defined(rest),
    });
    return relationId;
  }

  layer(id: string, opts: { name?: string; tint?: string } = {}): this {
    this.layers.push({ id, name: opts.name ?? id, ...defined({ tint: opts.tint }) });
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
      ...defined({
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
      throw new Error(
        'gitGraph() must come before plane(): the git plane has to be the default (first-declared) plane',
      );
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
    if (opts.plane !== undefined)
      this.plane(opts.plane, { name: opts.name ?? 'Consequences', notation: 'second-order' });
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
  fishbone(
    id: string,
    name?: string,
    opts: FishboneOpts & { plane?: string; planeName?: string } = {},
  ): FishboneBuilder {
    if (this.fb !== undefined) throw new Error('fishbone() already declared');
    const { plane, planeName, ...rest } = opts;
    if (plane !== undefined) this.plane(plane, { name: planeName ?? 'Causes', notation: 'fishbone' });
    else this.notation('fishbone');
    const effect = this.node(id, { type: FB_EFFECT_TYPE, ...defined({ name }), ...rest });
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
    this.node(id, { type: 'activity-frame', ...defined({ name: opts.name }) });
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
      ...defined({
        legend: this.legendConfig,
        typeColors: this.typeColorMap,
        layerRules: this.layerRuleList,
        notation: this.modelNotation,
        style: this.modelStyle,
      }),
    };
    const issues = validate(json);
    if (issues.length > 0) throw new DiagramValidationError(issues);
    return json;
  }
}

export function model(id: string, opts: { name?: string } = {}): ModelBuilder {
  return new ModelBuilder(id, opts.name ?? id);
}
