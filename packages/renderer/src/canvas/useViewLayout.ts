import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import {
  compileView,
  defaultLayoutDirection,
  isActivityBand,
  layoutPlaneKey,
  type DiagramModel,
  type LayoutDirection,
  type LayoutOverlay,
  type LayoutSettings,
  type Point,
  type ViewNode,
} from '@diagc/core/internal';
import { arrangeActivityFrames, laneAxisOf, withLaneOrder } from '../layout/activity-frame';
import { withBoxSizes } from '../layout/box-size';
import { fitContainers, type ContainerFit, type Shift } from '../layout/fit-containers';
import { layoutView, type NodeGeometry } from '../layout/layout';
import { captionsOf, containerPad, DEFAULT_ALGORITHM, FALLBACK_DIRECTION, type SizeHint } from '../layout/layout-graph';
import { sizeHintsOf } from '../layout/size-hints';
import {
  arrangeStateMachines,
  regionSeparators,
  withZoneOrder,
  type RegionSeparator,
} from '../layout/state-machine-layout';
import type { NotationProfile } from '../notations';
import { overlayPositions } from './placement';
import { withShownTableRows } from '../node/table-ports';
import type { Registry, TypeStyle } from '../registry';
import { PLAN_LAYOUT } from '../layout/plan-layout';

export interface ViewLayoutInput {
  model: DiagramModel;
  plane: string | undefined;
  layout: LayoutOverlay | undefined; // props.layout
  compiled: ReturnType<typeof compileView>;
  profile: NotationProfile;
  typeRegistry: Registry<TypeStyle>;
  /** metadata keys drawn as node badges — they widen the box elk must reserve */
  metaKeys: readonly string[];
  /** hidden-descendant count per folded container (the number in its badge) */
  hiddenCounts: ReadonlyMap<string, number>;
  editing: boolean;
  ignoreSavedPositions: boolean | undefined;
  viewPositions: Record<string, Point>;
  /** the drilled container, handed to a notation's own layout */
  drillRoot?: string | undefined;
  /** px per day, handed to a notation that stretches time (undefined otherwise) */
  dayWidth?: number | undefined;
  /** the plan's hidden actors: the layout measures title bands with the chips drawn */
  hidden?: ReadonlySet<string>;
  /** a still export: a notation's layout measures its boxes without the affordances */
  chromeless?: boolean;
}

export interface ViewLayout {
  geometry: Map<string, NodeGeometry> | null;
  geometryRef: MutableRefObject<Map<string, NodeGeometry> | null>;
  routes: Map<string, Point[]>;
  placedGeometry: Map<string, NodeGeometry> | null;
  // `arrangeActivityFrames` hands back a ReadonlyMap (it returns its input
  // unchanged when the plane has no activity frames), so the band pass narrows
  // the mutability here, to the type `Inner` reads.
  arrangedGeometry: ReadonlyMap<string, NodeGeometry> | null;
  /** state-machine regions that draw a dashed leading edge (see
   * state-machine-layout.ts); empty without stacked regions */
  regionSeparators: ReadonlyMap<string, RegionSeparator>;
  /** containers whose origin the fit pass moved (they grew left/up around a
   * hand-placed child) — what a saved position has to be corrected by; see
   * fit-containers.ts */
  containerShifts: ReadonlyMap<string, Shift>;
  /** how this plane's routed edges are drawn; undefined ⇒ every edge floats */
  routing: EdgeRouting | undefined;
  /** where the LAYOUT put each node (absolute top-left), before any saved
   * position, drag or band pass moved it: a route is only good while both of
   * its endpoints still stand there (see useEdgePath) */
  laidAt: ReadonlyMap<string, Point>;
  /** elk's reserved spot (centre) for each labelled edge's label */
  labelSpots: ReadonlyMap<string, Point>;
  /** nodes the notation's layout fixed in place (LayoutResult.fixed): drawn
   * where they were laid whatever was saved, and not to be offered a move */
  fixed: ReadonlySet<string>;
  /** nodes the notation's layout locked on x (LayoutResult.lockedX): a saved
   * or dragged position moves them on y only */
  lockedX: ReadonlySet<string>;
  /** the layout's view-only y shifts (LayoutResult.viewShift), already in
   * `placedGeometry`; a committed move takes them back off */
  viewShift: ReadonlyMap<string, number>;
  /** the layout's drill frames (LayoutResult.savedFrame), already in the
   * geometry; a committed move takes them back off */
  savedFrame: ReadonlyMap<string, Point>;
  /** the scene the last FINISHED layout run was for; null before the first.
   * Layout is asynchronous and the previous arrangement is kept meanwhile, so
   * right after the scene changes `arrangedGeometry` is non-null and the OLD
   * scene's — whatever must act on the scene's own arrangement (a fit) waits
   * for this to name the `compiled` it holds. A run that failed counts: there
   * is nothing better coming, and a waiter must not wait forever. */
  settledFor: ReturnType<typeof compileView> | null;
  /** the day width the last finished run laid out at (a notation that
   * stretches time), so a fit can wait for the width a drill lands on */
  settledWidth: number | undefined;
  layoutSettings: NonNullable<LayoutOverlay['settings']>[string] | undefined;
  /** the direction a layered run uses — the sidecar's, else the model's, else
   * the default (git-graph never runs elk, so this is not what it drew) */
  flowDirection: LayoutDirection;
}

