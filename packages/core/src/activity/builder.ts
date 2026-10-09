import { NodeRef } from '../builder/node-ref';
import type { ModelBuilder } from '../builder/model-builder';
import { defined } from '../util';
import {
  ACTIVITY_ACTION_TYPE,
  ACTIVITY_BAR_TYPE,
  ACTIVITY_DECISION_TYPE,
  ACTIVITY_END_TYPE,
  ACTIVITY_LANE_TYPE,
  ACTIVITY_NOTE_TYPE,
  ACTIVITY_OBJECT_TYPE,
  ACTIVITY_RECEIVE_TYPE,
  ACTIVITY_REGION_TYPE,
  ACTIVITY_SEND_TYPE,
  ACTIVITY_START_TYPE,
} from './activity';

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
    const ref = this.m.node(id, { type, name, ...defined({ color: opts.color }) });
    this.m.addContainment(this.id, id);
    return ref;
  }

  action(id: string, name: string, opts?: ActivityElementOpts): NodeRef {
    return this.element(id, ACTIVITY_ACTION_TYPE, name, opts);
  }
  object(id: string, name: string, opts?: ActivityElementOpts): NodeRef {
    return this.element(id, ACTIVITY_OBJECT_TYPE, name, opts);
  }
  send(id: string, name: string, opts?: ActivityElementOpts): NodeRef {
    return this.element(id, ACTIVITY_SEND_TYPE, name, opts);
  }
  receive(id: string, name: string, opts?: ActivityElementOpts): NodeRef {
    return this.element(id, ACTIVITY_RECEIVE_TYPE, name, opts);
  }
  note(id: string, text: string): NodeRef {
    return this.element(id, ACTIVITY_NOTE_TYPE, text);
  }
  decision(id?: string, name = ''): NodeRef {
    return this.element(id ?? this.autoId('decision'), ACTIVITY_DECISION_TYPE, name);
  }
  bar(id?: string): NodeRef {
    return this.element(id ?? this.autoId('bar'), ACTIVITY_BAR_TYPE, '');
  }
  start(id?: string): NodeRef {
    return this.element(id ?? this.autoId('start'), ACTIVITY_START_TYPE, '');
  }
  end(id?: string): NodeRef {
    return this.element(id ?? this.autoId('end'), ACTIVITY_END_TYPE, '');
  }
}

export class RegionRef extends ActivityScope {}

export class LaneRef extends ActivityScope {
  /** interruptible region: a dashed container inside this lane */
  region(id?: string, name = ''): RegionRef {
    const rid = id ?? this.autoId('region');
    this.element(rid, ACTIVITY_REGION_TYPE, name);
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
      type: ACTIVITY_LANE_TYPE,
      ...defined({ name: opts.name, color: opts.color }),
    });
    this.b.addContainment(this.id, id);
    return new LaneRef(id, this.b);
  }

  flow(from: NodeRef, to: NodeRef, label?: string): this {
    this.b.relate(from, to, { kind: 'control', ...defined({ label }) });
    return this;
  }
  objectFlow(from: NodeRef, to: NodeRef, label?: string): this {
    this.b.relate(from, to, { kind: 'object-flow', ...defined({ label }) });
    return this;
  }
  interrupt(from: NodeRef, to: NodeRef, label?: string): this {
    this.b.relate(from, to, { kind: 'interrupt', ...defined({ label }) });
    return this;
  }
  noteLink(note: NodeRef, target: NodeRef): this {
    this.b.relate(note, target, { kind: 'note-link' });
    return this;
  }
}
