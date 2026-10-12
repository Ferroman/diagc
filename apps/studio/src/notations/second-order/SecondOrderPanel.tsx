import { useMemo } from 'react';
import { validate, isSecondOrderNode, type EditorCommand, type Valence } from '@diagc/core/internal';
import { addDecision, thenWhat } from './secondOrderActions';
import { DockSection } from '../../dock/DockSection';
import { IssueList } from '../IssueList';
import type { NotationPanelProps } from '../types';

/** `scopePlane` is where a new decision belongs; absent, the decision is shared. */
type SecondOrderPanelProps = Pick<NotationPanelProps, 'model' | 'selection' | 'onCommand' | 'onSelect' | 'onCreated'> &
  Partial<Pick<NotationPanelProps, 'scopePlane'>>;

const ANSWERS: { valence: Valence; label: string }[] = [
  { valence: '+', label: 'Good consequence' },
  { valence: '-', label: 'Bad consequence' },
  { valence: '0', label: 'Neutral consequence' },
];

/** The second-order editing surface: grow the tree one "and then what?" at a
 * time, and see what validation objects to. */
export function SecondOrderPanel({
  model,
  selection,
  scopePlane,
  onCommand,
  onSelect,
  onCreated,
}: SecondOrderPanelProps) {
  const from =
    selection?.kind === 'node' ? model.nodes.find((n) => n.id === selection.id && isSecondOrderNode(n)) : undefined;
  const issues = useMemo(() => validate(model).filter((i) => i.code.startsWith('so-')), [model]);

  const created = (out: { command: EditorCommand; id: string } | null) => {
    if (out === null) return;
    onCommand(out.command);
    onSelect(out.id);
    onCreated(out.id);
  };

  return (
    <DockSection id="second-order" title="And then what?" label="Second-order thinking" className="sidebar so-panel">
      <p className="so-hint">
        {from !== undefined
          ? `What follows from “${from.name !== '' ? from.name : from.id}”?`
          : 'Select a decision or a consequence.'}
      </p>
      <div className="so-answers">
        {ANSWERS.map((a) => (
          <button
            key={a.valence}
            type="button"
            disabled={from === undefined}
            onClick={() => from !== undefined && created(thenWhat(model, from.id, a.valence))}
          >
            {a.label}
          </button>
        ))}
      </div>
      <p className="so-hint">Tab adds a neutral consequence to the selection.</p>
      <button type="button" onClick={() => created(addDecision(model, scopePlane))}>
        Add a decision
      </button>
      <IssueList model={model} issues={issues} selects="nodes" onSelect={(target) => onSelect(target.id)} />
    </DockSection>
  );
}
