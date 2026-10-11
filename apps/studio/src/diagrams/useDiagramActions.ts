import { emptyDrawings, emptyLayout, type DiagramModel, type Drawings, type LayoutOverlay } from '@diagc/core/internal';
import type { LoadedArtifact } from './artifacts';
import type { DiagramStore } from './useDiagramBoot';
import type { DeepLink } from './useDeepLink';
import type { EditSession } from '../session/useEditSession';
import { nextCopyName } from '../canvas-editing/copyName';
import { groupOf } from './diagramGroups';
import { getHost } from '../host';

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
  store: Pick<DiagramStore, 'rename' | 'putDraft' | 'markOwned' | 'disown'>;
  selectDiagram: DeepLink['selectDiagram'];
  renameSelected: DeepLink['renameSelected'];
  startEditing: EditSession['startEditing'];
  leaveEdit: () => boolean;
  resetView: () => void;
}

export interface DiagramActions {
  /** Prompt for a name, create an empty diagram server-side, and edit it. */
  newDiagram: () => Promise<void>;
  /** View-mode rename of an owned diagram: move both server files, then the
   * artifact keys. */
  renameDiagram: () => Promise<void>;
  /** Copy the selected diagram to a new editable JSON source and open it. */
  duplicateDiagram: () => Promise<void>;
  /** Promote the selected JSON-backed diagram to a generated TypeScript source. */
  ejectDiagram: () => Promise<void>;
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
  store,
  selectDiagram,
  renameSelected,
  startEditing,
  leaveEdit,
  resetView,
}: UseDiagramActionsOptions): DiagramActions {
  const newDiagram = async () => {
    if (!leaveEdit()) return;
    // Seed the prompt with the open diagram's folder so a new diagram lands in
    // the group being looked at; clearing the seed puts it at the root.
    const folder = groupOf(selected);
    const seed = folder === '' ? '' : `${folder}/`;
    const raw = (await getHost().promptText('New diagram name (lowercase, digits, - or /):', seed))?.trim();
    // A trailing slash is a folder with no name in it — OK on the untouched
    // seed. The server's isSafeName would accept it and write a nameless
    // `.diagram.json`, so it is refused here.
    if (raw === undefined || raw === '' || raw.endsWith('/')) return;
    if (names.includes(raw) || ownedNames.has(raw)) {
      getHost().notify(`A diagram named '${raw}' already exists.`);
      return;
    }
    const m = emptyModel(raw);
    const res = await getHost().apiFetch(`/api/diagrams/${raw}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(m),
    });
    if (!res.ok) {
      getHost().notify(`Could not create '${raw}'`);
      return;
    }
    store.putDraft(raw, { name: raw, model: m, issues: [] });
    store.markOwned(raw);
    selectDiagram(raw);
    resetView();
    startEditing(raw, { model: m, layout: emptyLayout(), drawings: emptyDrawings() });
  };

  const renameDiagram = async () => {
    if (editing) return;
    const raw = (await getHost().promptText('Rename diagram to (lowercase, digits, - or /):', selected))?.trim();
    if (raw === undefined || raw === '' || raw === selected) return;
    if (names.includes(raw) || ownedNames.has(raw)) {
      getHost().notify(`A diagram named '${raw}' already exists.`);
      return;
    }
    const res = await getHost().apiFetch(`/api/diagrams/${selected}/rename`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to: raw }),
    });
    if (!res.ok) {
      getHost().notify(`Could not rename '${selected}'`);
      return;
    }
    // The store's move and the selection's land in one commit (automatic
    // batching), so the selection never names a diagram the store does not
    // hold yet, and DiagramView's re-seed arrives together with the renamed
    // artifact.
    store.rename(selected, raw);
    renameSelected(raw);
  };

  // A read-only diagram is TS-authored, and what the studio holds for it is the
  // *compiled* artifact: `include` already composed, already validated at
  // compile time. Writing that out as a JSON source therefore yields a flat,
  // standalone diagram the middleware owns — an editable twin of something the
  // studio otherwise can only look at. Owned diagrams take the same path; there
  // is nothing about it that a JSON source needs done differently — UNLESS the
  // owned diagram is itself an umbrella: its boot model is composed, and
  // copying that would bake grafted content into a "duplicate" that no longer
  // has an `include`. So owned diagrams copy the raw source below instead;
  // read-only ones still copy the composed artifact, since there is no raw
  // source to copy.
  const duplicateDiagram = async () => {
    if (!leaveEdit()) return;
    let model = current?.model;
    let layout = current?.layout;
    let drawings = current?.drawings;
    if (ownedNames.has(selected)) {
      const res = await getHost().apiFetch(`/api/diagrams/${selected}`);
      if (!res.ok) {
        getHost().notify(`Could not copy '${selected}'`);
        return;
      }
      const body = (await res.json()) as { model: DiagramModel; layout?: LayoutOverlay; drawings?: Drawings };
      model = body.model;
      layout = body.layout;
      drawings = body.drawings;
    }
    if (model === undefined) return;
    // Every name is a collision, not just the editable ones: a compiled
    // artifact under `<copy>` would shadow the source we are about to write.
    const copy = nextCopyName(selected, new Set([...names, ...ownedNames]));
    const copied: DiagramModel = { ...model, id: copy, name: copy };
    const post = (kind: 'diagrams' | 'layouts' | 'drawings', body: unknown) =>
      getHost().apiFetch(`/api/${kind}/${copy}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    const res = await post('diagrams', copied);
    if (!res.ok) {
      getHost().notify(`Could not copy '${selected}'`);
      return;
    }
    const finalLayout = layout ?? emptyLayout();
    const finalDrawings = drawings ?? emptyDrawings();
    // Hand positions and strokes are most of why a copy is worth taking, so
    // they go over with the model — but only when the source actually has
    // them, mirroring the editor's rule that an untouched diagram never writes
    // a sidecar. A failure here is not fatal: the edit session below still
    // carries both, so the first Save writes them.
    if (layout !== undefined) await post('layouts', finalLayout);
    if (drawings !== undefined) await post('drawings', finalDrawings);
    store.putDraft(copy, { name: copy, model: copied, layout: finalLayout, drawings: finalDrawings, issues: [] });
    store.markOwned(copy);
    selectDiagram(copy);
    resetView();
    startEditing(copy, { model: copied, layout: finalLayout, drawings: finalDrawings });
  };

  // Promotion is server-verified (the generated TS must rebuild the identical
  // model before the JSON is replaced), so the client's only jobs are consent
  // and flipping local ownership — the model, layout and selection all stay.
  const ejectDiagram = async () => {
    if (editing) return;
    const ok = await getHost().confirmDialog(
      `Eject '${selected}' to TypeScript? The JSON source is replaced by a generated .diagram.ts and the diagram becomes read-only in the studio.`,
    );
    if (!ok) return;
    const res = await getHost().apiFetch(`/api/diagrams/${selected}/eject`, { method: 'POST' });
    if (!res.ok) {
      getHost().notify(`Could not eject '${selected}'`);
      return;
    }
    store.disown(selected);
  };

  return { newDiagram, renameDiagram, duplicateDiagram, ejectDiagram };
}
