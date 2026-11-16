import { NodeRef } from '../../builder/node-ref';
import type { ModelBuilder } from '../../builder/model-builder';
import type { StateBehavior } from '../../types';
import { defined } from '../../util';
import {
  SM_BAR_TYPE,
  SM_CHOICE_TYPE,
  SM_DEEP_HISTORY_TYPE,
  SM_ENTRY_TYPE,
  SM_EXIT_TYPE,
  SM_FINAL_TYPE,
  SM_HISTORY_TYPE,
  SM_INITIAL_TYPE,
  SM_JUNCTION_TYPE,
  SM_REGION_TYPE,
  SM_STATE_TYPE,
  SM_TERMINATE_TYPE,
  SM_TRANSITION_KIND,
} from './state-machine';
import type { TransitionParts } from './transition';

/** re-exported so the builder signatures below resolve to a public name */
export type { TransitionParts };

export interface SmStateOpts {
  /** runs on entering: becomes the behavior `entry / <effect>` */
  entry?: string;
  /** runs on leaving: becomes the behavior `exit / <effect>` */
  exit?: string;
  /** runs while in the state: becomes the behavior `do / <effect>` */
  do?: string;
  color?: string;
}

/** A transition between two vertices; `parts` ride as relation fields, never as a label,
 * so the renderer owns how `trigger [guard] / effect` is laid out. */
function transition(m: ModelBuilder, from: NodeRef, to: NodeRef, parts: TransitionParts = {}): void {
  m.relate(from, to, { kind: SM_TRANSITION_KIND, ...defined(parts) });
}

/** A pseudo-state, or any element that can start a transition. */
export class SmElementRef extends NodeRef {
  constructor(
    id: string,
    private readonly b: ModelBuilder,
  ) {
    super(id, b);
  }

  /** a transition from this element; returns the target so calls chain along a path */
  to(target: NodeRef, parts?: TransitionParts): NodeRef {
    transition(this.b, this, target, parts);
    return target;
  }
}

/** Shared element surface of a machine, a state and a region: each helper creates a typed
 * node contained by this scope, on the scope's plane. */
export abstract class SmScope extends NodeRef {
  private counters = new Map<string, number>();
  constructor(
    id: string,
    protected readonly m: ModelBuilder,
    protected readonly plane?: string,
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

  protected declare(
    id: string,
    type: string,
    name: string | undefined,
    extra: { color?: string; behaviors?: StateBehavior[] } = {},
  ): void {
    this.m.node(id, { type, ...defined({ name, plane: this.plane }), ...defined(extra) });
    this.m.addContainment(this.id, id, this.plane);
  }

  protected pseudo(id: string | undefined, suffix: string, type: string, name = ''): SmElementRef {
    const own = id ?? this.autoId(suffix);
    this.declare(own, type, name);
    return new SmElementRef(own, this.m);
  }

  state(id: string, name?: string, opts: SmStateOpts = {}): StateRef {
    const behaviors: StateBehavior[] = [];
    if (opts.entry !== undefined) behaviors.push({ trigger: 'entry', effect: opts.entry });
    if (opts.exit !== undefined) behaviors.push({ trigger: 'exit', effect: opts.exit });
    if (opts.do !== undefined) behaviors.push({ trigger: 'do', effect: opts.do });
    this.declare(id, SM_STATE_TYPE, name, {
      ...defined({ color: opts.color }),
      ...(behaviors.length > 0 ? { behaviors } : {}),
    });
    return new StateRef(id, this.m, this.plane);
  }

  initial(id?: string): SmElementRef {
    return this.pseudo(id, 'initial', SM_INITIAL_TYPE);
  }
  final(id?: string): SmElementRef {
    return this.pseudo(id, 'final', SM_FINAL_TYPE);
  }
  choice(id?: string, name?: string): SmElementRef {
    return this.pseudo(id, 'choice', SM_CHOICE_TYPE, name);
  }
  junction(id?: string): SmElementRef {
    return this.pseudo(id, 'junction', SM_JUNCTION_TYPE);
  }
  /** fork or join */
  bar(id?: string): SmElementRef {
    return this.pseudo(id, 'bar', SM_BAR_TYPE);
  }
  terminate(id?: string): SmElementRef {
    return this.pseudo(id, 'terminate', SM_TERMINATE_TYPE);
  }
  /** shallow history (`H`), or deep (`H*`) with `deep: true` */
  history(opts: { id?: string; deep?: boolean } = {}): SmElementRef {
    return opts.deep === true
      ? this.pseudo(opts.id, 'deep-history', SM_DEEP_HISTORY_TYPE)
      : this.pseudo(opts.id, 'history', SM_HISTORY_TYPE);
  }
}

export class SmRegionRef extends SmScope {}

export class StateRef extends SmScope {
  /** a concurrent region: giving a state its first one makes it orthogonal */
  region(id?: string, name = ''): SmRegionRef {
    const own = id ?? this.autoId('region');
    this.declare(own, SM_REGION_TYPE, name);
    return new SmRegionRef(own, this.m, this.plane);
  }

  /** An internal transition: runs `effect` on `trigger` without leaving the state. */
  on(trigger: string, opts: { guard?: string; effect: string }): this {
    this.m.addBehavior(this.id, { trigger, ...defined({ guard: opts.guard }), effect: opts.effect });
    return this;
  }

  /** a state with regions keeps its history inside each region, so this refuses there */
  override history(opts: { id?: string; deep?: boolean } = {}): SmElementRef {
    if (this.m.hasChildOfType(this.id, SM_REGION_TYPE)) {
      throw new Error(
        `state '${this.id}' has regions: history belongs to a region, so call region.history() instead of state.history()`,
      );
    }
    return super.history(opts);
  }

  entryPoint(id?: string, name?: string): SmElementRef {
    return this.pseudo(id, 'entry', SM_ENTRY_TYPE, name);
  }
  exitPoint(id?: string, name?: string): SmElementRef {
    return this.pseudo(id, 'exit', SM_EXIT_TYPE, name);
  }

  to(target: NodeRef, parts?: TransitionParts): NodeRef {
    transition(this.m, this, target, parts);
    return target;
  }
}

/** One state machine: the frame node itself (this IS its NodeRef). Call m.stateMachine()
 * once per frame — several frames coexist on one canvas. */
export class StateMachineBuilder extends SmScope {
  transition(from: NodeRef, to: NodeRef, parts?: TransitionParts): this {
    transition(this.m, from, to, parts);
    return this;
  }

  entryPoint(id?: string, name?: string): SmElementRef {
    return this.pseudo(id, 'entry', SM_ENTRY_TYPE, name);
  }
  exitPoint(id?: string, name?: string): SmElementRef {
    return this.pseudo(id, 'exit', SM_EXIT_TYPE, name);
  }
}
