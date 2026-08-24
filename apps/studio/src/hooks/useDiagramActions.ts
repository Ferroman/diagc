import type { Dispatch, SetStateAction } from 'react';
import { emptyDrawings, emptyLayout, type DiagramModel } from '@diagramming/core';
import type { LoadedArtifact } from '../artifacts';
import type { EditorApi } from '../editor/useEditor';
import { nextCopyName } from '../copyName';

const emptyModel = (name: string): DiagramModel => ({
  version: 1,
  id: name,
  name,
  nodes: [],
  containment: [],
  relations: [],
  layers: [],
  planes: [],
});

export interface UseDiagramActionsOptions {
  editing: boolean;
  selected: string;
  /** The selected diagram's artifact — the content a duplicate copies. */
  current: LoadedArtifact | undefined;
  names: string[];
  ownedNames: Set<string>;
  setOwnedNames: Dispatch<SetStateAction<Set<string>>>;
  setDrafts: Dispatch<SetStateAction<Record<string, LoadedArtifact>>>;
  setLoaded: Dispatch<SetStateAction<Record<string, LoadedArtifact>>>;
  setSources: Dispatch<SetStateAction<Record<string, LoadedArtifact>>>;
  setSelected: Dispatch<SetStateAction<string>>;
  setEnteredPath: Dispatch<SetStateAction<string[]>>;
  setEditing: Dispatch<SetStateAction<boolean>>;
  leaveEdit: () => boolean;
  resetView: () => void;
  editor: EditorApi;
}

export interface DiagramActions {
  /** Prompt for a name, create an empty diagram server-side, and edit it. */
  newDiagram: () => Promise<void>;
  /** View-mode rename of an owned diagram: move both server files, then the
   * artifact keys. */
  renameDiagram: () => Promise<void>;
  /** Copy the selected diagram to a new editable JSON source and open it. */
  duplicateDiagram: () => Promise<void>;
}

/**
 * Diagram lifecycle (create/rename/duplicate) — the flows that talk to the dev
 * API about whole diagrams and then re-key the artifact store + selection.
 */
export function useDiagramActions({
  editing,
  selected,
  current,
  names,
  ownedNames,
  setOwnedNames,
  setDrafts,
  setLoaded,
  setSources,
  setSelected,
  setEnteredPath,
  setEditing,
  leaveEdit,
  resetView,
  editor,
}: UseDiagramActionsOptions): DiagramActions {
  const newDiagram = async () => {
    if (!leaveEdit()) return;
    const raw = window.prompt('New diagram name (lowercase, digits, - or /):')?.trim();
    if (raw === undefined || raw === '') return;
    if (names.includes(raw) || ownedNames.has(raw)) {
      window.alert(`A diagram named '${raw}' already exists.`);
      return;
    }
    const m = emptyModel(raw);
    const res = await fetch(`/api/diagrams/${raw}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(m),
    });
    if (!res.ok) {
      window.alert(`Could not create '${raw}'`);
      return;
    }
    setDrafts((d) => ({ ...d, [raw]: { name: raw, model: m, issues: [] } }));
    setOwnedNames((s) => new Set(s).add(raw));
    setSelected(raw);
    setEnteredPath([]);
    resetView();
    editor.start(raw, { model: m, layout: emptyLayout(), drawings: emptyDrawings() });
    setEditing(true);
  };

  const renameDiagram = async () => {
    if (editing) return;
    const raw = window.prompt('Rename diagram to (lowercase, digits, - or /):', selected)?.trim();
    if (raw === undefined || raw === '' || raw === selected) return;
    if (names.includes(raw) || ownedNames.has(raw)) {
      window.alert(`A diagram named '${raw}' already exists.`);
      return;
    }
    const res = await fetch(`/api/diagrams/${selected}/rename`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to: raw }),
    });
    if (!res.ok) {
      window.alert(`Could not rename '${selected}'`);
      return;
    }
    const move = (rec: Record<string, LoadedArtifact>): Record<string, LoadedArtifact> => {
      const art = rec[selected];
      if (art === undefined) return rec;
      const { [selected]: _drop, ...rest } = rec;
      return {
        ...rest,
        [raw]: { ...art, name: raw, ...(art.model !== undefined ? { model: { ...art.model, id: raw, name: raw } } : {}) },
      };
    };
    // `loaded` (the boot API's models) now holds a diagram's content in the
    // common case — `sources`/`drafts` are only populated by prior save/rename
    // activity — so the rename must shadow-move in all three, or a diagram whose
    // content still lives in `loaded` would keep its old key and vanish from
    // `names` under the new one (the fallback-selection effect would then bounce
    // `selected` back to the first remaining name).
    setLoaded(move);
    setSources(move);
    setDrafts(move);
    setOwnedNames((s) => {
      const next = new Set(s);
      next.delete(selected);
      next.add(raw);
      return next;
    });
    setSelected(raw);
    // Fresh array reference, same contents: the renamed model's changed id makes
    // DiagramView reset its trail, and only a reference-new enteredPath prop
    // makes its host-sync branch re-apply the still-valid trail (the renderer
    // handles a same-render model switch + prop arrival correctly). These state
    // updates all land in one commit (automatic batching), so the re-seed
    // arrives together with the renamed artifact.
    setEnteredPath((p) => [...p]);
  };

  // A read-only diagram is TS-authored, and what the studio holds for it is the
  // *compiled* artifact: `include` already composed, already validated at
  // compile time. Writing that out as a JSON source therefore yields a flat,
  // standalone diagram the middleware owns — an editable twin of something the
  // studio otherwise can only look at. Owned diagrams take the same path; there
  // is nothing about it that a JSON source needs done differently.
  const duplicateDiagram = async () => {
    if (!leaveEdit()) return;
    const model = current?.model;
    if (model === undefined) return;
    // Every name is a collision, not just the editable ones: a compiled
    // artifact under `<copy>` would shadow the source we are about to write.
    const copy = nextCopyName(selected, new Set([...names, ...ownedNames]));
    const copied: DiagramModel = { ...model, id: copy, name: copy };
    const post = (kind: 'diagrams' | 'layouts' | 'drawings', body: unknown) =>
      fetch(`/api/${kind}/${copy}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    const res = await post('diagrams', copied);
    if (!res.ok) {
      window.alert(`Could not copy '${selected}'`);
      return;
    }
    const layout = current?.layout ?? emptyLayout();
    const drawings = current?.drawings ?? emptyDrawings();
    // Hand positions and strokes are most of why a copy is worth taking, so
    // they go over with the model — but only when the source actually has
    // them, mirroring the editor's rule that an untouched diagram never writes
    // a sidecar. A failure here is not fatal: the edit session below still
    // carries both, so the first Save writes them.
    if (current?.layout !== undefined) await post('layouts', layout);
    if (current?.drawings !== undefined) await post('drawings', drawings);
    setDrafts((d) => ({ ...d, [copy]: { name: copy, model: copied, layout, drawings, issues: [] } }));
    setOwnedNames((s) => new Set(s).add(copy));
    setSelected(copy);
    setEnteredPath([]);
    resetView();
    editor.start(copy, { model: copied, layout, drawings });
    setEditing(true);
  };

  return { newDiagram, renameDiagram, duplicateDiagram };
}