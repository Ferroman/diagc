import { useRef } from 'react';
import {
  emptyDrawings,
  emptyLayout,
  errMessage,
  type DiagramModel,
  type Drawings,
  type LayoutOverlay,
} from '@diagc/core/internal';
import { getHost } from '../host';
import type { EditorSession } from '../session/reducer';
import type { EditorApi } from '../session/useEditor';
import type { EditSession } from '../session/useEditSession';
import type { LoadedArtifact } from './artifacts';

export interface UseDiagramViewOptions {
  /** the artifact store's merged set */
  artifacts: Record<string, LoadedArtifact>;
  selected: string;
  editing: boolean;
  editor: EditorApi;
  enterEdit: EditSession['enterEdit'];
  reportIssues: EditSession['reportIssues'];
  /** the arrangement's: edit mode reads the session's own overlay, so entering
   * it drops the view's layout preview */
  dropLayoutPreview: () => void;
}

export interface DiagramOnScreen {
  /** the open diagram's artifact */
  current: LoadedArtifact | undefined;
  /** the edit session as of this render */
  session: EditorSession | null;
  /** what is on screen: the session's while editing, the artifact's otherwise */
  model: DiagramModel | undefined;
  layout: LayoutOverlay | undefined;
  drawings: Drawings | undefined;
  /** Edit: load the diagram's raw source and start a session on it */
  enterEditFromSource: () => Promise<void>;
}

/** The open diagram as the studio shows it, and the way into editing it. */
export function useDiagramView({
  artifacts,
  selected,
  editing,
  editor,
  enterEdit,
  reportIssues,
  dropLayoutPreview,
}: UseDiagramViewOptions): DiagramOnScreen {
  // Live mirror of `selected` for enterEditFromSource's in-flight fetch to check
  // against once it resolves (same ref-mirror pattern as useDeepLink's urlNowRef) —
  // a callback captures `selected` at click time, but the async gap means the
  // user may have switched diagrams before the response arrives.
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const current = artifacts[selected];
  const session = editor.session;
  const model = editing ? session?.state.model : current?.model;
  const layout = editing ? session?.state.layout : current?.layout;
  const drawings = editing ? session?.state.drawings : current?.drawings;

  // Edit sessions start from the raw source on disk, never the boot model —
  // the boot model is composed for umbrellas, and a session seeded from it
  // would save grafted content into the source.
  const enterEditFromSource = async () => {
    const target = selected;
    try {
      const res = await getHost().apiFetch(`/api/diagrams/${target}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { model: DiagramModel; layout?: LayoutOverlay; drawings?: Drawings };
      // The user may have switched diagrams (picker or hashchange) while this
      // fetch was in flight — entering edit on `target` now would open a session
      // on the diagram the header no longer shows, so a stale response is
      // dropped instead of touching any state for a diagram that isn't selected.
      if (selectedRef.current !== target) return;
      // Edit mode reads the session's own overlay, not the preview — drop it here
      // (mirroring resetView() on the diagram picker) so Save + Done doesn't come
      // back to a stale preview masking what was saved. Only on success: a
      // failed fetch leaves the preview exactly as the old synchronous code did.
      dropLayoutPreview();
      enterEdit(target, body.model, body.layout ?? emptyLayout(), body.drawings ?? emptyDrawings());
    } catch (e) {
      if (selectedRef.current !== target) return;
      reportIssues([{ message: `Could not load '${target}' for editing: ${errMessage(e)}` }]);
    }
  };

  return { current, session, model, layout, drawings, enterEditFromSource };
}