const NO_SHIFTS: ReadonlyMap<string, Shift> = new Map();
const NO_SPOTS: ReadonlyMap<string, Point> = new Map();
const NONE_FIXED: ReadonlySet<string> = new Set();
const NO_VIEW_SHIFT: ReadonlyMap<string, number> = new Map();
const NO_FRAMES: ReadonlyMap<string, Point> = new Map();

/** `geometry` with each shifted node moved by its dy; the same map back when
 * nothing shifts, so the memos downstream keep their input */
function withViewShift(
  geometry: Map<string, NodeGeometry>,
  viewShift: ReadonlyMap<string, number>,
): Map<string, NodeGeometry> {
  if (viewShift.size === 0) return geometry;
  const out = new Map(geometry);
  for (const [id, dy] of viewShift) {
    const g = out.get(id);
    if (g !== undefined) out.set(id, { ...g, y: g.y + dy });
  }
  return out;
}

/** `positions` without the fixed ids; the same object back when none applies,
 * so the memo below keeps its identity on the planes that fix nothing */
function movable(positions: Record<string, Point>, fixed: ReadonlySet<string>): Record<string, Point> {
  if (fixed.size === 0 || !Object.keys(positions).some((id) => fixed.has(id))) return positions;
  return Object.fromEntries(Object.entries(positions).filter(([id]) => !fixed.has(id)));
}

/** Saved positions as drawn: a stretched plan keeps every saved x at
 * `PLAN_LAYOUT.DAY` px a day (saved-frame.ts), so a box saved there keeps its
 * day at the width the layout drew; the same object back at 20. */
function drawnAt(positions: Record<string, Point>, dayWidth: number | undefined): Record<string, Point> {
  if (dayWidth === undefined || dayWidth === PLAN_LAYOUT.DAY) return positions;
  const k = dayWidth / PLAN_LAYOUT.DAY;
  return Object.fromEntries(Object.entries(positions).map(([id, p]) => [id, { x: p.x * k, y: p.y }]));
}

/** `positions` with the x of every locked id replaced by the arranged x, so
 * overlayPositions can apply them as usual and only y takes effect. */
function yOnly(
  positions: Record<string, Point>,
  lockedX: ReadonlySet<string>,
  arranged: ReadonlyMap<string, { x: number }>,
): Record<string, Point> {
  if (lockedX.size === 0 || !Object.keys(positions).some((id) => lockedX.has(id))) return positions;
  return Object.fromEntries(
    Object.entries(positions).map(([id, pos]) => {
      const g = lockedX.has(id) ? arranged.get(id) : undefined;
      return [id, g !== undefined ? { x: g.x, y: pos.y } : pos];
    }),
  );
}

