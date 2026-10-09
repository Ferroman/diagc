// The layout and drawings sidecars kept in step with the model: the helpers that write
// an entry, and the ones that drop entries a command left dead.
import type { DiagramModel, EdgeLabelPlacement, LayoutOverlay, NotePlacement } from '../types';
import { elementKey, type ElementRef } from '../elements';
import { hasNoteContent } from '../comments';
import { relationLabels } from '../labels';
import { defined } from '../util';

/**
 * Drop every node position and unfolded entry (across all planes) and every
 * size entry whose id satisfies `drop` — the layout pruning shared by the commands that
 * destroy nodes (delete-node, and delete-layer's cascade). Identity is preserved
 * as aggressively as possible: an untouched plane bucket keeps its reference,
 * and if nothing at all is dropped the input `layout` is returned unchanged, so
 * layout state unrelated to this command stays referentially stable.
 */
export function prunePositions(layout: LayoutOverlay, drop: (nodeId: string) => boolean): LayoutOverlay {
  let changed = false;
  let planes = layout.planes;
  for (const [key, positions] of Object.entries(planes)) {
    const kept = Object.fromEntries(Object.entries(positions).filter(([nid]) => !drop(nid)));
    if (Object.keys(kept).length === Object.keys(positions).length) continue; // bucket untouched → keep ref
    if (!changed) planes = { ...planes }; // first real change: start the structural copy
    planes[key] = kept;
    changed = true;
  }
  let sizes = layout.sizes;
  if (sizes !== undefined) {
    const kept = Object.fromEntries(Object.entries(sizes).filter(([nid]) => !drop(nid)));
    if (Object.keys(kept).length !== Object.keys(sizes).length) {
      sizes = kept;
      changed = true;
    }
  }
  let next = layout;
  for (const [key, ids] of Object.entries(layout.unfolded ?? {})) {
    const kept = ids.filter((nid) => !drop(nid));
    if (kept.length !== ids.length) next = withUnfolded(next, key, kept);
  }
  if (!changed && next === layout) return layout;
  return { ...next, planes, ...defined({ sizes }) };
}

/**
 * `layout` with the plane's unfolded list replaced. Sorted and de-duplicated so
 * the file does not churn with the order boxes were clicked in; an emptied list
 * is dropped and an emptied map omitted entirely, as set-plane-layout does.
 * Exported because the studio's view-mode save builds the same layout overlay
 * without a command.
 */
export function withUnfolded(layout: LayoutOverlay, key: string, ids: readonly string[]): LayoutOverlay {
  const { unfolded: current = {}, ...rest } = layout;
  const { [key]: _drop, ...others } = current;
  const list = [...new Set(ids)].sort();
  const next = list.length > 0 ? { ...others, [key]: list } : others;
  return Object.keys(next).length > 0 ? { ...rest, unfolded: next } : rest;
}

/**
 * `layout` with viewer label placements merged into the plane's bucket (see
 * LayoutOverlay.edgeLabels). Exported because the studio's view-mode save
 * builds the layout overlay without a command.
 */
export function withEdgeLabelPlacements(
  layout: LayoutOverlay,
  key: string,
  placements: Readonly<Record<string, Readonly<Record<string, EdgeLabelPlacement>>>>,
): LayoutOverlay {
  if (Object.keys(placements).length === 0) return layout;
  const plane = { ...(layout.edgeLabels?.[key] ?? {}) };
  for (const [relationId, labels] of Object.entries(placements))
    plane[relationId] = { ...plane[relationId], ...labels };
  return { ...layout, edgeLabels: { ...(layout.edgeLabels ?? {}), [key]: plane } };
}

/**
 * `layout` with one plane's note bucket replaced, normalised: an entry at the
 * automatic spot that is not open (`{ dx: 0, dy: 0 }`) says nothing and is
 * dropped, then an emptied bucket and an emptied map are omitted, as
 * set-plane-layout does, so a note dragged back and closed leaves no trace in
 * the file.
 */
export function withNoteBucket(
  layout: LayoutOverlay,
  key: string,
  bucket: Record<string, NotePlacement>,
): LayoutOverlay {
  const kept: Record<string, NotePlacement> = {};
  for (const [tk, p] of Object.entries(bucket)) {
    if (p.dx === 0 && p.dy === 0 && p.open !== true) continue;
    kept[tk] = p;
  }
  const { notes: current = {}, ...rest } = layout;
  const { [key]: _drop, ...others } = current;
  const next = Object.keys(kept).length > 0 ? { ...others, [key]: kept } : others;
  return Object.keys(next).length > 0 ? { ...rest, notes: next } : rest;
}

/** one entry rewritten through `f` (absent = automatic, closed) */
export function withNote(
  layout: LayoutOverlay,
  key: string,
  target: ElementRef,
  f: (current: NotePlacement) => NotePlacement,
): LayoutOverlay {
  const tk = elementKey(target);
  const bucket = { ...(layout.notes?.[key] ?? {}) };
  bucket[tk] = f(bucket[tk] ?? { dx: 0, dy: 0 });
  return withNoteBucket(layout, key, bucket);
}

/** `open` set or removed on `p` — never `open: false`, see NotePlacement */
export function withOpen(p: NotePlacement, open: boolean): NotePlacement {
  const { open: _drop, ...rest } = p;
  return open ? { ...rest, open: true } : rest;
}

