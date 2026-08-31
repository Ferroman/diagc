import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import {
  compileView,
  DEFAULT_IMAGE_NODE_SIZE,
  layoutPlaneKey,
  runsToPlainText,
  type DiagramModel,
  type LayoutOverlay,
  type ViewNode,
} from '@diagramming/core';
import { arrangeActivityFrames } from './activity-frame';
import { estimateLabelSize } from './label-size';
import { layoutView, type EdgePoint, type NodeGeometry } from './layout';
import { EMPTY_ID_SET } from './loop-highlight';
import type { NotationProfile } from './notations';
import { overlayPositions } from './placement';
import { tableSize } from './table-ports';
import type { Registry, TypeStyle } from './registry';

export interface ViewLayoutInput {
  model: DiagramModel;
  plane: string | undefined;
  layout: LayoutOverlay | undefined;     // props.layout
  compiled: ReturnType<typeof compileView>;
  profile: NotationProfile;
  typeRegistry: Registry<TypeStyle>;
  editing: boolean;
  ignoreSavedPositions: boolean | undefined;
  viewPositions: Record<string, { x: number; y: number }>;
}

export interface ViewLayout {
  geometry: Map<string, NodeGeometry> | null;
  geometryRef: MutableRefObject<Map<string, NodeGeometry> | null>;
  routes: Map<string, EdgePoint[]>;
  placedGeometry: Map<string, NodeGeometry> | null;
  // `arrangeActivityFrames` hands back a ReadonlyMap (it returns its input
  // unchanged when the plane has no activity frames), so the band pass narrows
  // the mutability here — same type `Inner` inferred before the extraction.
  arrangedGeometry: ReadonlyMap<string, NodeGeometry> | null;
  bandDisplacedIds: ReadonlySet<string>;
  orthogonal: boolean;
  pinnedIds: Set<string> | undefined;
  layoutSettings: NonNullable<LayoutOverlay['settings']>[string] | undefined;
}