/** The arranged geometry with the saved positions laid over it, then a view
 * drag (outside edit mode), then the fold shift — what everything RENDERS. */
function placeSaved(
  p: {
    geometry: Map<string, NodeGeometry> | null;
    fixed: ReadonlySet<string>;
    lockedX: ReadonlySet<string>;
    viewShift: ReadonlyMap<string, number>;
    saved: Record<string, Point>;
    /** the width the geometry's days were laid out at (a stretched plan) */
    dayWidth: number | undefined;
  },
  { editing, viewPositions }: { editing: boolean; viewPositions: Record<string, Point> },
): Map<string, NodeGeometry> | null {
  const { geometry, fixed, lockedX, viewShift, saved, dayWidth } = p;
  if (geometry === null) return geometry;
  // A fixed node reads no position from anywhere. Filtered HERE, not only at
  // the gesture: a saved position can predate the rule (a fish dragged before its nodes
  // were fixed), or arrive with a node that was placed as a stray and hung on
  // the fish afterwards — either would leave it behind when the fish next
  // changes shape, its lines floating in to a box they were never drawn to.
  // (`saved` itself is the same value a notation's own layout may have just
  // read and clamped — see `layoutPositions` above; a fixed id here is a
  // node the layout placed itself, so movable() still drops it.)
  const withSaved = overlayPositions(geometry, yOnly(drawnAt(movable(saved, fixed), dayWidth), lockedX, geometry));
  // A drag still wins over an automatic arrangement, so moving a box while
  // auto-arrange is on behaves the way dragging always does.
  const placed = editing
    ? withSaved
    : overlayPositions(withSaved, yOnly(drawnAt(movable(viewPositions, fixed), dayWidth), lockedX, geometry));
  // last: the shift moves a node from wherever it was saved or dragged to
  return withViewShift(placed, viewShift);
}

/** How a routed edge's corners are drawn (px radius). The waypoints are elk's
 * either way; `curved` rounds them generously so a route reads as a drawn line
 * rather than plumbing, `orthogonal` keeps them tight. */
export interface EdgeRouting {
  corner: number;
}
export const SOFT_CORNER = 28;
export const SHARP_CORNER = 8;

/** What the layout runs with: the plane's settings, with the model's default
 * direction and the notation's algorithm resolved in where they name none. A
 * partitioned notation runs layered whatever the settings name: partitions are a
 * layered feature, another algorithm would ignore them, and the bands would be
 * drawn over an arrangement that knows nothing of them. */
function runSettingsOf(
  layoutSettings: LayoutSettings | undefined,
  notation: { modelDirection: LayoutDirection; partitioned: boolean; notationAlgorithm: string | undefined },
): LayoutSettings | undefined {
  const { modelDirection, partitioned, notationAlgorithm } = notation;
  const directed =
    layoutSettings?.direction !== undefined || modelDirection === FALLBACK_DIRECTION
      ? layoutSettings
      : { ...layoutSettings, direction: modelDirection };
  const resolved =
    notationAlgorithm === undefined || directed?.algorithm !== undefined
      ? directed
      : { ...directed, algorithm: notationAlgorithm };
  if (!partitioned || resolved?.algorithm === undefined) return resolved;
  const { algorithm: _layeredOnly, ...rest } = resolved;
  return rest;
}

/** where the layout put every node, absolute top-left */
function laidAtOf(geometry: ReadonlyMap<string, NodeGeometry> | null, roots: readonly ViewNode[]): Map<string, Point> {
  const at = new Map<string, Point>();
  if (geometry === null) return at;
  const walk = (n: ViewNode, ox: number, oy: number) => {
    const g = geometry.get(n.id);
    if (g === undefined) return;
    at.set(n.id, { x: ox + g.x, y: oy + g.y });
    n.children.forEach((c) => walk(c, ox + g.x, oy + g.y));
  };
  roots.forEach((r) => walk(r, 0, 0));
  return at;
}

