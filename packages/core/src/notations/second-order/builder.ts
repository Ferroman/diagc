import { NodeRef } from '../../builder/node-ref';
import type { ModelBuilder } from '../../builder/model-builder';
import { defined } from '../../util';
import { SO_DECISION_TYPE, SO_LEADS_TO_KIND, consequenceTypeOf, type Valence } from './second-order';

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
    this.m.node(id, { type: consequenceTypeOf(valence ?? '0'), ...defined({ name }), ...rest });
    const ref = new ConsequenceRef(id, this.m);
    this.leadsTo(ref, label !== undefined ? { label } : {});
    return ref;
  }

  /** join two branches: this also leads to a consequence declared elsewhere */
  leadsTo(to: NodeRef, opts: { label?: string } = {}): this {
    this.m.relate(this, to, { kind: SO_LEADS_TO_KIND, ...defined({ label: opts.label }) });
    return this;
  }
}

export class SecondOrderBuilder {
  constructor(private readonly m: ModelBuilder) {}
  /** the root of a tree; several decisions share one set of bands */
  decision(id: string, name?: string, opts: Omit<ConsequenceOpts, 'valence' | 'label'> = {}): ConsequenceRef {
    this.m.node(id, { type: SO_DECISION_TYPE, ...defined({ name }), ...opts });
    return new ConsequenceRef(id, this.m);
  }
}
