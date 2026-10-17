import type { DiagramModel, DiagramNode, NotationId, ViewEdge } from '@diagc/core/internal';
import { parseColor } from './ansi';
import { Canvas, type CellPoint, type Color, type Style } from './canvas';
import type { BoxLine, BoxText } from './content';
import { DOWN, LEFT, RIGHT, UP, type ArrowDirection, type Corner, type Glyphs, type Weight } from './glyphs';
import { STEP, towardBox, type BoxGeometry } from './layout';
import type { Scene } from './scene';
import { kindLook, typeLook, type EndMark, type LineStyle, type TextShape } from './vocabulary';
import { cellWidth } from './width';

export interface PaintOptions {
  glyphs: Glyphs;
  /** the box the TUI has selected: drawn heavy, its edges bold, every other edge dim */
  selected?: string;
}

/** What every step of a painting reads. */
interface Painter {
  canvas: Canvas;
  scene: Scene;
  glyphs: Glyphs;
  selected?: string;
}

/** How a line is drawn: its weight and its style. */
interface Ink {
  weight: Weight;
  style: Style;
}

export const WEIGHT: Record<LineStyle, Weight> = { solid: 'light', dashed: 'dashed', heavy: 'heavy' };

export const CORNER: Partial<Record<TextShape, Corner>> = {
  rounded: 'round',
  cylinder: 'round',
  dot: 'round',
  hexagon: 'chamfer',
  diamond: 'chamfer',
};

const LINE_STYLE: Record<BoxLine['role'], Style> = {
  title: { bold: true },
  subtitle: { dim: true },
  note: { dim: true },
  row: {},
};

export const rgb = (css: string | undefined): Color | undefined => {
  const parsed = css === undefined ? undefined : parseColor(css);
  return parsed === undefined ? undefined : { rgb: parsed };
};

/** A node's accent, as the renderer resolves it: its own colour, the model's colour
 * for its type (or for every type), then the notation's for the type. */
export function accentCss(
  model: DiagramModel,
  node: DiagramNode,
  notation: NotationId | undefined,
): string | undefined {
  const typeColor = node.type !== undefined ? model.typeColors?.[node.type] : undefined;
  return node.color ?? typeColor ?? model.typeColors?.['*'] ?? typeLook(node.type, notation).accent;
}

/** How a box's border is drawn: heavy when selected (and for a fork bar), dashed
 * for a boundary, in the node's accent. */
function borderInk(p: Painter, id: string): Ink {
  const box = p.scene.boxes.get(id)!;
  const fg = rgb(accentCss(p.scene.input.model, p.scene.nodes.get(id)!.node, p.scene.notation));
  const weight: Weight = id === p.selected || box.shape === 'bar' ? 'heavy' : box.dashed ? 'dashed' : 'light';
  return { weight, style: fg !== undefined ? { fg } : {} };
}

/** An open container's frame. Its title is written later (`drawTitle`). */
function drawFrame(p: Painter, id: string, g: BoxGeometry): void {
  const ink = borderInk(p, id);
  p.canvas.rect(g, ink.weight, ink.style, CORNER[p.scene.boxes.get(id)!.shape]);
}

/** An open container's title, in its top border. Written after the edges: a line that
 * crosses the border there loses a cell, where the other way round the title would
 * lose a letter. */
function drawTitle(p: Painter, id: string, g: BoxGeometry): void {
  const title = p.scene.boxes.get(id)!.lines[0]?.text ?? '';
  const style = { bold: true, inverse: id === p.selected };
  if (title !== '') p.canvas.text({ x: g.x + 2, y: g.y }, ` ${title} `, style, g.x + g.width - 2);
}

/** A leaf or folded box: border, shape details, and its lines (centred, but a table's
 * rows left-aligned so their columns line up). */
function drawBox(p: Painter, id: string, g: BoxGeometry): void {
  const box: BoxText = p.scene.boxes.get(id)!;
  const ink = borderInk(p, id);
  const rule = (y: number): void => p.canvas.segment({ x: g.x, y }, { x: g.x + g.width - 1, y }, ink.weight, ink.style);
  p.canvas.clear({ x: g.x + 1, y: g.y + 1, width: g.width - 2, height: g.height - 2 });
  p.canvas.rect(g, ink.weight, ink.style, CORNER[box.shape]);
  let y = g.y + 1;
  if (box.shape === 'cylinder') rule(y++);
  let ruled = false;
  for (const line of box.lines) {
    if (line.role === 'row' && !ruled) {
      rule(y++);
      ruled = true;
    }
    const x = line.role === 'row' ? g.x + 2 : g.x + Math.floor((g.width - cellWidth(line.text)) / 2);
    const style = line.role === 'title' && id === p.selected ? { bold: true, inverse: true } : LINE_STYLE[line.role];
    p.canvas.text({ x, y: y++ }, line.text, style, g.x + g.width - 1);
  }
}