/** Which planes draw routes at all. A notation's own layout: its routes ARE the
 * drawing (a git link has no floating form worth showing). Otherwise `layered`
 * routes every edge, and a notation that bows its edges (causal loops: the arc
 * is the notation) keeps floating them. */
function routingOf(
  profile: NotationProfile,
  layoutSettings: LayoutSettings | undefined,
  runSettings: LayoutSettings | undefined,
): EdgeRouting | undefined {
  if (profile.layout !== undefined) return { corner: SHARP_CORNER };
  if (layoutSettings?.edgeRouting === 'orthogonal') return { corner: SHARP_CORNER };
  if (profile.edge?.bowed === true) return undefined;
  return (runSettings?.algorithm ?? DEFAULT_ALGORITHM) === DEFAULT_ALGORITHM ? { corner: SOFT_CORNER } : undefined;
}

interface LayoutRunInput {
  compiled: ReturnType<typeof compileView>;
  /** the view elk lays out (lanes in band order) */
  laidView: ReturnType<typeof compileView>;
  sizes: ReadonlyMap<string, SizeHint>;
  runSettings: LayoutSettings | undefined;
  profile: NotationProfile;
  model: DiagramModel;
  plane: string | undefined;
  partitions: ReadonlyMap<string, number> | undefined;
  layoutPositions: Record<string, Point> | undefined;
  drillRoot: string | undefined;
  dayWidth: number | undefined;
  hidden: ReadonlySet<string> | undefined;
  chromeless: boolean;
}

type LayoutRun = Pick<
  ViewLayout,
  | 'geometry'
  | 'geometryRef'
  | 'routes'
  | 'labelSpots'
  | 'fixed'
  | 'lockedX'
  | 'viewShift'
  | 'savedFrame'
  | 'settledFor'
  | 'settledWidth'
>;

