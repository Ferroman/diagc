import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { compileView, type DiagramModel } from '@diagc/core';
import { combinePolarities, type LoopEdgeInput } from './loops';
import { EMPTY_ID_SET, type LoopHighlight } from './loop-highlight';
import type { NotationProfile } from './notations';

export interface LoopOverlayInput {
  profile: NotationProfile;
  compiled: ReturnType<typeof compileView>;
  /** the source `profile.related` reads — a plan's role relations live in the
   * model, not the compiled (edge-only) view. */
  model: DiagramModel;
  plane: string | undefined;
  externalHighlight: { nodes: readonly string[]; edges: readonly string[] } | null | undefined;
  onCldEdges: ((edges: LoopEdgeInput[]) => void) | undefined;
}

export interface LoopOverlay {
  cld: boolean;
  loopEdges: LoopEdgeInput[] | null;
  showLoops: boolean;
  setShowLoops: Dispatch<SetStateAction<boolean>>;
  selectedNode: string | null;
  setSelectedNode: Dispatch<SetStateAction<string | null>>;
  focusConnected: boolean;
  setFocusConnected: Dispatch<SetStateAction<boolean>>;
  loopHighlight: LoopHighlight;
}

export function useLoopOverlay(input: LoopOverlayInput): LoopOverlay {
  // Causal-loop-diagram overlay: the R/B feedback-loop badges. Derived from the
  // drawn edges (aggregated where relations parallel), not the raw model, so it
  // stays in sync with layer/plane filtering the same way the arrows do.
  const cld = input.profile.overlay === 'loop-labels';
  const loopEdges = useMemo(
    (): LoopEdgeInput[] | null =>
      cld
        ? input.compiled.edges.map((e) => {
            const pol = combinePolarities(e.constituents.map((c) => c.polarity));
            return { id: e.id, from: e.from, to: e.to, ...(pol !== undefined ? { polarity: pol } : {}) };
          })
        : null,
    [input.compiled, cld],
  );
  // Surface the compiled signed graph upward (leverage analysis runs on the
  // exact edge ids the canvas draws).
  const { onCldEdges } = input;
  useEffect(() => {
    onCldEdges?.(loopEdges ?? []);
  }, [loopEdges, onCldEdges]);

  // Declutter switch for the CLD overlay: badges can pile up (a busy loop graph
  // has dozens), so a canvas control hides them all. Default shown, ephemeral —
  // survives plane switches (Inner stays mounted) but resets on reload.
  const [showLoops, setShowLoops] = useState(true);
  // The selected node id: drives the view-mode loop-badge filter (edit mode
  // leaves that null) and the connected-neighborhood focus dim in both modes.
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  // Dim nodes/edges not connected to the selected node. On by default, ephemeral.
  const [focusConnected, setFocusConnected] = useState(true);
  const [activeLoop, setActiveLoop] = useState<{ key: string; nodes: Set<string>; edges: Set<string> } | null>(null);
  // A host-driven highlight (leverage panel) overrides the internal badge one.
  const ext = input.externalHighlight;
  // The selected node's neighborhood: itself + every node one edge away (in or
  // out) and the incident edges, over the currently-visible graph — UNIONED
  // with the notation's own `related` (nodes that belong here although no
  // drawn edge joins them, e.g. a plan actor's zones): both describe the same
  // "stays normal" set, just from different sources.
  const { profile, model, plane } = input;
  const neighborFocus = useMemo(() => {
    if (!focusConnected || selectedNode === null) return null;
    const nodes = new Set<string>([selectedNode]);
    const edges = new Set<string>();
    for (const e of input.compiled.edges) {
      if (e.from === selectedNode) {
        nodes.add(e.to);
        edges.add(e.id);
      } else if (e.to === selectedNode) {
        nodes.add(e.from);
        edges.add(e.id);
      }
    }
    for (const id of profile.related?.(model, plane, selectedNode) ?? []) nodes.add(id);
    return { nodes, edges };
  }, [focusConnected, selectedNode, input.compiled.edges, profile, model, plane]);
  // Precedence: a leverage row (ext) or loop badge glows its set (strong dim of
  // the rest); plain node selection is the gentle fallback (light dim, no glow).
  const loopHighlight = useMemo<LoopHighlight>(() => {
    const strong =
      ext != null
        ? { nodes: new Set(ext.nodes), edges: new Set(ext.edges) }
        : activeLoop !== null
          ? { nodes: activeLoop.nodes, edges: activeLoop.edges }
          : null;
    const source = strong ?? neighborFocus;
    return {
      nodes: source?.nodes ?? EMPTY_ID_SET,
      edges: source?.edges ?? EMPTY_ID_SET,
      active: source !== null,
      variant: strong !== null ? 'loop' : 'focus',
      activeKey: activeLoop?.key ?? null,
      // Mirrors `selectedNode` whatever the variant, so a plan's chip/hit mark
      // (keyed off `focusId` directly, not off `nodes`/`edges`) clears with the
      // selection even when a strong (loop/leverage) highlight is what wins the dim.
      focusId: selectedNode,
      toggle: (key, nodes, edges) =>
        setActiveLoop((cur) => (cur?.key === key ? null : { key, nodes: new Set(nodes), edges: new Set(edges) })),
      clear: () => setActiveLoop(null),
    };
  }, [activeLoop, ext, neighborFocus, selectedNode]);
  // A highlighted loop's ids (and the node-focus filter) go stale when the view
  // recompiles (plane / zoom / edit).
  useEffect(() => {
    setActiveLoop(null);
    setSelectedNode(null);
  }, [input.compiled]);

  return { cld, loopEdges, showLoops, setShowLoops, selectedNode, setSelectedNode, focusConnected, setFocusConnected, loopHighlight };
}
