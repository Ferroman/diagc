import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import {
  compileView,
  DEFAULT_IMAGE_NODE_SIZE,
  defaultLayoutDirection,
  layoutPlaneKey,
  runsToPlainText,
  type DiagramModel,
  type LayoutOverlay,
  type ViewNode,
} from '@diagramming/core';
import { arrangeActivityFrames } from './activity-frame';
import { withBoxSizes } from './box-size';
import { fitContainers, type ContainerFit, type Shift } from './fit-containers';
import { CAPTION_HEIGHT, captionWidth, estimateLabelSize } from './label-size';
import { layoutView, type EdgePoint, type NodeGeometry } from './layout';
import { containerPad, DEFAULT_ALGORITHM, FALLBACK_DIRECTION, type SizeHint } from './layout-graph';
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
  /** metadata keys drawn as node badges — they widen the box elk must reserve */
  metaKeys: readonly string[];
  /** hidden-descendant count per folded container (the number in its badge) */
  hiddenCounts: ReadonlyMap<string, number>;
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
  /** containers whose origin the fit pass moved (they grew left/up around a
   * hand-placed child) — what a saved position has to be corrected by; see
   * fit-containers.ts */
  containerShifts: ReadonlyMap<string, Shift>;
  /** how this plane's routed edges are drawn; undefined ⇒ every edge floats */
  routing: EdgeRouting | undefined;
  /** where the LAYOUT put each node (absolute top-left), before any saved
   * position, drag or band pass moved it: a route is only good while both of
   * its endpoints still stand there (see DiagramEdge) */
  laidAt: ReadonlyMap<string, EdgePoint>;
  /** elk's reserved spot (centre) for each labelled edge's label */
  labelSpots: ReadonlyMap<string, EdgePoint>;
  layoutSettings: NonNullable<LayoutOverlay['settings']>[string] | undefined;
}

const NO_SHIFTS: ReadonlyMap<string, Shift> = new Map();
const NO_SPOTS: ReadonlyMap<string, EdgePoint> = new Map();

/** How a routed edge's corners are drawn (px radius). The waypoints are elk's
 * either way; `curved` rounds them generously so a route reads as a drawn line
 * rather than plumbing, `orthogonal` keeps them tight. */
export interface EdgeRouting {
  corner: number;
}
export const SOFT_CORNER = 28;
export const SHARP_CORNER = 8;

