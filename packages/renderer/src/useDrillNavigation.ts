import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type MutableRefObject } from 'react';
import { buildHierarchy, type DiagramModel } from '@diagramming/core';
import { drillChain, truncatePath } from './drill';
import { focusForVisible } from './focus';
import { pruneToModel, syncReducer, type SeenKey } from './view-sync';

export interface DrillNavigationInput {
  model: DiagramModel;
  plane: string | undefined;
  enteredPathProp: string[] | undefined;
  onEnteredPathChange: ((path: string[]) => void) | undefined;
  /** written by Inner's compiled-walk effect and cleared by the model-switch branch; read by the plane-switch branch */
  visibleRef: MutableRefObject<string[]>;
  /** the plane-switch branch clears Inner-owned UI state (labelEdit) */
  onPlaneSwitch: () => void;
  /** the enterNode guard for always-expanded containers (git lanes) —
   * built in Inner with useCallback over [model.nodes, profile, typeRegistry] */
  isAlwaysExpanded: (id: string) => boolean;
}

export interface DrillNavigation {
  enteredPath: string[];
  drillRoot: string | undefined;
  focus: string[];
  enterNode: (id: string) => void;
  exitTo: (id: string | null) => void;
  pendingRootFitRef: MutableRefObject<boolean>;
}

