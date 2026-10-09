import type { CommentOpts, ElementOpts, NodeRef, RelateOpts, ThreatOpts } from '../../builder/node-ref';
import type { ModelBuilder } from '../../builder/model-builder';
import { defined } from '../../util';
import { TM_BOUNDARY_TYPE, TM_ENTITY_TYPE, TM_FLOW_KIND, TM_PROCESS_TYPE, TM_STORE_TYPE } from './threat-model';

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

/** The four DFD element kinds plus flows. Everything it hands back is an
 * ordinary NodeRef/FlowRef, so the rest of the builder — contains, relate,
 * layers, threat — composes with it unchanged. */
export class ThreatModelBuilder {
  constructor(private readonly m: ModelBuilder) {}

  private element(type: string, id: string, name: string | undefined, opts: ElementOpts): NodeRef {
    return this.m.node(id, { type, ...defined({ name }), ...opts });
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
