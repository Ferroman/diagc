import type { LegendPosition } from '@diagc/core/internal';
import { serialize, type ColorMode } from './ansi';
import type { Cell } from './canvas';
import { ASCII, UNICODE } from './glyphs';
import { legendCells } from './legend';
import { paint } from './paint';
import { buildScene, type SceneInput } from './scene';

export interface TextOptions {
  /** plain ASCII in place of box-drawing characters */
  ascii: boolean;
  color: ColorMode;
}

/** The picture with its legend beside it, as the corner it names would have it: over
 * or under the picture with a blank row between, against its left or right edge. Not
 * over the picture, as on a canvas, where a printed picture would lose what it covers.
 * A legend wider than the picture starts at the left edge either way: set against the
 * right one, it would push the picture along for the sake of its key. */
function withLegend(picture: Cell[][], legend: Cell[][], position: LegendPosition): Cell[][] {
  const indent = position.endsWith('right') ? Math.max(0, (picture[0]?.length ?? 0) - (legend[0]?.length ?? 0)) : 0;
  const placed = legend.map((row) => [...Array.from({ length: indent }, () => ({ ch: ' ', style: {} })), ...row]);
  return position.startsWith('top') ? [...placed, [], ...picture] : [...picture, [], ...placed];
}

/** A diagram's view as lines of text, with the legend it declares; none when the view
 * has nothing in it. A legend only offered (for shapes that say nothing of themselves)
 * is left out, as the published picture leaves it out. */
export async function renderToLines(input: SceneInput, options: TextOptions): Promise<string[]> {
  const glyphs = options.ascii ? ASCII : UNICODE;
  const scene = await buildScene(input, glyphs);
  if (scene.layout.boxes.size === 0) return [];
  const picture = paint(scene, { glyphs }).cells(glyphs);
  const legend = scene.legend?.declared === true ? scene.legend : undefined;
  const cells = legend === undefined ? picture : withLegend(picture, legendCells(legend, glyphs), legend.position);
  return serialize(cells, options.color);
}
