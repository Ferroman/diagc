import { useEffect, useMemo, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { compileView, type DiagramModel, type Stroke } from '@diagc/core';
import { legendRows, type LegendRow } from './legendRows';
import type { KindStyle, Registry, TypeStyle } from './registry';

export interface LegendStateInput {
  model: DiagramModel;
  plane: string | undefined;
  compiled: ReturnType<typeof compileView>;
  drillRoot: string | undefined;
  activeLayers: string[] | undefined;
  typeRegistry: Registry<TypeStyle>;
  kindRegistry: Registry<KindStyle>;
  canToggleLayers: boolean;              // props.onToggleLayer !== undefined
  strokes: readonly Stroke[];
  drawingsVisible: boolean;
  /** the notation profile's node accents, as the canvas is given them */
  nodeColors?: ReadonlyMap<string, string>;
}

export interface LegendState {
  legendConfig: DiagramModel['legend'];
  showLegend: boolean;
  setShowLegend: Dispatch<SetStateAction<boolean>>;
  setLegendSize: Dispatch<SetStateAction<{ width: number; height: number } | null>>;
  legendRowList: LegendRow[];
  legendReserveRef: MutableRefObject<{ side: 'top' | 'right' | 'bottom' | 'left'; px: number } | null>;
}

/** What a diagram that declared no legend is keyed with, when it is keyed at all. */
const UNDECLARED: NonNullable<DiagramModel['legend']> = {};

export function useLegendState(input: LegendStateInput): LegendState {
  // The model opts in; the control button overrides locally. Never persisted.
  // "Shown" follows the declaration alone: an undeclared legend (below) has rows
  // and therefore a button, but starts hidden — which is also what keeps it out of
  // an export, where nothing can press that button.
  const [showLegend, setShowLegend] = useState(input.model.legend !== undefined);
  const [legendSize, setLegendSize] = useState<{ width: number; height: number } | null>(null);
  const legendConfig = input.model.legend;
  // Switching diagrams must re-seed from the new model, or a local override
  // leaks across: hide the legend on diagram A, open B, and B's key is missing.
  useEffect(() => {
    setShowLegend(legendConfig !== undefined);
  }, [input.model.id, legendConfig]);
  const activePlane = useMemo(
    () => input.model.planes.find((p) => p.id === (input.plane ?? input.model.planes[0]?.id)),
    [input.model.planes, input.plane],
  );
  const legendRowList = useMemo(() => {
    const rows = legendRows({
      model: input.model,
      compiled: input.compiled,
      ...(activePlane !== undefined ? { plane: activePlane } : {}),
      // Drilled in, only the root's interior is on screen; the key has to
      // be scoped the same way or it explains things nothing draws.
      ...(input.drillRoot !== undefined ? { root: input.drillRoot } : {}),
      // Passed through undefined-and-all: the legend resolves plane
      // presets the same way compileView does, and `?? []` here would
      // tell it "no layers on" on a page that draws the presets.
      ...(input.activeLayers !== undefined ? { activeLayers: input.activeLayers } : {}),
      ...(input.nodeColors !== undefined ? { nodeColors: input.nodeColors } : {}),
      typeRegistry: input.typeRegistry,
      kindRegistry: input.kindRegistry,
      config: legendConfig ?? UNDECLARED,
      // Not `chrome`: a greyed row is only worth showing to a reader who
      // can un-grey it, and only a host with a handler offers that.
      canToggleLayers: input.canToggleLayers,
      // Only when this plane has ink: no strokes means no toggle to show,
      // exactly the condition the control button already uses.
      ...(input.strokes.length > 0 ? { drawings: { active: input.drawingsVisible } } : {}),
    });
    // A diagram that never asked for a legend gets none — unless it is drawn in
    // shapes and line ends that say nothing about themselves (a start dot, a DFD
    // process, a crow's foot). There the reader has no other way to learn the
    // vocabulary, so the key is on offer, and the author who wants it in the
    // picture still has to declare it.
    return legendConfig !== undefined || rows.some((r) => r.vocabulary === true) ? rows : [];
  }, [
    legendConfig,
    input.model,
    input.compiled,
    activePlane,
    input.drillRoot,
    input.activeLayers,
    input.typeRegistry,
    input.kindRegistry,
    input.canToggleLayers,
    input.strokes,
    input.drawingsVisible,
    input.nodeColors,
  ]);
  // Read through `legendReserveRef` (not the state above) by DiagramView's
  // layoutApiRef effect, whose own deps are intentionally just [layoutApiRef, reactFlow]
  // — a ref keeps that closure from going stale without re-running it.
  const legendReserveRef = useRef<{ side: 'top' | 'right' | 'bottom' | 'left'; px: number } | null>(null);
  useEffect(() => {
    const pos = legendConfig?.position ?? 'bottom-right';
    legendReserveRef.current =
      !showLegend || legendSize === null || legendRowList.length === 0
        ? null
        : { side: pos.startsWith('top') ? 'top' : 'bottom', px: legendSize.height + 16 };
  }, [showLegend, legendSize, legendRowList, legendConfig]);

  return { legendConfig, showLegend, setShowLegend, setLegendSize, legendRowList, legendReserveRef };
}
