import { useMemo } from 'react';
import {
  FB_CAUSE_TYPE,
  FB_EFFECT_TYPE,
  FISHBONE_PRESET_NAMES,
  fishboneTree,
  isFishboneNode,
  validate,
  type DiagramModel,
  type EditorCommand,
} from '@diagramming/core';
import type { DiagramSelection } from '@diagramming/renderer';
import { addChild, addEffect, isSubCause, seedCategories } from './fishboneActions';
import { DockSection } from '../DockSection';

interface FishbonePanelProps {
  model: DiagramModel;
  selection: DiagramSelection | null;
  /** the plane a new effect belongs to — the active plane, when it keeps nodes
   * of its own (see createNodeAt); undefined adds a shared effect. */
  plane?: string;
  onCommand: (command: EditorCommand) => void;
  onSelect: (id: string) => void;
  /** a node this panel just created — the app opens its name for typing */
  onCreated: (id: string) => void;
}

const LIMIT_HINT = 'A sub-cause takes nothing: three levels below the effect is the limit.';

/** The fishbone editing surface: the head, a starting set of bones, then one
 * child at a time under whatever is selected — and what validation objects to. */
export function FishbonePanel({ model, selection, plane, onCommand, onSelect, onCreated }: FishbonePanelProps) {
  const tree = useMemo(() => fishboneTree(model), [model]);
  const issues = useMemo(() => validate(model).filter((i) => i.code.startsWith('fb-')), [model]);
  const selected = selection?.kind === 'node' ? model.nodes.find((n) => n.id === selection.id && isFishboneNode(n)) : undefined;
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
          <button type="button" onClick={() => created(addEffect(model, plane))}>
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
            {isSub ? LIMIT_HINT : selected !== undefined ? `Under “${selected.name !== '' ? selected.name : selected.id}”:` : 'Adds a category to the effect.'}
          </p>
          <button type="button" disabled={isSub || parentId === undefined} onClick={() => parentId !== undefined && created(addChild(model, parentId))}>
            {childLabel}
          </button>
          <p className="so-hint">
            {selected !== undefined ? 'Tab does the same for the selection.' : 'Select a bone or a cause, and the button (or Tab) hangs something on it instead.'}
          </p>
        </>
      )}
      {issues.length > 0 && (
        <ul className="so-issues">
          {issues.map((i) => {
            const ref = i.ref;
            // fb-no-effect's ref is the plane or model id, not a node — nothing
            // on canvas to select, so it renders as text, not a dead button.
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
