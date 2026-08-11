import type { DiagramModel, EditorCommand } from '@diagramming/core';
import type { DiagramSelection } from '@diagramming/renderer';

/** The toolbar swatch row's color target: the selected node, or the selected
 * single-relation edge. Null = no color target. */
export interface SelectionColor {
  value: string;
  onChange: (color: string) => void;
}

/**
 * Global color target: the selected node, or the selected single-relation edge —
 * drives the toolbar swatch row (select object -> click color). `dispatch` is
 * the editor's command sink. Returns null when there's nothing to color (no
 * selection, a multi-edge selection, or a stale id). The caller guards on edit
 * mode before invoking.
 */
export function computeSelectionColor(
  model: DiagramModel,
  selection: DiagramSelection | null,
  dispatch: (c: EditorCommand) => void,
): SelectionColor | null {
  if (selection === null) return null;
  if (selection.kind === 'node') {
    const n = model.nodes.find((x) => x.id === selection.id);
    if (n === undefined) return null;
    return {
      value: n.color ?? '',
      onChange: (c: string) =>
        dispatch({ type: 'set-node-details', id: n.id, details: { color: c === '' ? null : c } }),
    };
  }
  const ids = selection.constituentIds ?? [selection.id];
  if (ids.length !== 1) return null;
  const r = model.relations.find((x) => x.id === ids[0]);
  if (r === undefined) return null;
  return {
    value: r.style?.color ?? '',
    onChange: (c: string) => {
      const next = { ...(r.style ?? {}) };
      if (c === '') delete next.color;
      else next.color = c;
      dispatch({
        type: 'update-relation',
        id: r.id,
        patch: { style: Object.keys(next).length > 0 ? next : null },
      });
    },
  };
}
