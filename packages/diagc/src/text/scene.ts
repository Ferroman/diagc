import {
  activeNotation,
  buildHierarchy,
  compileView,
  defined,
  defaultLayoutDirection,
  FISHBONE_NOTATION,
  GIT_NOTATION,
  layoutPlaneKey,
  presetLayers,
  type CompiledView,
  type DiagramModel,
  type HierarchyIndex,
  type LayoutOverlay,
  type NotationId,
  type ViewNode,
} from '@diagc/core/internal';
import { notationAccents, type Accents } from './accents';
import { boxText, edgeText, type BoxText } from './content';
import { SHADOW_REACH, type TextStyle } from './dos';
import { fishCells } from './fish';
import { withNeverFolds, type Pins } from './folds';
import { gitCells } from './git';
import type { Glyphs } from './glyphs';
import { layoutCells, type Flow, type TextLayout } from './layout';
import { legendOf, type TextLegend } from './legend';
import { hidesKind } from './vocabulary';

/** What a text picture is a picture of. */
export interface SceneInput {
  model: DiagramModel;
  overlay?: LayoutOverlay;
  /** absent = the model's first plane */
  plane?: string;
  /** the layers drawn; absent = the plane's presets (compileView's own rule) */
  layers?: string[];
  pins: Pins;
  /** draw this container's interior only (the drill view) */
  root?: string;
  /** the style it is drawn in; absent = the terminal's own. DOS's boxes cast shadows,
   * which the picture leaves room for at its right and its foot. */
  style?: TextStyle;
  /** a git graph across the screen, its lanes rows, as the page draws it; absent = down
   * the screen, its lanes columns, as a terminal reads a history */
  horizontal?: boolean;
}

/** A laid-out view: everything painting and the TUI's navigation read. */
export interface Scene {
  input: SceneInput;
  /** the compiled view, its `edges` cut to the ones the notation draws */
  view: CompiledView;
  layout: TextLayout;
  boxes: Map<string, BoxText>;
  /** every drawn node by id, in drawing order (parents before children) */
  nodes: Map<string, ViewNode>;
  /** the box each drawn node is drawn inside; undefined at the top level */
  parentOf: Map<string, string | undefined>;
  /** the plane's containment, over the nodes the active layers show */
  hierarchy: HierarchyIndex;
  notation?: NotationId;
  /** the colours the notation gives boxes and lines that set none */
  accents: Accents;
  /** the key to what is drawn: declared by the diagram, or offered for what its
   * shapes cannot say; absent when there is nothing to key */
  legend?: TextLegend;
}

const DIRECTIONS = new Set(['DOWN', 'UP', 'LEFT', 'RIGHT']);

/** The way the plane flows: its saved layout setting, else the model's default. */
function directionOf(input: SceneInput): string {
  const saved = input.overlay?.settings?.[layoutPlaneKey(input.model, input.plane)]?.direction;
  return saved !== undefined && DIRECTIONS.has(saved) ? saved : defaultLayoutDirection(input.model);
}

/** How the scene is laid out: its plane's flow, and room for DOS's shadows. */
const flowOf = (input: SceneInput): Flow => ({
  direction: directionOf(input),
  ...(input.style === 'dos' ? { shadow: SHADOW_REACH } : {}),
});

export async function buildScene(input: SceneInput, glyphs: Glyphs): Promise<Scene> {
  const { model, plane } = input;
  const notation = activeNotation(model.planes, plane, model.notation);
  const compiled = compileView(model, {
    pins: withNeverFolds(model, input.pins, notation),
    ...(plane !== undefined ? { plane } : {}),
    ...(input.layers !== undefined ? { activeLayers: input.layers } : {}),
    ...(input.root !== undefined ? { root: input.root } : {}),
  });
  // Only the drawn set loses a notation's hidden kinds: layoutEdges keep them, the
  // rule that keeps a layer toggle from moving a box (the renderer does the same).
  const view = { ...compiled, edges: compiled.edges.filter((e) => !hidesKind(e.kind, notation)) };
  const hierarchy = buildHierarchy(model, plane, new Set(input.layers ?? presetLayers(model.planes, plane)));

  const nodes = new Map<string, ViewNode>();
  const parentOf = new Map<string, string | undefined>();
  const boxes = new Map<string, BoxText>();
  const walk = (vn: ViewNode, parent: string | undefined): void => {
    nodes.set(vn.id, vn);
    parentOf.set(vn.id, parent);
    const inside = hierarchy.childrenOf.get(vn.id)?.length ?? 0;
    boxes.set(vn.id, boxText(vn, { inside, glyphs, ...(notation !== undefined ? { notation } : {}) }));
    for (const child of vn.children) walk(child, vn.id);
  };
  for (const root of view.roots) walk(root, undefined);

  const labels = new Map(view.layoutEdges.map((e) => [e.id, edgeText(e, glyphs)]));
  // A fishbone is the fish and a git graph its lanes, whatever way the plane's
  // settings say to flow.
  const laid =
    notation === FISHBONE_NOTATION
      ? fishCells(model, view, boxes)
      : notation === GIT_NOTATION
        ? gitCells(model, view, boxes, defined({ plane, across: input.horizontal }))
        : await layoutCells(view, boxes, flowOf(input), labels);
  const room = input.style === 'dos' && laid.boxes.size > 0;
  const layout = room ? { ...laid, width: laid.width + SHADOW_REACH.x, height: laid.height + SHADOW_REACH.y } : laid;
  const accents = notationAccents(model, plane, notation, view.edges);
  const scene: Scene = { input, view, layout, boxes, nodes, parentOf, hierarchy, accents, ...defined({ notation }) };
  const legend = legendOf(scene, glyphs);
  return legend === undefined ? scene : { ...scene, legend };
}
