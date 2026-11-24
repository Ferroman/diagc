import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import {
  compileView,
  type CompiledView,
  type DiagramModel,
  type PlanViewOptions,
  type ViewNode,
} from '@diagc/core/internal';
import type { NotationProfile } from '../notations';
import type { Registry, TypeStyle } from '../registry';
import { neverFolds } from './useNotation';
import type { DiagramViewProps } from './view-types';

export interface CompiledViewInput {
  props: Pick<DiagramViewProps, 'model' | 'plane' | 'pins' | 'activeLayers'>;
  profile: NotationProfile;
  typeRegistry: Registry<TypeStyle>;
  /** the plane sheet-flip's focus (useDrillNavigation) */
  focus: string[];
  drillRoot: string | undefined;
  /** what is on screen: the plane-switch mapping in useDrillNavigation reads it */
  visibleRef: MutableRefObject<string[]>;
  /** the plan's team lanes and hidden actors (NotationProfile.regroup); absent,
   * ungrouped with nothing hidden. Whether the view is an opened zone's is
   * `drillRoot`'s to say. */
  grouping?: Pick<PlanViewOptions, 'grouped' | 'hidden'>;
}

/** ungrouped, nothing hidden: one stable identity, so the memo keeps its input */
const UNGROUPED: Pick<PlanViewOptions, 'grouped' | 'hidden'> = { grouped: false, hidden: new Set() };

export interface CompiledViewState {
  compiled: CompiledView;
  /** `compiled`, kept current every render for readers that must not re-run with it */
  compiledRef: MutableRefObject<CompiledView>;
}

type Pins = Record<string, 'expanded' | 'collapsed'>;

/**
 * The pins the view compiles with: the host's, plus what the notation says
 * about its containers. One that never folds (a git lane is a row, not a box
 * with an inside) is pinned expanded over whatever the host says; one that
 * rests open (a plan zone) is expanded unless the host folded it. The host's
 * own pins come back as they are when the notation adds nothing, so the
 * compile memo keeps its input.
 */
export function restingPins(
  model: DiagramModel,
  profile: NotationProfile,
  typeRegistry: Registry<TypeStyle>,
  pins: Pins | undefined,
): Pins | undefined {
  const restsOpen = profile.node?.restsOpen;
  let out: Pins | undefined;
  for (const n of model.nodes) {
    const pin = neverFolds(n, profile, typeRegistry)
      ? 'expanded'
      : restsOpen?.(n) === true && pins?.[n.id] !== 'collapsed'
        ? 'expanded'
        : undefined;
    if (pin === undefined || pins?.[n.id] === pin) continue;
    out ??= { ...(pins ?? {}) };
    out[n.id] = pin;
  }
  return out ?? pins;
}

/** What is drawn: the view compiled from the model, the pins, the layers and the drill. */
export function useCompiledView(input: CompiledViewInput): CompiledViewState {
  const { props, profile, typeRegistry, focus, drillRoot, visibleRef, grouping = UNGROUPED } = input;
  // The host's own pins still feed the chips, so nothing else changes.
  const effectivePins = useMemo(
    () => restingPins(props.model, profile, typeRegistry, props.pins),
    [profile, props.pins, props.model, typeRegistry],
  );

  // An opened container may bring in nodes from outside it as themselves (a
  // plan's people and teams, NotationProfile.drillCarry).
  const carry = useMemo(
    () => (drillRoot === undefined ? undefined : profile.drillCarry?.(props.model, props.plane, drillRoot)),
    [drillRoot, profile, props.model, props.plane],
  );

  const base = useMemo(() => {
    const raw = compileView(props.model, {
      // drilled → `root` drives visibility; otherwise `focus` (pins + the plane
      // sheet-flip). Identical for view and edit — only affordances differ.
      focus: drillRoot !== undefined ? undefined : focus,
      pins: effectivePins,
      activeLayers: props.activeLayers,
      plane: props.plane,
      root: drillRoot,
      ...(carry !== undefined && carry.length > 0 ? { carry: [...carry] } : {}),
    });
    // A notation may keep some relation kinds off the canvas (plan roles become
    // chips). Only the DRAWN set is filtered: layoutEdges keep every relation,
    // the same rule that keeps a layer toggle from moving a box.
    const hidden = profile.edge?.hidden;
    if (hidden === undefined || !raw.edges.some((e) => hidden(e.kind))) return raw;
    return { ...raw, edges: raw.edges.filter((e) => !hidden(e.kind)) };
  }, [props.model, props.plane, focus, drillRoot, carry, effectivePins, props.activeLayers, profile]);
  // Lanes and hiding run on the compiled view, in a memo of their own: a
  // toggle re-runs only this (planTint rebuilds a node map per call), and an
  // unchanged input hands the same view on, which every per-node cache keys
  // its identity on. Inside an opened zone there are no lanes (`opened`).
  const { grouped, hidden } = grouping;
  const regroup = profile.regroup;
  const opened = drillRoot !== undefined;
  const compiled = useMemo(
    () => (regroup === undefined ? base : regroup(base, props.model, props.plane, { grouped, hidden, opened })),
    [regroup, base, props.model, props.plane, grouped, hidden, opened],
  );
  // Render-phase ref, the strokesRef pattern: useLayoutApi's snapshotPositions
  // needs compiled.externals to drop stub ids, but that effect only re-runs on
  // [layoutApiRef, reactFlow] — so it reads `compiled` through a ref kept
  // current every render instead of depending on it.
  const compiledRef = useRef(compiled);
  compiledRef.current = compiled;

  // remember what is on screen — the plane-switch mapping reads this
  useEffect(() => {
    const ids: string[] = [];
    const walk = (n: ViewNode) => {
      ids.push(n.id);
      n.children.forEach(walk);
    };
    compiled.roots.forEach(walk);
    visibleRef.current = ids;
    /* eslint-disable-next-line react-hooks/exhaustive-deps --
       visibleRef is a stable useRef identity from DiagramView, written through .current */
  }, [compiled]);

  return { compiled, compiledRef };
}
