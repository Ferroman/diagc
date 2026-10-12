import { useMemo } from 'react';
import {
  diagramWarnings,
  FB_CAUSE_TYPE,
  FB_EFFECT_TYPE,
  FISHBONE_PRESET_NAMES,
  fishboneTree,
  isFishboneNode,
  validate,
  type EditorCommand,
} from '@diagc/core/internal';
import { addChild, addEffect, isSubCause, seedCategories } from './fishboneActions';
import { DockSection } from '../../dock/DockSection';
import { IssueList } from '../IssueList';
import type { NotationPanelProps } from '../types';

/** `scopePlane` is where a new effect belongs; absent, the effect is shared. */
type FishbonePanelProps = Pick<NotationPanelProps, 'model' | 'selection' | 'onCommand' | 'onSelect' | 'onCreated'> &
  Partial<Pick<NotationPanelProps, 'scopePlane'>>;

const LIMIT_HINT = 'A sub-cause takes nothing: three levels below the effect is the limit.';

/** The fishbone editing surface: the head, a starting set of bones, then one
 * child at a time under whatever is selected — and what validation objects to. */
export function FishbonePanel({ model, selection, scopePlane, onCommand, onSelect, onCreated }: FishbonePanelProps) {
  const tree = useMemo(() => fishboneTree(model), [model]);
  // Errors and warnings in one list: a stray cause (a warning, so the diagram
  // still saves) is exactly what the author needs pointed at here.
  const issues = useMemo(
    () => [...validate(model), ...diagramWarnings(model)].filter((i) => i.code.startsWith('fb-')),
    [model],
  );
  const selected =
    selection?.kind === 'node' ? model.nodes.find((n) => n.id === selection.id && isFishboneNode(n)) : undefined;
  // Nothing (or the effect) selected → a category; else a child of the selection.
  const parentId = selected === undefined ? tree.effect : selected.id;
  const isSub = selected?.type === FB_CAUSE_TYPE && isSubCause(tree, selected.id);
  const childLabel = selected === undefined || selected.type === FB_EFFECT_TYPE ? 'Add a category' : 'Add a cause';

  const created = (out: { command: EditorCommand; id: string } | null) => {
    if (out === null) return;
    onCommand(out.command);
    onSelect(out.id);
    onCreated(out.id);
  };

  return (
    <DockSection id="fishbone" title="Fishbone" className="sidebar so-panel">
      {tree.effect === undefined ? (
        <>
          <p className="so-hint">Every fish starts with the effect at its head.</p>
          <button type="button" onClick={() => created(addEffect(model, scopePlane))}>
            Add an effect
          </button>
        </>
      ) : (
        <>
          {tree.categories.length === 0 && (
            <>
              <p className="so-hint">Start from a standard set of bones, or add your own.</p>
              <div className="so-answers">
                {FISHBONE_PRESET_NAMES.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      const out = tree.effect !== undefined ? seedCategories(model, tree.effect, preset) : null;
                      if (out !== null) onCommand(out.command);
                    }}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </>
          )}
          <p className="so-hint">
            {isSub
              ? LIMIT_HINT
              : selected !== undefined
                ? `Under “${selected.name !== '' ? selected.name : selected.id}”:`
                : 'Adds a category to the effect.'}
          </p>
          <button
            type="button"
            disabled={isSub || parentId === undefined}
            onClick={() => parentId !== undefined && created(addChild(model, parentId))}
          >
            {childLabel}
          </button>
          <p className="so-hint">
            {selected !== undefined
              ? 'Tab does the same for the selection.'
              : 'Select a bone or a cause, and the button (or Tab) hangs something on it instead.'}
          </p>
        </>
      )}
      <IssueList model={model} issues={issues} selects="nodes" onSelect={(target) => onSelect(target.id)} />
    </DockSection>
  );
}
