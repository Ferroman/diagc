import {
  activeNotation,
  buildHierarchy,
  compileView,
  defined,
  defaultLayoutDirection,
  FISHBONE_NOTATION,
  layoutPlaneKey,
  presetLayers,
  type CompiledView,
  type DiagramModel,
  type HierarchyIndex,
  type LayoutOverlay,
  type NotationId,
  type ViewNode,
} from '@diagc/core/internal';
import { boxText, edgeText, type BoxText } from './content';
import { withNeverFolds, type Pins } from './folds';
import type { Glyphs } from './glyphs';
import { layoutCells, type TextLayout } from './layout';
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
  /** the key to what is drawn: declared by the diagram, or offered for what its
   * shapes cannot say; absent when there is nothing to key */
  legend?: TextLegend;
}

const DIRECTIONS = new Set(['DOWN', 'UP', 'LEFT', 'RIGHT']);

/** The way the plane flows: its saved layout setting, else the model's default. A
 * fishbone's default is rightwards, as the page draws the fish, head on the right. Its
 * causes are as wide as sentences: a downward flow sets them side by side, off the
 * edge of a terminal, where a sideways one stacks them, and the picture only scrolls. */
function directionOf(input: SceneInput, notation: NotationId | undefined): string {
  const saved = input.overlay?.settings?.[layoutPlaneKey(input.model, input.plane)]?.direction;
  if (saved !== undefined && DIRECTIONS.has(saved)) return saved;
  return notation === FISHBONE_NOTATION ? 'RIGHT' : defaultLayoutDirection(input.model);
}

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
  const layout = await layoutCells(view, boxes, directionOf(input, notation), labels);
  const scene: Scene = { input, view, layout, boxes, nodes, parentOf, hierarchy, ...defined({ notation }) };
  const legend = legendOf(scene, glyphs);
  return legend === undefined ? scene : { ...scene, legend };
}