/**
 * Layout pruning for `notes` after a command changed the model: a note exists
 * only while its element has something to show, so an offset for an element
 * that lost its last threat/comment/link — or was deleted — is dead data.
 * `hasNoteContent` is the renderer's own test for drawing a note; reusing it
 * is what stops a command that merely rewrote `nodes` (a rename, an edited
 * comment) from throwing away a live note's saved place. Identity is kept
 * when nothing is dropped, like pruneEdgeLabels.
 */
export function pruneNotes(layout: LayoutOverlay, before: DiagramModel, after: DiagramModel): LayoutOverlay {
  if (layout.notes === undefined || (before.nodes === after.nodes && before.relations === after.relations))
    return layout;
  const alive = new Set<string>();
  for (const n of after.nodes) if (hasNoteContent(n)) alive.add(elementKey({ node: n.id }));
  for (const r of after.relations) if (hasNoteContent(r)) alive.add(elementKey({ relation: r.id }));
  let changed = false;
  const planes: NonNullable<LayoutOverlay['notes']> = {};
  for (const [key, bucket] of Object.entries(layout.notes)) {
    const kept = Object.fromEntries(Object.entries(bucket).filter(([tk]) => alive.has(tk)));
    if (Object.keys(kept).length !== Object.keys(bucket).length) changed = true;
    if (Object.keys(kept).length > 0) planes[key] = kept;
  }
  if (!changed) return layout;
  const { notes: _drop, ...rest } = layout;
  return Object.keys(planes).length > 0 ? { ...rest, notes: planes } : rest;
}

/**
 * Layout pruning for `edgeLabels` after a command changed the relations: drop
 * the placement of a label that no longer exists (its relation or the label
 * itself is gone), and of one whose position the command just set in the MODEL
 * — a viewer's override must never shadow the document the author is editing,
 * or dragging the label in edit mode would appear to do nothing.
 */
export function pruneEdgeLabels(layout: LayoutOverlay, before: DiagramModel, after: DiagramModel): LayoutOverlay {
  if (layout.edgeLabels === undefined || before.relations === after.relations) return layout;
  const labelsOf = (model: DiagramModel) =>
    new Map(model.relations.map((r) => [r.id, new Map(relationLabels(r).map((l) => [l.id, l] as const))] as const));
  const was = labelsOf(before);
  const now = labelsOf(after);
  let changed = false;
  const planes: NonNullable<LayoutOverlay['edgeLabels']> = {};
  for (const [key, plane] of Object.entries(layout.edgeLabels)) {
    const keptPlane: (typeof planes)[string] = {};
    for (const [relationId, placements] of Object.entries(plane)) {
      const kept = Object.fromEntries(
        Object.entries(placements).filter(([labelId]) => {
          const label = now.get(relationId)?.get(labelId);
          const old = was.get(relationId)?.get(labelId);
          return label !== undefined && (old === undefined || (old.t === label.t && old.side === label.side));
        }),
      );
      if (Object.keys(kept).length !== Object.keys(placements).length) changed = true;
      if (Object.keys(kept).length > 0) keptPlane[relationId] = kept;
    }
    if (Object.keys(keptPlane).length > 0) planes[key] = keptPlane;
  }
  if (!changed) return layout;
  const { edgeLabels: _drop, ...rest } = layout;
  return Object.keys(planes).length > 0 ? { ...rest, edgeLabels: planes } : rest;
}

/**
 * Drop every layout structure keyed by `plane` — its positions bucket, manual
 * flag, layout settings, unfolded list, label placements and note entries: the
 * layout pruning for a deleted plane. An emptied `manual`/`settings` map is
 * omitted entirely, as set-plane-layout and set-layout-settings do. Returns the input `layout` unchanged
 * when `plane` had no layout state at all.
 */
export function prunePlaneLayout(layout: LayoutOverlay, plane: string): LayoutOverlay {
  const hasState =
    plane in layout.planes ||
    (layout.manual !== undefined && plane in layout.manual) ||
    (layout.settings !== undefined && plane in layout.settings) ||
    (layout.unfolded !== undefined && plane in layout.unfolded) ||
    (layout.edgeLabels !== undefined && plane in layout.edgeLabels) ||
    (layout.notes !== undefined && plane in layout.notes);
  if (!hasState) return layout;

  const next: LayoutOverlay = { ...withUnfolded(layout, plane, []), planes: { ...layout.planes } };
  delete next.planes[plane];
  if (layout.manual !== undefined) {
    const { [plane]: _dropManual, ...manualRest } = layout.manual;
    if (Object.keys(manualRest).length > 0) next.manual = manualRest;
    else delete next.manual;
  }
  if (layout.settings !== undefined) {
    const { [plane]: _dropSettings, ...settingsRest } = layout.settings;
    if (Object.keys(settingsRest).length > 0) next.settings = settingsRest;
    else delete next.settings;
  }
  if (layout.edgeLabels !== undefined) {
    const { [plane]: _dropLabels, ...labelsRest } = layout.edgeLabels;
    if (Object.keys(labelsRest).length > 0) next.edgeLabels = labelsRest;
    else delete next.edgeLabels;
  }
  if (layout.notes !== undefined) {
    const { [plane]: _dropNotes, ...notesRest } = layout.notes;
    if (Object.keys(notesRest).length > 0) next.notes = notesRest;
    else delete next.notes;
  }
  return next;
}