export function useDrillNavigation(input: DrillNavigationInput): DrillNavigation {
  // Nested zoom: `enteredPath` is the drill trail root→current (the breadcrumb);
  // its deepest node is the `drillRoot` that scopes the view in both modes.
  // (Automatic viewport-center focus is parked in ./focus.ts.)
  const [focus, setFocus] = useState<string[]>([]);
  const [enteredPath, setEnteredPath] = useState<string[]>(() =>
    input.enteredPathProp !== undefined ? pruneToModel(input.enteredPathProp, input.model) : [],
  );
  const enteredPathRef = useRef<string[]>([]);
  enteredPathRef.current = enteredPath;
  // Report the drill trail upward so the host can scope new-node placement to
  // the level currently open.
  const { onEnteredPathChange } = input;
  useEffect(() => {
    onEnteredPathChange?.(enteredPath);
  }, [enteredPath, onEnteredPathChange]);
  // A pending "fit the whole view" (exiting to the bird's-eye), applied by the
  // same post-layout glide effect that handles per-node fits.
  const pendingRootFitRef = useRef(false);

  // The snapshot the reducer compares against, rebuilt on demand from this
  // hook's inputs.
  const seenKey = (): SeenKey => ({
    modelId: input.model.id,
    model: input.model,
    plane: input.plane,
    enteredPathProp: input.enteredPathProp,
  });
  // Render-phase state adjustment (sanctioned React pattern): new model resets
  // navigation; a plane switch instead maps it — the entities on screen stay
  // visible, regrouped by the new plane's ancestors (the "sheet flip"). The
  // last-seen props snapshot lives in a useReducer (see syncReducer in view-sync.ts):
  // each branch below dispatches the SAME `sync` action with the current props,
  // and the reducer classifies the transition it was — so the four paths
  // (new model / plane switch / model edit / host-driven path) are visible as
  // data. Dispatching during render is the same sanctioned pattern the queues
  // below already rely on: the new snapshot applies on the re-render, and the
  // stale `sync.seen` read by later branches in THIS render is exactly what
  // the old mutable keyRef provided.
  const [sync, syncSeen] = useReducer(syncReducer, undefined, () => ({ seen: seenKey(), transition: 'none' as const }));
  // The drill trail as it will actually be after this render's queued
  // setEnteredPath calls — the state variable itself is stale once one of the
  // branches below has already queued a reset/prune for this same render.
  let effectivePath = enteredPath;
  if (sync.seen.modelId !== input.model.id) {
    // a different diagram loaded → full reset
    syncSeen({ type: 'sync', next: seenKey() });
    input.visibleRef.current = [];
    setFocus([]);
    setEnteredPath([]);
    effectivePath = [];
  } else if (sync.seen.plane !== input.plane) {
    syncSeen({ type: 'sync', next: seenKey() });
    // a plane switch remaps focus to keep the same entities visible; the drill
    // trail (whose ids may not exist in the new plane) resets to the bird's-eye.
    setFocus(focusForVisible(input.model, input.plane, input.visibleRef.current));
    setEnteredPath([]);
    effectivePath = [];
    input.onPlaneSwitch();
  } else if (sync.seen.model !== input.model) {
    // same diagram, new model object (an edit): KEEP the drill trail so editing
    // stays at the current level, but prune it to nodes that still exist —
    // deleting the node you're inside pops you out to the surviving prefix.
    syncSeen({ type: 'sync', next: seenKey() });
    setEnteredPath((path) => pruneToModel(path, input.model));
    effectivePath = pruneToModel(enteredPath, input.model);
  }

  // Host-driven navigation (deep links / Back / Forward): apply a changed
  // `enteredPath` prop. Reference inequality gates the check; content equality
  // makes echoed reports (the host writing back what we just emitted) a no-op.
  if (sync.seen.enteredPathProp !== input.enteredPathProp) {
    syncSeen({ type: 'sync', next: seenKey() });
    if (input.enteredPathProp !== undefined) {
      const next = pruneToModel(input.enteredPathProp, input.model);
      if (next.length !== effectivePath.length || next.some((id, i) => id !== effectivePath[i])) {
        pendingRootFitRef.current = true;
        setEnteredPath(next);
        setFocus([]);
      }
    }
  }

  // Containment index for the active plane — the source of the drill chain
  // (enterNode's drillChain).
  const viewHierarchy = useMemo(
    () => buildHierarchy(input.model, input.plane),
    [input.model, input.plane],
  );

  // The drill root (deepest entered node) scopes the view to that node's interior
  // — an isolated "the node is the canvas" view — in BOTH modes.
  const drillRoot = enteredPath.length > 0 ? enteredPath[enteredPath.length - 1] : undefined;

  // Destructured (rather than called as `input.isAlwaysExpanded`) so the
  // useCallback below depends on the guard itself and not on the input object,
  // which is a fresh literal every render.
  const { isAlwaysExpanded } = input;
  // Enter (drill into) a node: make it the drill root — the isolated view swaps to
  // show its interior filling the canvas. Recomputing the whole chain (not
  // appending) means entering a sibling or ancestor (e.g. an external stub)
  // navigates correctly too. Every drill re-fits the whole new scene. Stable
  // across drills (reads the path from a ref) so it can be threaded onto nodes.
  const enterNode = useCallback(
    (id: string) => {
      // A notation container that is always expanded (e.g. a git lane) is a row,
      // not a box with an inside — nothing offers drilling into one, but a
      // double-click can still reach here via the click-correlation path, so
      // guard it explicitly rather than relying on the absent affordance.
      if (isAlwaysExpanded(id)) return;
      const chain = drillChain(viewHierarchy.parentsOf, id, enteredPathRef.current);
      if (chain.length === 0) return; // unknown / not in this plane
      pendingRootFitRef.current = true;
      setEnteredPath(chain);
      setFocus([]); // drilling replaces any in-place (sheet-flip/peek) expansion
    },
    [viewHierarchy, isAlwaysExpanded],
  );

  // Exit out to a breadcrumb (`null` = the home button → bird's-eye). The scene
  // becomes that frame's interior, so re-fit the whole thing.
  const exitTo = (id: string | null) => {
    const path = id === null ? [] : truncatePath(enteredPath, id);
    pendingRootFitRef.current = true;
    setEnteredPath(path);
    setFocus([]);
  };

  return { enteredPath, drillRoot, focus, enterNode, exitTo, pendingRootFitRef };
}
