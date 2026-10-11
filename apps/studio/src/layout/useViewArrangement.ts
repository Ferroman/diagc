import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import {
  errMessage,
  layoutPlaneKey,
  type DiagramModel,
  type LayoutOverlay,
  type LayoutSettings,
  type Point,
} from '@diagc/core/internal';
import type { EdgeLabelMoves, LayoutApi } from '@diagc/renderer';
import { getHost } from '../host';
import type { DiagramStore } from '../diagrams/useDiagramBoot';
import type { SaveIssues } from '../session/useEditSession';
import type { Pins } from '../view/useViewNavigation';
import { mergePreview, withLayoutPreview } from './layoutPreview';
import { unfoldedOf, withPlaneManual, withSavedPositions } from './savedPositions';

export interface UseViewArrangementOptions {
  /** the diagram on screen: the session's while editing */
  model: DiagramModel | undefined;
  /** its overlay, as saved (the preview is laid over it here) */
  layout: LayoutOverlay | undefined;
  editing: boolean;
  /** the open diagram: the preview and Auto-arrange are its own */
  selected: string;
  activePlane: string | undefined;
  activePlaneManual: boolean;
  /** the viewer's fold overrides, and the plane's saved open boxes (navigation's) */
  pins: Pins;
  savedUnfoldedKey: string;
  layoutApiRef: RefObject<LayoutApi | null>;
  putLayout: DiagramStore['putLayout'];
  reportIssues: (issues: SaveIssues) => void;
}

export interface ViewArrangement {
  /** the overlay the canvas lays out from: the saved one, with the preview over it in view mode */
  viewLayout: LayoutOverlay | undefined;
  /** the renderer's reports of boxes and edge labels moved in view mode; it
   * holds both in effect and memo dependencies, so they stay the raw setters */
  setMovedPositions: (moved: Record<string, Point>) => void;
  setMovedLabels: (moved: EdgeLabelMoves) => void;
  /** a layout save is in flight */
  savingPositions: boolean;
  autoArrange: boolean;
  toggleAutoArrange: () => void;
  /** moved boxes or labels, or changed folds, that Save positions would write */
  unsavedView: boolean;
  savePositions: () => Promise<void>;
  toggleFreeze: () => Promise<void>;
  previewLayoutSettings: (patch: Partial<LayoutSettings>) => void;
  /** the plane on screen has a preview to drop */
  planePreviewed: boolean;
  dropPlanePreview: () => void;
  /** drop every plane's preview */
  dropPreview: () => void;
}

/**
 * How the diagram is arranged in view mode, and the explicit saves of it: the
 * layout preview, boxes and labels moved by hand, Auto-arrange, and the Save
 * positions and Freeze layout chips that write the layout file.
 */
