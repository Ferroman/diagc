import { Dots, type DotRect } from '../text/braille';
import type { Cell, CellPoint, CellRect, Style } from '../text/canvas';
import type { TextLayout } from '../text/layout';
import { clampScroll } from './nav';

// The overview: the whole picture drawn small in braille dots, in the canvas's corner,
// with the part on screen outlined. Boxes only — at this size an edge's line runs
// into the boxes' and leaves a smudge — since what it answers is where the reader is.

/** Where the overview's dots go on the screen, inside a border a cell wide. */
export interface OverviewPlace extends CellRect {
  /** overview cells per picture cell, the same across and down, so the shape is kept */
  scale: number;
}

/** The part of the picture on screen. */
export interface PictureWindow {
  scroll: CellPoint;
  width: number;
  height: number;
}

interface Extent {
  width: number;
  height: number;
}

/** The most of the canvas the overview takes, its border included: a third across and
 * half down, about square on a usual terminal, where a row is twice a column's height. */
const SHARE = { width: 1 / 3, height: 1 / 2 };
/** Less room than this inside the border and it is left out: too small to tell boxes apart. */
const MIN = { width: 6, height: 2 };

const clamp = (v: number, low: number, high: number): number => Math.max(low, Math.min(v, high));

/** Where the overview of `picture` goes in `view`, the canvas, or nowhere: with the
 * whole picture on screen there is nothing to find, and on a small screen no room. */
export function overviewPlace(picture: Extent, view: Extent & { top: number }): OverviewPlace | undefined {
  if (picture.width <= view.width && picture.height <= view.height) return undefined;
  const room = {
    width: Math.floor(view.width * SHARE.width) - 2,
    height: Math.floor(view.height * SHARE.height) - 2,
  };
  if (room.width < MIN.width || room.height < MIN.height) return undefined;
  const scale = Math.min(room.width / picture.width, room.height / picture.height);
  // min: the product can land a hair above the room, and ceil would take a cell more
  const width = Math.min(room.width, Math.max(1, Math.ceil(picture.width * scale)));
  const height = Math.min(room.height, Math.max(1, Math.ceil(picture.height * scale)));
  return { x: view.width - 1 - width, y: view.top + view.height - 1 - height, width, height, scale };
}

/** A rectangle of the picture as the overview's dots: every dot it touches, so a box
 * too small for one still shows as one. A cell is 2 dots across and 4 down. */
function toDots(r: CellRect, scale: number): DotRect {
  const x = Math.floor(r.x * scale * 2);
  const y = Math.floor(r.y * scale * 4);
  const right = Math.max(x, Math.ceil((r.x + r.width) * scale * 2) - 1);
  const bottom = Math.max(y, Math.ceil((r.y + r.height) * scale * 4) - 1);
  return { x, y, width: right - x + 1, height: bottom - y + 1 };
}

const overlaps = (a: DotRect, b: DotRect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** The window cut to the picture: past the picture's edge its outline would be lost. */
function onPicture(window: PictureWindow, picture: Extent): CellRect {
  const x = clamp(window.scroll.x, 0, picture.width);
  const y = clamp(window.scroll.y, 0, picture.height);
  return {
    x,
    y,
    width: clamp(window.scroll.x + window.width, x, picture.width) - x,
    height: clamp(window.scroll.y + window.height, y, picture.height) - y,
  };
}

/** The overview's cells, `place`'s size: each box's outline and the window's, what is
 * off screen dim and the selected box inverse, as it is on the canvas. */
export function overviewCells(
  layout: TextLayout,
  place: OverviewPlace,
  window: PictureWindow,
  selected?: string,
): Cell[][] {
  const dots = new Dots(place.width, place.height);
  for (const box of layout.boxes.values()) dots.outline(toDots(box, place.scale));
  const screen = toDots(onPicture(window, layout), place.scale);
  dots.outline(screen);
  const box = selected === undefined ? undefined : layout.boxes.get(selected);
  const chosen = box === undefined ? undefined : toDots(box, place.scale);
  return Array.from({ length: place.height }, (_, row) =>
    Array.from({ length: place.width }, (_, column) => {
      const cell = { x: column * 2, y: row * 4, width: 2, height: 4 };
      const style: Style =
        chosen !== undefined && overlaps(cell, chosen)
          ? { inverse: true }
          : overlaps(cell, screen)
            ? {}
            : { dim: true };
      return { ch: dots.char(column, row), style };
    }),
  );
}

/** Whether the screen cell `at` is on the overview, its border included. */
export function onOverview(place: OverviewPlace, at: CellPoint): boolean {
  return at.x >= place.x - 1 && at.x <= place.x + place.width && at.y >= place.y - 1 && at.y <= place.y + place.height;
}

/** The scroll that centres a window of `window`'s size on the part of the picture
 * under the screen cell `at`. A cell off the overview — its border, or a drag that
 * left it — counts as the nearest cell on it. */
export function overviewJump(place: OverviewPlace, at: CellPoint, window: Extent, picture: Extent): CellPoint {
  const column = clamp(at.x - place.x, 0, place.width - 1);
  const row = clamp(at.y - place.y, 0, place.height - 1);
  const centre = { x: (column + 0.5) / place.scale, y: (row + 0.5) / place.scale };
  return clampScroll(
    { x: Math.round(centre.x - window.width / 2), y: Math.round(centre.y - window.height / 2) },
    picture,
    window,
  );
}