export function useViewLayout(input: ViewLayoutInput): ViewLayout {
  // Per-node size hints: the notation profile can seed a leaf size (e.g. CLD's
  // typeless nodes rendered as text chips); image nodes then overwrite with
  // their own footprint (overlay-resized if present, else a fixed default —
  // the studio seeds real dimensions at creation).
  const sizeHints = useMemo(() => {
    const m = new Map<string, { width: number; height: number }>();
    for (const n of input.model.nodes) {
      const hint = input.profile.node?.leafSize?.(n);
      if (hint !== undefined) m.set(n.id, hint);
    }
    // Registry-declared default sizes (activity dots/bars/diamonds): how
    // fixed-geometry glyphs get real footprints from the DSL, where no palette
    // template seeded dimensions. An explicit resize (overlay sizes) wins.
    for (const n of input.model.nodes) {
      if (n.type === undefined) continue;
      const ds = input.typeRegistry.resolve(n.type).defaultSize;
      if (ds === undefined) continue;
      const s = input.layout?.sizes?.[n.id];
      m.set(n.id, s !== undefined ? { width: s.w, height: s.h } : ds);
    }
    for (const n of input.model.nodes) {
      if (n.image === undefined) continue;
      const s = input.layout?.sizes?.[n.id];
      m.set(n.id, s !== undefined ? { width: s.w, height: s.h } : { width: DEFAULT_IMAGE_NODE_SIZE.w, height: DEFAULT_IMAGE_NODE_SIZE.h });
    }
    // Shape (silhouette) nodes honor their stored size like image nodes; without
    // one they fall through to the label-based estimate.
    for (const n of input.model.nodes) {
      if (n.shape === undefined) continue;
      const s = input.layout?.sizes?.[n.id];
      if (s !== undefined) m.set(n.id, { width: s.w, height: s.h });
    }
    // Multiline/rich leaf box labels: reserve an estimated footprint so elk
    // doesn't overlap neighbors around a taller-than-default box. Image/shape
    // nodes keep their own sizing above, and an explicit resize always wins.
    for (const n of input.model.nodes) {
      if (n.image !== undefined || n.shape !== undefined) continue;
      const plain = n.rich !== undefined ? runsToPlainText(n.rich) : n.name;
      if (n.rich === undefined && !plain.includes('\n')) continue; // single-line plain = default LEAF_SIZE
      if (input.layout?.sizes?.[n.id] !== undefined) continue; // explicit resize wins
      m.set(n.id, estimateLabelSize(plain, n.fontScale));
    }
    // db-table nodes: reserve the intrinsic footprint for the header + all rows
    // so elk lays out the full table, not a default box. Explicit resize wins.
    for (const n of input.model.nodes) {
      if (n.type !== 'db-table' || n.columns === undefined) continue;
      if (input.layout?.sizes?.[n.id] !== undefined) continue; // explicit resize wins
      m.set(n.id, tableSize(n.columns, n.name));
    }
    return m;
  }, [input.model, input.layout, input.profile, input.typeRegistry]);

  // Per-plane automatic-layout settings (algorithm/direction/spacing/edge routing)
  // from the overlay; stable-referenced so a position drag (which rebuilds
  // props.layout) doesn't needlessly re-run elk.
  const layoutSettings = useMemo(
    () => input.layout?.settings?.[layoutPlaneKey(input.model, input.plane)],
    [input.layout, input.model, input.plane],
  );

  const [geometry, setGeometry] = useState<Map<string, NodeGeometry> | null>(null);
  const geometryRef = useRef<Map<string, NodeGeometry> | null>(null);
  geometryRef.current = geometry;
  // elk-routed absolute edge waypoints (only populated when edgeRouting is
  // 'orthogonal'); consumed by the edges memo, falling back to floating paths.
  const [routes, setRoutes] = useState<Map<string, EdgePoint[]>>(() => new Map());
  useEffect(() => {
    let live = true;
    // A notation that owns the arrangement bypasses elk entirely; wrapped in a
    // resolved promise so both paths share the .then/.catch below.
    const notationLayout = input.profile.layout;
    const arrange =
      notationLayout !== undefined
        ? Promise.resolve().then(() => notationLayout(input.compiled, input.model, input.plane, sizeHints))
        : layoutView(input.compiled, sizeHints, layoutSettings);
    void arrange
      .then((r) => {
        if (!live) return;
        setGeometry((old) => (old === r.geometry ? old : r.geometry));
        setRoutes(r.routes);
      })
      // layoutView degrades to the default algorithm rather than rejecting, so
      // getting here via that path means even the degraded attempt failed. A
      // notation's own layout (e.g. git-graph's) has no such fallback — any
      // throw it raises lands here directly. Either way, keep the last
      // arrangement (there is nothing better to draw) but say so — an
      // unhandled rejection here reads on screen as the layout control
      // silently doing nothing.
      .catch((e: unknown) => {
        if (live) console.error('layout failed; keeping the previous arrangement', e);
      });
    return () => {
      live = false;
    };
  }, [input.compiled, sizeHints, layoutSettings, input.profile, input.model, input.plane]);

  // Overlay-applied geometry: elk output with any layout-overlay positions for
  // the active plane substituted in (width/height stay elk's). Derived so the
  // elk cache is never mutated; everything that RENDERS reads this, while the
  // raw `geometry` remains the layout-effect state.
  const placedGeometry = useMemo(() => {
    if (geometry === null) return geometry;
    const key = layoutPlaneKey(input.model, input.plane);
    // Editing always reads the saved overlay: there the positions ARE the
    // document being edited, and the auto/manual switch is a command on the undo
    // stack. Only a viewer may set them aside.
    const saved = !input.editing && input.ignoreSavedPositions === true ? {} : (input.layout?.planes[key] ?? {});
    const withSaved = overlayPositions(geometry, saved);
    // A drag still wins over an automatic arrangement, so moving a box while
    // auto-arrange is on behaves the way dragging always does.
    return input.editing ? withSaved : overlayPositions(withSaved, input.viewPositions);
  }, [geometry, input.layout, input.model, input.plane, input.ignoreSavedPositions, input.editing, input.viewPositions]);

  // Activity frames: normalize lanes into full-width stacked bands. Applied to
  // the OVERLAY-APPLIED geometry (not the elk cache) so hand-drags participate:
  // dragging a node inside a lane grows the band on the next frame.
  const arrangedGeometry = useMemo(
    () =>
      placedGeometry === null
        ? null
        : arrangeActivityFrames(placedGeometry, input.compiled, input.model, input.layout?.sizes),
    [placedGeometry, input.compiled, input.model, input.layout],
  );

  // Ids the band pass above moved off elk's placement (arrangeActivityFrames
  // overrides lanes' x/y/w/h and frames' w/h AFTER elk already routed against
  // the pre-band positions) — the exact same kind of staleness a manual drag
  // causes for `pinnedIds` below, so these ids must join that same set (see
  // its comment: the git-lane-drag precedent this mirrors). `arrangeActivityFrames`
  // only `out.set()`s an id it actually changed, so "displaced" is precisely
  // "its arranged geometry object is not the placed one" (reference
  // inequality, not a value comparison). The `===` shortcut makes this empty
  // and free to compute when there are no activity frames on the plane at all
  // (arrangeActivityFrames then returns the same map back, unchanged).
  const bandDisplacedIds = useMemo(() => {
    if (arrangedGeometry === null || placedGeometry === null || arrangedGeometry === placedGeometry) {
      return EMPTY_ID_SET;
    }
    const displaced = new Set<string>();
    for (const [id, g] of arrangedGeometry) {
      if (placedGeometry.get(id) !== g) displaced.add(id);
    }
    return displaced;
  }, [arrangedGeometry, placedGeometry]);

  // Orthogonal routing is a per-plane setting — or the notation's own layout,
  // whose routes are the drawing (a git link has no floating form worth showing).
  // Endpoints whose position is manually overridden (saved pins, or ephemeral
  // view-mode drags) have a stale precomputed route, so those edges fall back
  // to floating paths. `bandDisplacedIds` joins the same set for the same
  // reason: the activity band pass overrides lane/frame geometry after elk
  // ran, exactly as a drag overrides it afterward by hand. A pinned id can
  // also be a CONTAINER (e.g. a dragged git lane, or a band-displaced activity
  // lane) — moving it moves every descendant along with it, so their routes
  // are just as stale even though only the container's own id was pinned. Walk
  // the compiled tree once to expand each pinned id to its whole subtree: an
  // endpoint counts as pinned when it, or any ancestor, is. Kept as a small memo
  // apart from the edges list itself so a plane/layout change alone doesn't
  // force the whole edge-data rebuild.
  const orthogonal = layoutSettings?.edgeRouting === 'orthogonal' || input.profile.layout !== undefined;
  const pinnedIds = useMemo(() => {
    if (!orthogonal) return undefined;
    const rawPinned = new Set<string>([
      ...Object.keys(input.layout?.planes[layoutPlaneKey(input.model, input.plane)] ?? {}),
      ...(input.editing ? [] : Object.keys(input.viewPositions)),
      ...bandDisplacedIds,
    ]);
    const expanded = new Set<string>();
    const walk = (n: ViewNode, ancestorPinned: boolean) => {
      const pinned = ancestorPinned || rawPinned.has(n.id);
      if (pinned) expanded.add(n.id);
      n.children.forEach((c) => walk(c, pinned));
    };
    input.compiled.roots.forEach((r) => walk(r, false));
    return expanded;
  }, [orthogonal, input.layout, input.model, input.plane, input.editing, input.viewPositions, input.compiled, bandDisplacedIds]);

  return {
    geometry,
    geometryRef,
    routes,
    placedGeometry,
    arrangedGeometry,
    bandDisplacedIds,
    orthogonal,
    pinnedIds,
    layoutSettings,
  };
}