export function useViewLayout(input: ViewLayoutInput): ViewLayout {
  // Per-node size hints: the notation profile can seed a leaf size (e.g. CLD's
  // typeless nodes rendered as text chips); image nodes then overwrite with
  // their own footprint (overlay-resized if present, else a fixed default —
  // the studio seeds real dimensions at creation).
  const sizeHints = useMemo(() => {
    const m = new Map<string, SizeHint>();
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
      // cornerBadge types draw the image as container chrome and the label
      // inside the box — no spilling caption to reserve room for
      if (n.type !== undefined && input.typeRegistry.resolve(n.type).cornerBadge === true) continue;
      const s = input.layout?.sizes?.[n.id];
      const base = s !== undefined ? { width: s.w, height: s.h } : { width: DEFAULT_IMAGE_NODE_SIZE.w, height: DEFAULT_IMAGE_NODE_SIZE.h };
      // Reserve the caption's width (it hangs below, centered, one line): the
      // icon letterboxes inside the wider box (object-fit: contain), so this
      // widens the footprint without distorting the artwork. Its HEIGHT cannot
      // be had the same way — a taller box would shrink the icon — so that strip
      // is reserved in the layout only and never drawn (SizeHint.reserveBottom).
      const caption = n.name ?? n.id;
      m.set(n.id, {
        ...base,
        width: Math.max(base.width, captionWidth(caption)),
        ...(caption !== '' ? { reserveBottom: CAPTION_HEIGHT } : {}),
      });
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

  // The model-keyed hints above cannot know a node's VIEW state, and an ordinary
  // box's footprint depends on it (a folded container is a titled box with a
  // count badge; an unfolded one is sized by elk). So the box estimates are laid
  // over them per compiled view — see withBoxSizes for what it leaves alone.
  //
  // Skipped when the notation owns the arrangement: git-graph reads these hints
  // itself and spaces its lanes off `LEAF_SIZE` for anything unhinted.
  //
  // `metaKeys` is compared by content: a host passing a fresh array literal each
  // render must not re-run elk each render.
  const metaKeysKey = input.metaKeys.join('\u0000');
  const sizes = useMemo(
    () =>
      input.profile.layout !== undefined
        ? sizeHints
        : withBoxSizes(input.compiled.roots, sizeHints, {
            typeRegistry: input.typeRegistry,
            metaKeys: input.metaKeys,
            hiddenCounts: input.hiddenCounts,
            ...(input.profile.node?.leafSize !== undefined ? { leafSize: input.profile.node.leafSize } : {}),
          }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- input.metaKeys is tracked through metaKeysKey (see above)
    [sizeHints, input.compiled, input.profile, input.typeRegistry, metaKeysKey, input.hiddenCounts],
  );

  // Per-plane automatic-layout settings (algorithm/direction/spacing/edge routing)
  // from the overlay; stable-referenced so a position drag (which rebuilds
  // props.layout) doesn't needlessly re-run elk.
  const layoutSettings = useMemo(
    () => input.layout?.settings?.[layoutPlaneKey(input.model, input.plane)],
    [input.layout, input.model, input.plane],
  );

  // What the layout actually runs with: the plane's settings, with the MODEL's
  // default direction resolved in where they name none (down — or right for an
  // activity model, whose lanes are horizontal bands). Kept apart from
  // `layoutSettings` so callers still see exactly what the sidecar says, and
  // keyed on the direction string so an edit (a new model object) does not by
  // itself re-run the layout.
  const modelDirection = defaultLayoutDirection(input.model);
  const runSettings = useMemo(
    () =>
      layoutSettings?.direction !== undefined || modelDirection === FALLBACK_DIRECTION
        ? layoutSettings
        : { ...layoutSettings, direction: modelDirection },
    [layoutSettings, modelDirection],
  );

  const [geometry, setGeometry] = useState<Map<string, NodeGeometry> | null>(null);
  const geometryRef = useRef<Map<string, NodeGeometry> | null>(null);
  geometryRef.current = geometry;
  // elk-routed absolute edge waypoints (only populated when edgeRouting is
  // 'orthogonal'); consumed by the edges memo, falling back to floating paths.
  const [routes, setRoutes] = useState<Map<string, EdgePoint[]>>(() => new Map());
  const [labelSpots, setLabelSpots] = useState<ReadonlyMap<string, EdgePoint>>(NO_SPOTS);
  useEffect(() => {
    let live = true;
    // A notation that owns the arrangement bypasses elk entirely; wrapped in a
    // resolved promise so both paths share the .then/.catch below.
    const notationLayout = input.profile.layout;
    const arrange =
      notationLayout !== undefined
        ? Promise.resolve().then(() => notationLayout(input.compiled, input.model, input.plane, sizes))
        : layoutView(input.compiled, sizes, runSettings);
    void arrange
      .then((r) => {
        if (!live) return;
        setGeometry((old) => (old === r.geometry ? old : r.geometry));
        setRoutes(r.routes);
        setLabelSpots(r.labelSpots);
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
  }, [input.compiled, sizes, runSettings, input.profile, input.model, input.plane]);

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

  // A hand-placed child may sit past the wall of the box elk sized for it: the
  // container gives way (fit-containers.ts). Not where the notation owns the
  // arrangement (a git lane is a row the layout sizes itself), and not for
  // activity lanes and frames, which the band pass below grows instead.
  const fitted = useMemo((): ContainerFit<NodeGeometry> | null => {
    if (placedGeometry === null) return null;
    if (input.profile.layout !== undefined) return { geometry: placedGeometry, shifts: NO_SHIFTS };
    return fitContainers(placedGeometry, input.compiled.roots, containerPad, (n) =>
      n.node.type === 'activity-lane' || n.node.type === 'activity-frame',
    );
  }, [placedGeometry, input.compiled, input.profile]);

  // Activity frames: normalize lanes into full-width stacked bands. Applied to
  // the OVERLAY-APPLIED geometry (not the elk cache) so hand-drags participate:
  // dragging a node inside a lane grows the band on the next frame.
  const arrangedGeometry = useMemo(
    () =>
      fitted === null ? null : arrangeActivityFrames(fitted.geometry, input.compiled, input.model, input.layout?.sizes),
    [fitted, input.compiled, input.model, input.layout],
  );

  // Routes are elk's (or the notation's own), computed for the arrangement the
  // LAYOUT produced. Anything that moves a node afterwards — a saved position,
  // a view-mode drag, a nudge in flight, the activity band pass, an ancestor
  // that was dragged — leaves its edges' routes pointing at where it used to be.
  // Rather than enumerate those causes, record where the layout put every node
  // and let each edge compare: it draws its route only while both endpoints
  // still stand there, and floats otherwise (DiagramEdge). That also holds
  // mid-drag, before anything is committed.
  const laidAt = useMemo(() => {
    const at = new Map<string, EdgePoint>();
    if (geometry === null) return at;
    const walk = (n: ViewNode, ox: number, oy: number) => {
      const g = geometry.get(n.id);
      if (g === undefined) return;
      at.set(n.id, { x: ox + g.x, y: oy + g.y });
      n.children.forEach((c) => walk(c, ox + g.x, oy + g.y));
    };
    input.compiled.roots.forEach((r) => walk(r, 0, 0));
    return at;
  }, [geometry, input.compiled]);

  // Which planes draw routes at all. A notation's own layout: its routes ARE
  // the drawing (a git link has no floating form worth showing). Otherwise
  // `layered` routes every edge, and a notation that bows its edges (causal
  // loops: the arc is the notation) keeps floating them.
  const routing = useMemo((): EdgeRouting | undefined => {
    if (input.profile.layout !== undefined) return { corner: SHARP_CORNER };
    if (layoutSettings?.edgeRouting === 'orthogonal') return { corner: SHARP_CORNER };
    if (input.profile.edge?.bowed === true) return undefined;
    return (layoutSettings?.algorithm ?? DEFAULT_ALGORITHM) === DEFAULT_ALGORITHM ? { corner: SOFT_CORNER } : undefined;
  }, [input.profile, layoutSettings]);

  return {
    geometry,
    geometryRef,
    routes,
    placedGeometry,
    arrangedGeometry,
    containerShifts: fitted?.shifts ?? NO_SHIFTS,
    routing,
    laidAt,
    labelSpots,
    layoutSettings,
  };
}
