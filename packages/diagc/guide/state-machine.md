# State machine

A UML state machine: states, the transitions between them, and the events, guards and effects on those transitions. Reach for it to show how one thing moves through its modes, such as an order, a connection or an editor session.

{{starter}}

## How it works

- `m.stateMachine(id, opts?)` draws a machine frame and returns a handle. `opts` takes `name`, `plane` and `planeName`. You can call it again for a second machine. Without `plane` the whole diagram becomes a state machine, and the call throws if it has another notation: pass `plane` to draw the machine beside other views.
- The machine, a state and a region each offer `state(id, name?, { entry?, exit?, do?, color? })`, `initial(id?)`, `final(id?)`, `choice(id?, name?)`, `junction(id?)`, `bar(id?)` and `terminate(id?)`. `entry`, `exit` and `do` are the state's `behaviors`, each an effect.
- A transition is `machine.transition(from, to, { trigger?, guard?, effect? })`, or `element.to(target, parts?)`, which returns the target so a path chains. A transition reads `trigger [guard] / effect`. Write the parts as options, never as a `label`.
- `state.on(trigger, { guard?, effect })` adds an internal transition: the state is not left. It shows in the state's behaviors.
- A state with children is composite and rests folded in a viewer; double-click unfolds it. `state.region(id?, name?)` adds a concurrent region, and a state with regions is orthogonal. `state.entryPoint(id?, name?)` and `state.exitPoint(id?, name?)` sit on its border.
- `history({ id?, deep? })` is shallow history (`H`), or deep (`H*`) with `deep: true`. `state.history()` is valid on a plain composite state, and `region.history()` in each region of an orthogonal one, where `state.history()` throws. The machine itself has no history. A transition into a history state resumes the substate that was left.

## Node types

{{node-types}}

You never write these types yourself: the builder creates them. A state is composite when something is inside it.

## Rules

Every rule is a warning, never an error: the diagram still compiles. Lint reports them under these codes.

- `sm-initial-count`, `sm-initial-flow`: one initial per region, with exactly one plain transition out and none in.
- `sm-final-outgoing`: a final or a terminate has no transition out.
- `sm-choice-guards`: each exit of a choice or junction has a guard, and at most one is `else`.
- `sm-bar-shape`: a bar has one transition on one side, and a fork's targets are in different regions.
- `sm-unreachable`: a state no path from an initial reaches. A machine with no initial is not checked.
- `sm-transition-ends`, `sm-transition-label`: a transition joins two state-machine nodes, and its parts carry the text.
- `sm-region-parent`, `sm-region-siblings`, `sm-machine-parent`, `sm-pseudo-children`, `sm-history-parent`, `sm-point-parent`: where each node may sit.

## From a Quint spec

A Quint spec's mode variable becomes the states. Take this one:

```quint
module order {
  var status: str
  var total: int
  action init = all { status' = "draft", total' = 0 }
  action refund = total' = 0
  action pay = all { status == "draft", total > 0, status' = "paid", total' = total }
  action ship = all { status == "paid", status' = "shipped", total' = total }
  action cancel = any {
    all { status == "draft", status' = "cancelled", total' = total },
    all { status == "paid", refund, status' = "cancelled" },
  }
}
```

- The variable that holds the mode, a `str` or a sum type, gives one state per value.
- `init` is the initial transition, to the state it assigns.
- An action that changes the mode is a transition. Its name is the trigger, the preconditions on other variables are the guard, and the other updates, or an action it calls for them (`refund`), are the effect. An update that keeps a variable as it was (`total' = total`) is no effect.
- The alternatives of an `any` from one mode are several transitions from that state.
- An action that leaves the mode unchanged is an internal transition (`state.on`), or a self-transition when re-entry matters.
- Independent mode variables that change in one step are orthogonal regions. An invariant has no diagram element yet: write it in a comment.

```ts
import { model } from '@diagc/core';

const m = model('order-spec', { name: 'Order spec' });
const order = m.stateMachine('order', { name: 'Order' });

const draft = order.state('draft', 'draft');
const paid = order.state('paid', 'paid');
const shipped = order.state('shipped', 'shipped');
const cancelled = order.state('cancelled', 'cancelled');

order.initial().to(draft);
order.transition(draft, paid, { trigger: 'pay', guard: 'total > 0' });
order.transition(paid, shipped, { trigger: 'ship' });
order.transition(draft, cancelled, { trigger: 'cancel' });
order.transition(paid, cancelled, { trigger: 'cancel', effect: 'refund' });

export default m;
```