/** The asynchronous layout run, and what its last finished run produced. */
function useLayoutRun(run: LayoutRunInput): LayoutRun {
  const [geometry, setGeometry] = useState<Map<string, NodeGeometry> | null>(null);
  const geometryRef = useRef<Map<string, NodeGeometry> | null>(null);
  geometryRef.current = geometry;
  // elk-routed absolute edge waypoints (only populated when edgeRouting is
  // 'orthogonal'); consumed by the edges memo, falling back to floating paths.
  const [routes, setRoutes] = useState<Map<string, Point[]>>(() => new Map());
  const [labelSpots, setLabelSpots] = useState<ReadonlyMap<string, Point>>(NO_SPOTS);
  const [fixed, setFixed] = useState<ReadonlySet<string>>(NONE_FIXED);
  const [lockedX, setLockedX] = useState<ReadonlySet<string>>(NONE_FIXED);
  const [viewShift, setViewShift] = useState<ReadonlyMap<string, number>>(NO_VIEW_SHIFT);
  const [savedFrame, setSavedFrame] = useState<ReadonlyMap<string, Point>>(NO_FRAMES);
  const [settledFor, setSettledFor] = useState<ViewLayout['settledFor']>(null);
  const [settledWidth, setSettledWidth] = useState<number | undefined>(undefined);
  useEffect(() => {
    let live = true;
    // A notation that owns the arrangement bypasses elk entirely; wrapped in a
    // resolved promise so both paths share the .then/.catch below.
    const notationLayout = run.profile.layout;
    const arrange =
      notationLayout !== undefined
        ? Promise.resolve().then(() =>
            notationLayout({
              view: run.compiled,
              model: run.model,
              plane: run.plane,
              sizeHints: run.sizes,
              positions: run.layoutPositions,
              ...(run.drillRoot !== undefined ? { root: run.drillRoot } : {}),
              ...(run.dayWidth !== undefined ? { dayWidth: run.dayWidth } : {}),
              ...(run.hidden !== undefined ? { hidden: run.hidden } : {}),
              ...(run.chromeless ? { chromeless: true } : {}),
            }),
          )
        : layoutView(
            run.laidView,
            run.sizes,
            run.runSettings,
            run.partitions !== undefined ? { partitions: run.partitions } : undefined,
          );
    void arrange
      .then((r) => {
        if (!live) return;
        setGeometry((old) => (old === r.geometry ? old : r.geometry));
        setRoutes(r.routes);
        setLabelSpots(r.labelSpots);
        setFixed(r.fixed ?? NONE_FIXED);
        setLockedX(r.lockedX ?? NONE_FIXED);
        setViewShift(r.viewShift ?? NO_VIEW_SHIFT);
        setSavedFrame(r.savedFrame ?? NO_FRAMES);
        setSettledWidth(run.dayWidth);
        setSettledFor(run.compiled);
      })
      // layoutView degrades to the default algorithm rather than rejecting, so
      // getting here via that path means even the degraded attempt failed. A
      // notation's own layout (e.g. git-graph's) has no such fallback — any
      // throw it raises lands here directly. Either way, keep the last
      // arrangement (there is nothing better to draw) but say so — an
      // unhandled rejection here reads on screen as the layout control
      // silently doing nothing.
      .catch((e: unknown) => {
        if (!live) return;
        console.error('layout failed; keeping the previous arrangement', e);
        setSettledFor(run.compiled);
      });
    return () => {
      live = false;
    };
  }, [
    run.compiled,
    run.laidView,
    run.sizes,
    run.runSettings,
    run.profile,
    run.model,
    run.plane,
    run.partitions,
    run.layoutPositions,
    run.drillRoot,
    run.dayWidth,
    run.hidden,
    run.chromeless,
  ]);

  return { geometry, geometryRef, routes, labelSpots, fixed, lockedX, viewShift, savedFrame, settledFor, settledWidth };
}

/**
 * Activity frames: normalize lanes into stacked bands as long as the frame.
 * Applied to the OVERLAY-APPLIED geometry (not the elk cache) so hand-drags
 * participate: dragging a node inside a lane grows the band on the next frame.
 * Then a state machine's regions are stacked across the flow the layout ran in,
 * and its entry and exit points put on their composites' borders.
 */
function arrangeChrome(
  geometry: ReadonlyMap<string, NodeGeometry>,
  input: ViewLayoutInput,
  direction: LayoutDirection,
  sizes: ReadonlyMap<string, SizeHint>,
): ReadonlyMap<string, NodeGeometry> {
  const banded = arrangeActivityFrames(geometry, input.compiled, input.model, {
    plane: input.plane,
    sizes: input.layout?.sizes,
    axis: laneAxisOf(direction),
    captions: captionsOf(sizes),
  });
  return arrangeStateMachines(banded, input.compiled, input.model, { plane: input.plane, direction });
}

/** Does the plane's layout flow down (or up) the page: its saved direction, else the model's default. */
function flowsDownOf(input: ViewLayoutInput): boolean {
  const saved = input.layout?.settings?.[layoutPlaneKey(input.model, input.plane)]?.direction;
  return laneAxisOf(saved ?? defaultLayoutDirection(input.model)) === 'columns';
}

