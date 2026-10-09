import { NodeRef, type ElementOpts, type NodeOpts } from '../../builder/node-ref';
import type { ModelBuilder } from '../../builder/model-builder';
import { defined } from '../../util';
import { PLAN_EVENT_TYPE, PLAN_PERSON_TYPE, PLAN_TEAM_TYPE, PLAN_ZONE_TYPE, type PlanRole } from './plan';

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
    return this.m.node(id, {
      type: PLAN_PERSON_TYPE,
      plane: this.plane,
      ...defined({ name }),
      ...opts,
    });
  }
  /** a team to hand roles to, same deal as `person` — an actor that holds a
   * role but is never an individual. Same forced-plane guard. */
  team(id: string, name?: string, opts: Omit<ElementOpts, 'plane'> = {}): NodeRef {
    return this.m.node(id, {
      type: PLAN_TEAM_TYPE,
      plane: this.plane,
      ...defined({ name }),
      ...opts,
    });
  }
}
