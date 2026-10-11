import { useState } from 'react';
import {
  activeNotation,
  openingPins,
  presetLayers,
  type DiagramModel,
  type DiagramPlane,
  type LayoutOverlay,
  type NotationId,
} from '@diagc/core/internal';
import type { DiagramViewProps } from '../canvas/view-types';
import { todayIso } from '../overlays/time-axis';
import { isKnownStyle } from '../sketch/stylePresets';

type Pins = Record<string, 'expanded' | 'collapsed'>;

/** How a reader's view opens. Read once, from the first model the hook is handed. */
export interface ReaderOpening {
  /** the plane to open on; the first plane when absent or unknown */
  plane?: string;
  /** the layers to open with; the opening plane's preset layers when absent */
  layers?: string[];
  /** the folds to open with; the ones the layout saved for the opening plane when absent */
  pins?: Pins;
  /** the node to open drilled into */
  root?: string;
}

export interface ReaderViewOptions {
  /** the model, or undefined while the host is still loading it */
  model: DiagramModel | undefined;
  layout?: LayoutOverlay;
  /** a one-shot screenshot: always the first plane, no layer switch, no today line */
  exportMode?: boolean;
  opening?: ReaderOpening;
}

/** The `DiagramView` props a read-only host leaves to its reader's view. */
export type ReaderViewProps = Pick<
  DiagramViewProps,
  | 'model'
  | 'pins'
  | 'onToggleExpand'
  | 'enteredPath'
  | 'onEnteredPathChange'
  | 'styleId'
  | 'today'
  | 'plane'
  | 'notation'
  | 'layout'
  | 'activeLayers'
  | 'onToggleLayer'
>;

export interface ReaderView {
  /** what the host hands `DiagramView`; undefined until it has a model */
  props: ReaderViewProps | undefined;
  /** the plane drawn; undefined is the model's first plane, `DiagramView`'s default */
  plane: string | undefined;
  /** the drawn plane's notation */
  notation: NotationId | undefined;
  /** switch planes: the new plane opens with its own preset layers and saved folds */
  setPlane: (id: string) => void;
}

/**
 * Which plane a reader sees, or undefined for the model's first plane. Export
 * mode ignores the pick: the committed PNG is defined as the first plane. A pick
 * that names no plane (an Obsidian fence's typo) falls back to the first plane
 * rather than compiling an empty view.
 */
function activePlaneId(planes: readonly DiagramPlane[], picked: string | undefined, exportMode: boolean) {
  if (exportMode) return undefined;
  return planes.some((p) => p.id === picked) ? picked : undefined;
}

function openingState(model: DiagramModel, options: ReaderViewOptions): { pins: Pins; layers: string[] } {
  const plane = activePlaneId(model.planes, options.opening?.plane, options.exportMode ?? false);
  return {
    pins: options.opening?.pins ?? openingPins(options.layout, model, plane),
    layers: options.opening?.layers ?? presetLayers(model.planes, plane),
  };
}

/**
 * What a read-only host (the published page, an Obsidian embed) does with a
 * model: which plane is drawn, its folds and layers, the drill path, the plane's
 * notation, the diagram's style and today's date. The reader owns all of it for
 * as long as the view is open, and none of it is saved: a plane's `layers` and
 * the layout's saved folds are where a view starts, not a floor the compiler
 * re-imposes.
 */
export function useReaderView(options: ReaderViewOptions): ReaderView {
  const { model, layout, exportMode = false, opening } = options;
  const [picked, setPicked] = useState(opening?.plane);
  const [pins, setPins] = useState<Pins>(() => (model !== undefined ? openingState(model, options).pins : {}));
  const [layers, setLayers] = useState<string[]>(() =>
    model !== undefined ? openingState(model, options).layers : [],
  );
  const [enteredPath, setEnteredPath] = useState<string[]>(opening?.root !== undefined ? [opening.root] : []);
  // A host that loads its model after mounting (the embed fetches it) is seeded
  // in the render the model arrives in, so the canvas never draws it unseeded.
  const [seeded, setSeeded] = useState(model !== undefined);
  if (!seeded && model !== undefined) {
    setSeeded(true);
    const open = openingState(model, options);
    setPins(open.pins);
    setLayers(open.layers);
  }

  if (model === undefined) return { props: undefined, plane: undefined, notation: undefined, setPlane: () => {} };
  const plane = activePlaneId(model.planes, picked, exportMode);
  // The visual language follows the plane the reader is on; the studio resolves
  // it the same way, so an editable diagram and its published page agree.
  const notation = activeNotation(model.planes, plane, model.notation);
  const styleId = model.style !== undefined && isKnownStyle(model.style) ? model.style : 'clean';
  const toggleExpand = (id: string, next: 'expanded' | 'collapsed') => setPins((p) => ({ ...p, [id]: next }));
  const toggleLayer = (id: string) => setLayers((ls) => (ls.includes(id) ? ls.filter((l) => l !== id) : [...ls, id]));
  // A plane change re-seeds the layers and the folds from the new plane, so the
  // reader's choice on one viewpoint never silently governs another; the studio
  // does the same on switchPlane.
  const setPlane = (id: string) => {
    setPicked(id);
    setLayers(presetLayers(model.planes, id));
    setPins(openingPins(layout, model, id));
  };
  const props: ReaderViewProps = {
    model,
    pins,
    onToggleExpand: toggleExpand,
    enteredPath,
    onEnteredPathChange: setEnteredPath,
    styleId,
    // a page shows where today is; a PNG must not bake in a line that is wrong
    // tomorrow, so an export draws none
    today: exportMode ? null : todayIso(),
    ...(plane !== undefined ? { plane } : {}),
    ...(notation !== undefined ? { notation } : {}),
    ...(layout !== undefined ? { layout } : {}),
    // The layer switch: `onToggleLayer` is what turns the legend's layer rows
    // into buttons and shows an off layer as a greyed row. An export passes
    // neither, so the image keeps inert rows and compiles from the presets.
    ...(exportMode ? {} : { activeLayers: layers, onToggleLayer: toggleLayer }),
  };
  return { props, plane, notation, setPlane };
}
