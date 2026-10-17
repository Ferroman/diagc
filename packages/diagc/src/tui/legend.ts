import type { LegendPosition } from '@diagc/core/internal';
import type { CellPoint, CellRect } from '../text/canvas';

// Where the legend goes in the canvas: the corner the diagram names, as in the browser.
// The overview keeps its corner — it is how the reader finds their way — so a legend
// that would share its columns sits over it instead, cut to the rows there.

interface Extent {
  width: number;
  height: number;
}

/** Less room than this and it is left out: its title and two of its lines, with border. */
const MIN = { width: 12, height: 4 };

/** Where a legend of `size` goes in `view`, the canvas, kept off `overview` (its place
 * with its border), or nowhere without the room. */
export function legendPlace(
  size: Extent,
  position: LegendPosition,
  view: Extent & { top: number },
  overview?: CellRect,
): CellRect | undefined {
  const width = Math.min(size.width, view.width);
  const x = position.endsWith('right') ? view.width - width : 0;
  const shares = overview !== undefined && x < overview.x + overview.width && overview.x < x + width;
  const bottom = shares ? overview.y : view.top + view.height;
  const height = Math.min(size.height, bottom - view.top);
  if (width < MIN.width || height < MIN.height) return undefined;
  return { x, y: position.startsWith('top') ? view.top : bottom - height, width, height };
}

/** Whether the screen cell `at` is on the legend, its border included. */
export function onLegend(place: CellRect, at: CellPoint): boolean {
  return at.x >= place.x && at.x < place.x + place.width && at.y >= place.y && at.y < place.y + place.height;
}