export function useViewLayout(input: ViewLayoutInput): ViewLayout {
  // Per-node size hints, before the view state is known (size-hints.ts). Keyed
  // on the whole overlay, so a committed drag recomputes them and the layout run
  // follows: layoutView's cache spares elk the work, and a notation's own layout
  // runs again.
  const flowsDown = flowsDownOf(input);
  const sizeHints = useMemo(
    () =>
      sizeHintsOf(input.model, {
        profile: input.profile,
        typeRegistry: input.typeRegistry,
        sizes: input.layout?.sizes,
        flowsDown,
      }),
    [input.model, input.layout, input.profile, input.typeRegistry, flowsDown],
  );

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
  // The sizes map alone, not the whole overlay: a position drag rebuilds the
  // overlay but keeps its `sizes`.
  const fixedSizes = input.layout?.sizes;
  const sizes = useMemo(
    () =>
      withShownTableRows(
        input.compiled.roots,
        input.profile.layout !== undefined
          ? sizeHints
          : withBoxSizes(input.compiled.roots, sizeHints, {
              typeRegistry: input.typeRegistry,
              metaKeys: input.metaKeys,
              hiddenCounts: input.hiddenCounts,
              leafSize: input.profile.node?.leafSize,
            }),
        fixedSizes,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- input.metaKeys is tracked through metaKeysKey (see above)
    [sizeHints, input.compiled, input.profile, input.typeRegistry, metaKeysKey, input.hiddenCounts, fixedSizes],
  );

  // Per-plane automatic-layout settings (algorithm/direction/spacing/edge routing)
  // from the overlay; stable-referenced so a position drag (which rebuilds
  // props.layout) doesn't needlessly re-run elk.
  const layoutSettings = useMemo(
    () => input.layout?.settings?.[layoutPlaneKey(input.model, input.plane)],
    [input.layout, input.model, input.plane],
  );

  // What the layout actually runs with: the plane's settings, with the MODEL's
  // default direction resolved in where they name none (down). Kept apart from
  // `layoutSettings` so callers still see exactly what the sidecar says, and
  // keyed on the direction string so an edit (a new model object) does not by
  // itself re-run the layout.
  const modelDirection = defaultLayoutDirection(input.model);
  const partitioned = input.profile.partitionOf !== undefined;
  const notationAlgorithm = input.profile.defaultAlgorithm;
  const runSettings = useMemo(
    () => runSettingsOf(layoutSettings, { modelDirection, partitioned, notationAlgorithm }),
    [layoutSettings, modelDirection, partitioned, notationAlgorithm],
  );

  // What a partitioned notation derives for its nodes (second-order thinking's
  // consequence order): forces one layered run so every band lines up, whatever
  // algorithm the sidecar names (see `runSettings` above).
  const partitions = useMemo(
    () => input.profile.partitionOf?.(input.model, input.plane),
    [input.profile, input.model, input.plane],
  );

  // The plane's saved positions (parent-relative for a nested node), gated as
  // placedGeometry applies them: a viewer who asked to ignore them sees none,
  // editing always reads the document. Kept apart from placedGeometry (below)
  // so a notation that owns its arrangement can read the same value — see
  // `layoutPositions` next.
  const saved = useMemo(() => {
    if (!input.editing && input.ignoreSavedPositions === true) return {};
    const key = layoutPlaneKey(input.model, input.plane);
    return input.layout?.planes[key] ?? {};
  }, [input.layout, input.model, input.plane, input.ignoreSavedPositions, input.editing]);

  // What a notation's own layout is handed as `positions` (NotationProfile.layout):
  // `saved` only when the profile opts in with `layoutReadsPositions` (the plan
  // does: it clamps a zone child's saved spot on read — see plan-layout.ts),
  // else a STABLE `undefined` — same object identity, the JS primitive, every
  // render — so this entry in the effect's deps below never, by itself, makes a
  // layout that does NOT read positions (elk, but also git-graph's and fishbone's own
  // arrangements, which never look at `positions`) re-run just because a drag
  // rebuilt `input.layout` (and, with it, `saved`); see the `layoutSettings`
  // rationale above for the sibling problem this mirrors. Gating on the flag
  // rather than on `profile.layout !== undefined` matters precisely because
  // most notation layouts ARE defined but never read `positions`.
  const layoutPositions = useMemo(
    () => (input.profile.layoutReadsPositions === true ? saved : undefined),
    [input.profile, saved],
  );

  const laidView = useMemo(
    () => withZoneOrder(withLaneOrder(input.compiled, input.model, input.plane), input.model, input.plane),
    [input.compiled, input.model, input.plane],
  );
  const { geometry, geometryRef, routes, labelSpots, fixed, lockedX, viewShift, savedFrame, settledFor, settledWidth } =
    useLayoutRun({
      compiled: input.compiled,
      laidView,
      sizes,
      runSettings,
      profile: input.profile,
      model: input.model,
      plane: input.plane,
      partitions,
      layoutPositions,
      drillRoot: input.drillRoot,
      dayWidth: input.dayWidth,
      hidden: input.hidden,
      chromeless: input.chromeless === true,
    });

  // Overlay-applied geometry: elk output with any layout-overlay positions for
  // the active plane substituted in (width/height stay elk's). Derived so the
  // elk cache is never mutated; everything that RENDERS reads this, while the
  // raw `geometry` remains the layout-effect state.
  const placedGeometry = useMemo(
    () => placeSaved({ geometry, fixed, lockedX, viewShift, saved, dayWidth: settledWidth }, input),
    /* eslint-disable-next-line react-hooks/exhaustive-deps -- placeSaved reads input.editing and input.viewPositions only */
    [geometry, fixed, lockedX, viewShift, saved, input.editing, input.viewPositions, settledWidth],
  );

  // A hand-placed child may sit past the wall of the box elk sized for it: the
  // container gives way (fit-containers.ts). Not where the notation owns the
  // arrangement (a git lane is a row the layout sizes itself), and not for
  // activity lanes and frames, which the band pass below grows instead.
  const fitted = useMemo((): ContainerFit<NodeGeometry> | null => {
    if (placedGeometry === null) return null;
    if (input.profile.layout !== undefined) return { geometry: placedGeometry, shifts: NO_SHIFTS };
    return fitContainers(placedGeometry, input.compiled.roots, containerPad, (n) => isActivityBand(n.node.type));
  }, [placedGeometry, input.compiled, input.profile]);

  const flowDirection = (runSettings?.direction ?? FALLBACK_DIRECTION) as LayoutDirection;

  const arrangedGeometry = useMemo(
    () => (fitted === null ? null : arrangeChrome(fitted.geometry, input, flowDirection, sizes)),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the fields of `input` that arrangeChrome reads
    [fitted, input.compiled, input.model, input.plane, input.layout, flowDirection, sizes],
  );

  // Which of those regions draw the dashed line they share with the one before
  // them: decided by the same order and direction, but not by any position, so
  // it does not change with every drag.
  const separators = useMemo(
    () => regionSeparators(input.compiled, input.model, { plane: input.plane, direction: flowDirection }),
    [input.compiled, input.model, input.plane, flowDirection],
  );

  // Routes are elk's (or the notation's own), computed for the arrangement the
  // LAYOUT produced. Anything that moves a node afterwards — a saved position,
  // a view-mode drag, a nudge in flight, the activity band pass, an ancestor
  // that was dragged — leaves its edges' routes pointing at its laid spot.
  // Rather than enumerate those causes, record where the layout put every node
  // and let each edge compare: it draws its route only while both endpoints
  // still stand there, and floats otherwise (useEdgePath). That also holds
  // mid-drag, before anything is committed.
  const laidAt = useMemo(() => laidAtOf(geometry, input.compiled.roots), [geometry, input.compiled]);

  const routing = useMemo(
    () => routingOf(input.profile, layoutSettings, runSettings),
    [input.profile, layoutSettings, runSettings],
  );

  return {
    geometry,
    geometryRef,
    routes,
    placedGeometry,
    arrangedGeometry,
    regionSeparators: separators,
    containerShifts: fitted?.shifts ?? NO_SHIFTS,
    routing,
    laidAt,
    labelSpots,
    fixed,
    lockedX,
    viewShift,
    savedFrame,
    settledFor,
    settledWidth,
    layoutSettings,
    flowDirection,
  };
}
