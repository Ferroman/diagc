import { useState } from 'react';
import {
  formatTransition,
  SM_STATE_TYPE,
  type DiagramNode,
  type EditorCommand,
  type StateBehavior,
} from '@diagc/core/internal';
import { commitOnEnter } from './commitOnEnter';
import { useDraftField } from './useDraftField';

const FIXED_TRIGGERS = ['entry', 'exit', 'do'];
/** the select's value for "a free event name" */
const EVENT = 'event';

type Save = (change: (rows: StateBehavior[]) => StateBehavior[]) => void;

const withGuard = (trigger: string, guard: string, effect: string): StateBehavior => ({
  trigger,
  ...(guard !== '' ? { guard } : {}),
  effect,
});

/** One editable row: each box commits on blur or Enter. Trigger and effect are
 * required (core rejects an empty one), so an emptied box snaps back; an emptied
 * guard is removed. Each box's draft follows the stored value (useDraftField), so
 * a row keyed by its place shows a moved or undone behaviour, and a save does not
 * remount the row under the box focus has just moved to. */
function BehaviorRow({
  behavior,
  index,
  last,
  save,
}: {
  behavior: StateBehavior;
  index: number;
  last: boolean;
  save: Save;
}) {
  const drafts = {
    trigger: useDraftField(behavior.trigger),
    guard: useDraftField(behavior.guard),
    effect: useDraftField(behavior.effect),
  };
  const n = index + 1;
  const commit = () => {
    const trigger = drafts.trigger[0].trim();
    const effect = drafts.effect[0].trim();
    if (trigger === '' || effect === '') {
      drafts.trigger[1](behavior.trigger);
      drafts.guard[1](behavior.guard ?? '');
      drafts.effect[1](behavior.effect);
      return;
    }
    const next = withGuard(trigger, drafts.guard[0].trim(), effect);
    if (formatTransition(next) === formatTransition(behavior)) return;
    save((rows) => rows.map((r, i) => (i === index ? next : r)));
  };
  const box = (field: keyof typeof drafts) => (
    <input
      aria-label={`Behaviour ${n} ${field}`}
      value={drafts[field][0]}
      onChange={(e) => drafts[field][1](e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => commitOnEnter(e, commit)}
    />
  );
  const move = (by: -1 | 1) =>
    save((rows) => {
      const next = [...rows];
      const [row] = next.splice(index, 1);
      next.splice(index + by, 0, row!);
      return next;
    });
  return (
    <div className="edge-label-row">
      {box('trigger')}
      {box('guard')}
      {box('effect')}
      <button
        type="button"
        className="chip icon-btn"
        aria-label={`Move behaviour ${n} up`}
        disabled={index === 0}
        onClick={() => move(-1)}
      >
        ↑
      </button>
      <button
        type="button"
        className="chip icon-btn"
        aria-label={`Move behaviour ${n} down`}
        disabled={last}
        onClick={() => move(1)}
      >
        ↓
      </button>
      <button
        type="button"
        className="chip icon-btn"
        aria-label={`Remove behaviour ${n}`}
        onClick={() => save((rows) => rows.filter((_, i) => i !== index))}
      >
        ✕
      </button>
    </div>
  );
}

/** The row that adds a behaviour: trigger select (entry, exit, do, or an event
 * named in the box that appears), then guard and effect. */
function AddRow({ add }: { add: (behavior: StateBehavior) => void }) {
  const [kind, setKind] = useState('entry');
  const [event, setEvent] = useState('');
  const [guard, setGuard] = useState('');
  const [effect, setEffect] = useState('');
  const trigger = kind === EVENT ? event.trim() : kind;
  const ready = trigger !== '' && effect.trim() !== '';
  const submit = () => {
    if (!ready) return;
    add(withGuard(trigger, guard.trim(), effect.trim()));
    setEvent('');
    setGuard('');
    setEffect('');
  };
  return (
    <div className="edge-label-row">
      <select aria-label="New behaviour trigger" value={kind} onChange={(e) => setKind(e.target.value)}>
        {FIXED_TRIGGERS.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
        <option value={EVENT}>event…</option>
      </select>
      {kind === EVENT && (
        <input
          aria-label="New behaviour event"
          placeholder="event"
          value={event}
          onChange={(e) => setEvent(e.target.value)}
        />
      )}
      <input
        aria-label="New behaviour guard"
        placeholder="guard"
        value={guard}
        onChange={(e) => setGuard(e.target.value)}
      />
      <input
        aria-label="New behaviour effect"
        placeholder="effect"
        value={effect}
        onChange={(e) => setEffect(e.target.value)}
        onKeyDown={(e) => commitOnEnter(e, submit)}
      />
      <button type="button" className="chip" disabled={!ready} onClick={submit}>
        Add behaviour
      </button>
    </div>
  );
}

/** A state's entry, exit, do and event behaviours. Every change sends the whole list. */
export function BehaviorsSection({
  node,
  onCommand,
}: {
  node: DiagramNode;
  onCommand: (command: EditorCommand) => void;
}) {
  if (node.type !== SM_STATE_TYPE) return null;
  const rows = node.behaviors ?? [];
  const send = (behaviors: StateBehavior[]) => onCommand({ type: 'set-state-behaviors', id: node.id, behaviors });
  const save: Save = (change) => send(change(rows));
  return (
    <section className="panel-section">
      <h3>Behaviours</h3>
      {rows.map((behavior, i) => (
        <BehaviorRow
          // a row's identity is its place: its text changes with every save, and a
          // remount would take the focus from the box the user just moved to
          key={i}
          behavior={behavior}
          index={i}
          last={i === rows.length - 1}
          save={save}
        />
      ))}
      <AddRow add={(behavior) => send([...rows, behavior])} />
    </section>
  );
}
