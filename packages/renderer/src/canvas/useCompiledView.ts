import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { compileView, type CompiledView, type ViewNode } from '@diagc/core/internal';
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
}

export interface CompiledViewState {
  compiled: CompiledView;
  /** `compiled`, kept current every render for readers that must not re-run with it */
  compiledRef: MutableRefObject<CompiledView>;
}

/** What is drawn: the view compiled from the model, the pins, the layers and the drill. */
export function useCompiledView(input: CompiledViewInput): CompiledViewState {
  const { props, profile, typeRegistry, focus, drillRoot, visibleRef } = input;
  // A notation may declare containers that never fold (git lanes are rows, not
  // boxes with an inside): they are pinned expanded over whatever the host's
  // pins say. The host's own pins still feed the chips, so nothing else changes.
  const effectivePins = useMemo(() => {
    const pinned = props.model.nodes.filter((n) => neverFolds(n, profile, typeRegistry));
    if (pinned.length === 0) return props.pins; // referential stability: nothing to add
    const pins: Record<string, 'expanded' | 'collapsed'> = { ...(props.pins ?? {}) };
    for (const n of pinned) pins[n.id] = 'expanded';
    return pins;
  }, [profile, props.pins, props.model.nodes, typeRegistry]);

  const compiled = useMemo(() => {
    const raw = compileView(props.model, {
      // drilled → `root` drives visibility; otherwise `focus` (pins + the plane
      // sheet-flip). Identical for view and edit — only affordances differ.
      focus: drillRoot !== undefined ? undefined : focus,
      pins: effectivePins,
      activeLayers: props.activeLayers,
      plane: props.plane,
      root: drillRoot,
    });
    // A notation may keep some relation kinds off the canvas (plan roles become
    // chips). Only the DRAWN set is filtered: layoutEdges keep every relation,
    // the same rule that keeps a layer toggle from moving a box.
    const hidden = profile.edge?.hidden;
    if (hidden === undefined || !raw.edges.some((e) => hidden(e.kind))) return raw;
    return { ...raw, edges: raw.edges.filter((e) => !hidden(e.kind)) };
  }, [props.model, props.plane, focus, drillRoot, effectivePins, props.activeLayers, profile]);
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