export function useViewArrangement({
  model,
  layout,
  editing,
  selected,
  activePlane,
  activePlaneManual,
  pins,
  savedUnfoldedKey,
  layoutApiRef,
  putLayout,
  reportIssues,
}: UseViewArrangementOptions): ViewArrangement {
  // A viewer's momentary layout choice, keyed by resolved containment plane like
  // the persisted settings are. Never written to the sidecar: like focus, it is
  // viewer state.
  const [layoutPreview, setLayoutPreview] = useState<Record<string, LayoutSettings>>({});
  // Boxes moved by hand in view mode (alt-drag), not yet written to the sidecar.
  // Unlike the layout preview these CAN be persisted — coordinates were never
  // part of the model, so saving them is legitimate even for a read-only
  // TS-authored diagram, whose sidecar `diagc compile` never rewrites.
  const [movedPositions, setMovedPositions] = useState<Record<string, Point>>({});
  // Edge labels slid along their edges in view mode (Alt+drag a label): the
  // same class of state, saved by the same chip into the overlay's `edgeLabels`.
  const [movedLabels, setMovedLabels] = useState<EdgeLabelMoves>({});
  const [savingPositions, setSavingPositions] = useState(false);
  // Hand back a hand-positioned plane to the layout algorithm for this view only.
  // Saved coordinates otherwise beat every algorithm, so a diagram that has been
  // placed by hand stops responding to the picker entirely. Viewer state, like
  // pins and the layout preview: never written, and dropped when the diagram
  // changes so one diagram's choice cannot silently govern the next.
  const [autoArrange, setAutoArrange] = useState(false);

  // Auto-arrange is scoped to the diagram it was switched on for, so one
  // diagram's choice cannot silently rearrange the next one you open.
  useEffect(() => {
    setAutoArrange(false);
  }, [selected]);

  // The preview is diagram-scoped viewer state; every path that changes which
  // diagram is selected — the picker, a hashchange deep link, or the stale-name
  // fallback (all in useDeepLink) — must drop it here, or a leftover preview
  // keyed 'default' (a key every diagram resolves to) would silently re-lay out
  // the next diagram.
  useEffect(() => {
    setLayoutPreview({});
  }, [selected]);

  // Edit mode reads the session's own overlay untouched — layout settings there
  // are commands on the undo stack. View mode overlays the ephemeral preview.
  const viewLayout = useMemo(
    () => (editing ? layout : withLayoutPreview(layout, model, activePlane, layoutPreview)),
    [editing, layout, model, activePlane, layoutPreview],
  );

  // Write an overlay to `<name>.layout.json` and fold it into the in-memory copy
  // on success, so it survives a plane switch (which drops the renderer's
  // ephemeral drags) without a reload. Explicit, never automatic — unlike the
  // edit session's autosave, this runs in view mode on diagrams the studio does
  // not own, so committing positions to a repo file stays a deliberate act.
  // Both view-mode chips (Save positions, Freeze layout) end here. It never
  // rejects: the chips call it as `void`, so a failure becomes a banner issue
  // and a false return, which keeps their pending drags for a retry.
  // The store's operations are built each render; reading the newest through a
  // ref keeps postLayout changing only with `selected`.
  const putLayoutRef = useRef(putLayout);
  putLayoutRef.current = putLayout;
  const postLayout = useCallback(
    async (next: LayoutOverlay): Promise<boolean> => {
      setSavingPositions(true);
      try {
        const res = await getHost().apiFetch(`/api/layouts/${selected}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(next),
        });
        if (!res.ok) {
          // A proxy or crashed server can answer with a body that is not JSON.
          const body = (await res.json().catch(() => null)) as { issues?: { message: string }[] } | null;
          reportIssues(body?.issues ?? [{ message: 'Could not save layout' }]);
          return false;
        }
        putLayoutRef.current(selected, next);
        reportIssues(null);
        return true;
      } catch (e) {
        reportIssues([{ message: errMessage(e) }]);
        return false;
      } finally {
        setSavingPositions(false);
      }
    },
    [selected, reportIssues],
  );

  // Which boxes are open is saved WITH the positions (see withSavedPositions),
  // so the chip also has something to save when only a fold changed.
  const unfoldedNow = useMemo(() => unfoldedOf(pins), [pins]);
  const foldsUnsaved = model !== undefined && unfoldedNow.join('\u0000') !== savedUnfoldedKey;

  const unsavedView = Object.keys(movedPositions).length > 0 || Object.keys(movedLabels).length > 0 || foldsUnsaved;

  const savePositions = useCallback(async () => {
    if (model === undefined || !unsavedView) return;
    const ok = await postLayout(
      withSavedPositions({ layout, model, plane: activePlane }, movedPositions, unfoldedNow, movedLabels),
    );
    // The posted body folds movedPositions into the saved overlay, so on success
    // those drags are no longer unsaved — clear the chip. A failed post must
    // leave it up (postLayout surfaces saveIssues) so the user can retry.
    if (ok) {
      setMovedPositions({});
      setMovedLabels({});
    }
  }, [model, movedPositions, movedLabels, unsavedView, unfoldedNow, layout, activePlane, postLayout]);

  // The view-mode manual switch. Freezing snapshots every on-screen position
  // (React Flow's parent-relative copy — the overlay's own space, unsaved drags
  // included) so nothing jumps, then sets the flag; thawing only clears the
  // flag. Same semantics as the edit toolbar's toggle, minus the undo stack —
  // see withPlaneManual for what the flag does and does not do.
  const toggleFreeze = useCallback(async () => {
    if (model === undefined) return;
    const freezing = !activePlaneManual;
    const snapshot = freezing ? (layoutApiRef.current?.snapshotPositions() ?? {}) : null;
    const ok = await postLayout(
      withPlaneManual(
        { layout, model, plane: activePlane },
        snapshot,
        freezing ? unfoldedNow : undefined,
        freezing ? movedLabels : {},
      ),
    );
    // Freezing's body IS the current on-screen snapshot, so any pending
    // view-mode drags it covers are now saved too — clear the chip. Thawing's
    // body carries no positions at all, so pending drags stay pending; they
    // must NOT be discarded just because the plane went back to automatic.
    if (ok && freezing) {
      setMovedPositions({});
      setMovedLabels({});
    }
  }, [model, layout, activePlane, activePlaneManual, layoutApiRef, postLayout, unfoldedNow, movedLabels]);

  // View mode never persists: merge into the ephemeral preview instead of
  // dispatching a command.
  const previewLayoutSettings = useCallback(
    (patch: Partial<LayoutSettings>) => {
      if (model === undefined) return;
      const key = layoutPlaneKey(model, activePlane);
      setLayoutPreview((p) => mergePreview(p, key, patch));
    },
    [model, activePlane],
  );

  return {
    viewLayout,
    setMovedPositions,
    setMovedLabels,
    savingPositions,
    autoArrange,
    toggleAutoArrange: () => setAutoArrange((v) => !v),
    unsavedView,
    savePositions,
    toggleFreeze,
    previewLayoutSettings,
    planePreviewed: model !== undefined && layoutPreview[layoutPlaneKey(model, activePlane)] !== undefined,
    dropPlanePreview: () =>
      setLayoutPreview((p) => {
        if (model === undefined) return p;
        const next = { ...p };
        delete next[layoutPlaneKey(model, activePlane)];
        return next;
      }),
    dropPreview: () => setLayoutPreview({}),
  };
}