function edgeInk(p: Painter, edge: ViewEdge): Ink {
  const weight = WEIGHT[kindLook(edge, p.scene.notation).line];
  const fg = rgb(edge.style?.color ?? edge.tint);
  const base: Style = fg !== undefined ? { fg } : {};
  if (p.selected === undefined) return { weight, style: base };
  const mine = edge.from === p.selected || edge.to === p.selected;
  return { weight, style: { ...base, ...(mine ? { bold: true } : { dim: true }) } };
}

const OPPOSITE: Record<number, number> = { [UP]: DOWN, [DOWN]: UP, [LEFT]: RIGHT, [RIGHT]: LEFT };
const ARROW: Record<number, ArrowDirection> = { [UP]: 'up', [DOWN]: 'down', [LEFT]: 'left', [RIGHT]: 'right' };

/** Runs the line from an end into the border beside it, so the border shows a
 * junction (`┬`, `├`, …) where the line leaves or meets the box. */
function join(p: Painter, end: CellPoint, g: BoxGeometry | undefined, ink: Ink): void {
  const dir = g === undefined ? undefined : towardBox(end, g);
  if (dir === undefined) return;
  p.canvas.stroke(end, dir, ink.weight, ink.style);
  const step = STEP[dir]!;
  p.canvas.stroke({ x: end.x + step.x, y: end.y + step.y }, OPPOSITE[dir]!, 'light');
}

/** Which way a mark at an end points: at the box beside it. Not along the last
 * segment, which can run alongside the box — elk's last stub into a box is often under
 * a cell, and gone once the end is moved off the border. */
function arrowOf(end: CellPoint, prev: CellPoint, box: BoxGeometry | undefined): ArrowDirection {
  const toward = box === undefined ? undefined : towardBox(end, box);
  if (toward !== undefined) return ARROW[toward]!;
  if (end.y !== prev.y) return end.y > prev.y ? 'down' : 'up';
  return end.x > prev.x ? 'right' : 'left';
}

/** One end of an edge: its mark, or with none the line run into the border. */
function drawEnd(p: Painter, edge: ViewEdge, end: 'start' | 'end'): void {
  const points = p.scene.layout.routes.get(edge.id)!.points;
  if (points.length < 2) return;
  const look = kindLook(edge, p.scene.notation);
  const [at, prev] = end === 'start' ? [points[0]!, points[1]!] : [points.at(-1)!, points.at(-2)!];
  const box = p.scene.layout.boxes.get(end === 'start' ? edge.from : edge.to);
  const mark: EndMark = end === 'start' ? (look.start ?? 'none') : look.end;
  const ink = edgeInk(p, edge);
  if (mark === 'none') join(p, at, box, ink);
  else if (mark === 'arrow') p.canvas.put(at, p.glyphs.arrow(arrowOf(at, prev, box)), ink.style);
  else p.canvas.put(at, p.glyphs.mark(mark), ink.style);
}

const isFrame = (scene: Scene, id: string): boolean => {
  const vn = scene.nodes.get(id)!;
  return vn.state === 'expanded' && vn.children.length > 0;
};

/**
 * The scene as a canvas, in layers: open containers' frames from the outside in,
 * then the edges' lines, then the boxes over them (a box clears what is under it)
 * and the frames' titles, then edge labels and the ends of the edges, last so
 * nothing covers an arrowhead.
 */
export function paint(scene: Scene, options: PaintOptions): Canvas {
  const { layout } = scene;
  const p: Painter = { canvas: new Canvas(layout.width, layout.height), scene, ...options };
  const drawn = [...scene.nodes.keys()].flatMap((id) => {
    const g = layout.boxes.get(id);
    return g === undefined ? [] : [{ id, g, frame: isFrame(scene, id) }];
  });
  const edges = scene.view.edges.filter((e) => layout.routes.has(e.id));
  for (const { id, g, frame } of drawn) if (frame) drawFrame(p, id, g);
  for (const edge of edges) {
    const { points } = layout.routes.get(edge.id)!;
    const ink = edgeInk(p, edge);
    for (let i = 1; i < points.length; i++) p.canvas.segment(points[i - 1]!, points[i]!, ink.weight, ink.style);
  }
  for (const { id, g, frame } of drawn) (frame ? drawTitle : drawBox)(p, id, g);
  for (const edge of edges) {
    const label = layout.routes.get(edge.id)!.label;
    if (label !== undefined) p.canvas.text(label, label.text, edgeInk(p, edge).style);
    drawEnd(p, edge, 'start');
    drawEnd(p, edge, 'end');
  }
  return p.canvas;
}
