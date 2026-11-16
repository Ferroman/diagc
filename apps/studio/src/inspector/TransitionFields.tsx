import { SM_TRANSITION_KIND, type DiagramRelation, type EditorCommand } from '@diagc/core/internal';
import { commitOnEnter } from './commitOnEnter';
import { useDraftField } from './useDraftField';

type Part = 'trigger' | 'guard' | 'effect';
const PARTS: { part: Part; title: string }[] = [
  { part: 'trigger', title: 'Trigger' },
  { part: 'guard', title: 'Guard' },
  { part: 'effect', title: 'Effect' },
];

/** One part of a transition: commits on blur or Enter; a blank box clears the part. */
function PartField({
  relation,
  part,
  title,
  onCommand,
}: {
  relation: DiagramRelation;
  part: Part;
  title: string;
  onCommand: (command: EditorCommand) => void;
}) {
  const [text, setText] = useDraftField(relation[part]);
  const commit = () => {
    const next = text.trim();
    if (next === (relation[part] ?? '')) return;
    onCommand({ type: 'update-relation', id: relation.id, patch: { [part]: next === '' ? null : next } });
  };
  return (
    <label className="field">
      <span>{title}</span>
      <input
        aria-label={title}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => commitOnEnter(e, commit)}
      />
    </label>
  );
}

/** The three parts of a state-machine transition's label, one box each. */
export function TransitionFields({
  relation,
  onCommand,
}: {
  relation: DiagramRelation;
  onCommand: (command: EditorCommand) => void;
}) {
  if (relation.kind !== SM_TRANSITION_KIND) return null;
  return (
    <section className="panel-section">
      <h3>Transition</h3>
      {PARTS.map(({ part, title }) => (
        <PartField key={part} relation={relation} part={part} title={title} onCommand={onCommand} />
      ))}
    </section>
  );
}
