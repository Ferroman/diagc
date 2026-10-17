import {
  FB_CATEGORY_TYPE,
  FISHBONE_NOTATION,
  fishboneTree,
  GIT_NOTATION,
  gitGraph,
  isGitKind,
  TM_BOUNDARY_TYPE,
  TM_NOTATION,
  type DiagramModel,
  type GitGraph,
  type NotationId,
  type ViewEdge,
} from '@diagc/core/internal';

// The colours a notation gives its boxes and lines, as the browser gives them: a git
// graph's lanes and a fishbone's bones from one palette, a threat model's trust
// boundaries red. The CLI cannot import the renderer, so this is a copy of its notation
// colour hooks, which accents.test.ts holds to them. The renderer's other hooks give a
// theme's colours, one for a light page and one for a dark: a text picture cannot know
// the background it will be read on, so those notations draw without them.

/** A lane's or a bone's colour where it sets none, in turn. */
const PALETTE = ['#7ba7d9', '#d9534f', '#e0a030', '#7bbf7b', '#b08ad9', '#8a8f96'] as const;
const BOUNDARY_COLOR = '#c62828';

export interface Accents {
  /** node id → its notation's colour: below the node's own, above the model's typeColors */
  nodes: ReadonlyMap<string, string>;
  /** edge id → its notation's colour: below the relation's own and its layer's tint */
  edges: ReadonlyMap<string, string>;
}

const NONE: Accents = { nodes: new Map(), edges: new Map() };

const paletteAt = (i: number): string => PALETTE[i % PALETTE.length]!;

/** Each category in its colour, and every cause and sub-cause hanging from it: its
 * own colour, else the model's for a category, else the palette by column, a column
 * being the two categories that meet the spine at one point, which read as one rib. */
function boneColors(model: DiagramModel): Map<string, string> {
  const byType = model.typeColors?.[FB_CATEGORY_TYPE] ?? model.typeColors?.['*'];
  const own = new Map(model.nodes.map((n) => [n.id, n.color]));
  const colors = new Map<string, string>();
  fishboneTree(model).categories.forEach((category, i) => {
    const color = own.get(category.id) ?? byType ?? paletteAt(Math.floor(i / 2));
    colors.set(category.id, color);
    for (const cause of category.causes) {
      colors.set(cause.id, color);
      for (const sub of cause.subs) colors.set(sub, color);
    }
  });
  return colors;
}

/** Each lane in its colour: its own, else the model's for a branch, else the palette
 * by lane; and each commit in its own colour, else its lane's. */
function laneColors(model: DiagramModel, graph: GitGraph): Map<string, string> {
  const byType = model.typeColors?.['branch'] ?? model.typeColors?.['*'];
  const colors = new Map<string, string>();
  graph.lanes.forEach((lane, i) => {
    const color = lane.node.color ?? byType ?? paletteAt(i);
    colors.set(lane.id, color);
    for (const commit of lane.commits) colors.set(commit.id, commit.color ?? color);
  });
  return colors;
}

/** A git link in a lane's colour: a branch in the new lane's, a commit in its own
 * lane's, a merge in the lower lane's, so a feature merging up keeps its colour and a
 * trunk merging down takes the lane's. */
function linkColor(edge: ViewEdge, graph: GitGraph, lanes: ReadonlyMap<string, string>): string | undefined {
  if (!isGitKind(edge.kind)) return undefined;
  const [from, to] = [graph.laneOf.get(edge.from), graph.laneOf.get(edge.to)];
  if (from === undefined || to === undefined) return undefined;
  const index = (id: string): number => graph.lanes.findIndex((l) => l.id === id);
  const lane = edge.kind === 'branch' ? to : edge.kind === 'commit' ? from : index(from) >= index(to) ? from : to;
  return lanes.get(lane);
}

function byEdge(edges: readonly ViewEdge[], colorOf: (e: ViewEdge) => string | undefined): Map<string, string> {
  const colors = new Map<string, string>();
  for (const e of edges) {
    const color = colorOf(e);
    if (color !== undefined) colors.set(e.id, color);
  }
  return colors;
}

/** What `notation` colours on the plane, of its nodes and of the drawn `edges`. */
export function notationAccents(
  model: DiagramModel,
  plane: string | undefined,
  notation: NotationId | undefined,
  edges: readonly ViewEdge[],
): Accents {
  if (notation === FISHBONE_NOTATION) {
    const nodes = boneColors(model);
    // a bone, a cause line or a tick takes the colour of the node it starts from
    return { nodes, edges: byEdge(edges, (e) => nodes.get(e.from)) };
  }
  if (notation === GIT_NOTATION) {
    const graph = gitGraph(model, plane);
    const nodes = laneColors(model, graph);
    return { nodes, edges: byEdge(edges, (e) => linkColor(e, graph, nodes)) };
  }
  if (notation === TM_NOTATION) {
    const boundaries = model.nodes.filter((n) => n.type === TM_BOUNDARY_TYPE);
    return { nodes: new Map(boundaries.map((n) => [n.id, BOUNDARY_COLOR])), edges: new Map() };
  }
  return NONE;
}
