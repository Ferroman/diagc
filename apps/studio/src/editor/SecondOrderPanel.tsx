import { useMemo } from 'react';
import { validate, isSecondOrderNode, type DiagramModel, type EditorCommand, type Valence } from '@diagc/core';
import type { DiagramSelection } from '@diagc/renderer';
import { addDecision, thenWhat } from './secondOrderActions';
import { DockSection } from '../DockSection';

interface SecondOrderPanelProps {
  model: DiagramModel;
  selection: DiagramSelection | null;
  /** the plane new decisions belong to — the active plane, when it keeps nodes
   * of its own (see createNodeAt); undefined adds a shared decision. */
  plane?: string;
  onCommand: (command: EditorCommand) => void;
  onSelect: (id: string) => void;
  /** a node this panel just created — the app opens its name for typing */
  onCreated: (id: string) => void;
}

const ANSWERS: { valence: Valence; label: string }[] = [
  { valence: '+', label: 'Good consequence' },
  { valence: '-', label: 'Bad consequence' },
  { valence: '0', label: 'Neutral consequence' },
];

/** The second-order editing surface: grow the tree one "and then what?" at a
 * time, and see what validation objects to. */
export function SecondOrderPanel({ model, selection, plane, onCommand, onSelect, onCreated }: SecondOrderPanelProps) {
  const from = selection?.kind === 'node' ? model.nodes.find((n) => n.id === selection.id && isSecondOrderNode(n)) : undefined;
  const issues = useMemo(() => validate(model).filter((i) => i.code.startsWith('so-')), [model]);

  const created = (out: { command: EditorCommand; id: string } | null) => {
    if (out === null) return;
    onCommand(out.command);
    onSelect(out.id);
    onCreated(out.id);
  };

  return (
    <DockSection id="second-order" title="And then what?" label="Second-order thinking" className="sidebar so-panel">
      <p className="so-hint">{from !== undefined ? `What follows from “${from.name !== '' ? from.name : from.id}”?` : 'Select a decision or a consequence.'}</p>
      <div className="so-answers">
        {ANSWERS.map((a) => (
          <button key={a.valence} type="button" disabled={from === undefined} onClick={() => from !== undefined && created(thenWhat(model, from.id, a.valence))}>
            {a.label}
          </button>
        ))}
      </div>
      <p className="so-hint">Tab adds a neutral consequence to the selection.</p>
      <button type="button" onClick={() => created(addDecision(model, plane))}>
        Add a decision
      </button>
      {issues.length > 0 && (
        <ul className="so-issues">
          {issues.map((i) => {
            const ref = i.ref;
            // so-no-decision's ref is the plane or model id, not a node — there is
            // nothing on canvas to select, so it renders as text, not a dead button.
            const targetNode = ref !== undefined && model.nodes.some((n) => n.id === ref);
            return (
              <li key={`${i.code}:${ref ?? ''}`}>
                {targetNode && ref !== undefined ? (
                  <button type="button" onClick={() => onSelect(ref)}>
                    {i.message}
                  </button>
                ) : (
                  <span>{i.message}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </DockSection>
  );
}
