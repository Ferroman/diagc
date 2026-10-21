import type { DiagramModel } from '@diagc/core/internal';
import { serialize, type ColorMode } from '../text/ansi';
import type { Cell, CellPoint, CellRect, Style } from '../text/canvas';
import { BLACK, CYAN, DESKTOP, GREY, RED, SHADOW, SHADOW_REACH, WHITE, type TextStyle } from '../text/dos';
import { UNICODE } from '../text/glyphs';
import { legendCells, legendSize } from '../text/legend';
import type { Scene } from '../text/scene';
import { subtitleOf } from '../text/vocabulary';
import { cellWidth, charWidth, fitCells, isControl, printable } from '../text/width';
import { detailLines } from './details';
import type { FrameImage, Graphics } from './kitty';
import { legendPlace } from './legend';
import type { View } from './nav';
import { overviewCells, overviewPixels, overviewPlace, type OverviewPlace } from './overview';
import type { DiagramState, TuiState } from './state';

// One frame of the TUI, as lines exactly the terminal's size: a title row, the canvas
// (a window onto the painted picture, the overview and the legend in their corners,
// and the details panel beside it), and a status row. Built cell by cell, so a wide character at a
// window's edge can be blanked instead of shifting the rest of the row.

/** The details panel's columns, its separator included. */
export const PANEL_WIDTH = 40;
/** The panel takes its columns from the canvas only on a terminal at least this wide;
 * on a narrower one it takes the whole canvas while it is open. */
const PANEL_MIN_COLUMNS = 80;

export interface Size {
  columns: number;
  rows: number;
}

export interface FrameInput {
  model?: DiagramModel;
  scene?: Scene;
  /** the painted picture */
  canvas?: Cell[][];
  /** what to say where there is nothing to show yet */
  notice?: string;
  /** the terminal shows images: the overview goes as one */
  graphics?: Graphics;
  /** the style the screen is drawn in; absent = the terminal's own */
  style?: TextStyle;
}

type Row = Cell[];

/** How `write` writes: the style, and the column it stops before. */
interface Pen {
  style?: Style;
  maxX?: number;
}

/** [keys, what they do], for the help */
const HELP: readonly (readonly [string, string])[] = [
  ['arrows, h j k l', 'move between boxes'],
  ['Tab, Shift-Tab', 'next / previous box'],
  ['Enter, Space', 'unfold / fold the box'],
  ['e, c', 'unfold / fold everything'],
  ['>, <', 'go into the box / back out'],
  ['p, P', 'next / previous plane'],
  ['1 … 9', 'turn a layer on or off'],
  ['/, n, N', 'search; next / previous match'],
  ['i', 'details of the box'],
  ['o', 'overview on / off'],
  ['L', 'legend on / off'],
  ['H', 'a git graph across / down'],
  ['s', 'DOS style on / off'],
  ['Shift-arrows, PgUp, PgDn', 'scroll'],
  ['Home, End, mouse wheel', 'scroll'],
  ['click, double-click, drag', 'select, fold, pan'],
  ['click, drag on the overview', 'go there'],
  ['r', 'reload'],
  ['Esc', 'close; back to the list'],
  ['q, Ctrl-C', 'quit'],
];

const INVERSE: Style = { inverse: true };
const DIM: Style = { dim: true };

/** How the screen's parts look in a style. */
interface Chrome {
  /** the title row */
  title: Style;
  /** the status row: its text, its hints and its complaints */
  status: Style;
  hint: Style;
  error: Style;
  /** what the canvas and the list lie on */
  ground: Style;
  /** the list's current row */
  current: Style;
  /** the details panel, and its rule against the canvas */
  panel: Style;
  rule: Style;
  /** the help: inside it, its frame and the frame's characters (corners, across, down) */
  dialog: Style;
  border: Style;
  frame: readonly [string, string, string, string, string, string];
  /** what a dialog's shadow does to what it falls on */
  shadow?: Style;
  /** the overview image's colour, in place of the terminal's text colour */
  ink?: [number, number, number];
}

/** The terminal's own look: its colours, with inverse for the bars. */
const CLEAN: Chrome = {
  title: INVERSE,
  status: {},
  hint: DIM,
  error: { fg: { ansi: 9 }, bold: true },
  ground: {},
  current: INVERSE,
  panel: {},
  rule: DIM,
  dialog: {},
  border: {},
  frame: ['┌', '┐', '└', '┘', '─', '│'],
};

const BAR: Style = { fg: BLACK, bg: GREY };

/** Turbo Vision's: a grey menu bar and status line over the blue desktop, the list's
 * row and the panel a cyan window, the help a grey dialog in a double frame. */
const DOS: Chrome = {
  title: BAR,
  status: BAR,
  hint: BAR,
  error: { ...BAR, fg: RED, bold: true },
  ground: DESKTOP,
  current: { fg: BLACK, bg: CYAN },
  panel: { fg: BLACK, bg: CYAN },
  rule: { fg: BLACK, bg: CYAN },
  dialog: BAR,
  border: { fg: WHITE, bg: GREY },
  frame: ['╔', '╗', '╚', '╝', '═', '║'],
  shadow: SHADOW,
  ink: WHITE.rgb,
};

const chromeOf = (input: Pick<FrameInput, 'style'>): Chrome => (input.style === 'dos' ? DOS : CLEAN);

const blankRow = (columns: number, style: Style = {}): Row =>
  Array.from({ length: columns }, () => ({ ch: ' ', style }));

/** Before cell `i` is overwritten: if it is half of a wide character, blank the other
 * half, so an overlay over a wide character never leaves the row a cell short or
 * long. The canvas's `unwide`, for rows. */
function unwide(row: Row, i: number): void {
  const left = row[i - 1];
  if (row[i]?.ch === '' && left !== undefined) row[i - 1] = { ch: ' ', style: left.style };
  const right = row[i + 1];
  if (right?.ch === '') row[i + 1] = { ch: ' ', style: right.style };
}

/** Writes `text` into `row` from `x`, never past `maxX` (the row's end by default)
 * and never half a wide character. Returns where it stopped. */
function write(row: Row, x: number, text: string, { style = {}, maxX = row.length }: Pen = {}): number {
  let at = x;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    // never sent to the terminal, where it would move the cursor instead of drawing
    if (isControl(cp)) continue;
    const w = charWidth(cp);
    if (w === 0) {
      if (at > x && row[at - 1] !== undefined) row[at - 1]!.ch += ch;
      continue;
    }
    if (at + w > Math.min(maxX, row.length)) break;
    unwide(row, at);
    row[at] = { ch, style };
    if (w === 2) {
      // the cell the second half takes may start another wide character
      const after = row[at + 2];
      if (row[at + 1]?.ch !== '' && after?.ch === '') row[at + 2] = { ch: ' ', style: after.style };
      row[at + 1] = { ch: '', style };
    }
    at += w;
  }
  return at;
}

/** A whole row: `text` from the second cell, the rest blank, all in `style`. */
function bar(columns: number, text: string, style: Style): Row {
  const row = blankRow(columns).map((c) => ({ ...c, style }));
  write(row, 1, text, { style });
  return row;
}

/** Copies the picture's cells under the window at `scroll` into `rows`, `area` wide
 * from column 0 and from row `top`. A wide character cut by either edge is a blank. */
function blit(rows: Row[], picture: Cell[][], scroll: CellPoint, area: { top: number; width: number; height: number }) {
  for (let r = 0; r < area.height; r++) {
    const src = picture[scroll.y + r];
    const dst = rows[area.top + r];
    if (src === undefined || dst === undefined) continue;
    for (let c = 0; c < area.width; c++) {
      const cell = src[scroll.x + c];
      if (cell === undefined) break;
      const cutLeft = cell.ch === '' && c === 0;
      const cutRight = src[scroll.x + c + 1]?.ch === '' && cell.ch !== '' && c === area.width - 1;
      dst[c] = cutLeft || cutRight ? { ch: ' ', style: cell.style } : cell;
    }
  }
}

/** `text` in the middle of the canvas. */
function centred(rows: Row[], area: { top: number; width: number; height: number }, text: string): void {
  const row = rows[area.top + (area.height >> 1)];
  if (row !== undefined)
    write(row, Math.max(0, (area.width - cellWidth(text)) >> 1), text, { style: DIM, maxX: area.width });
}

/** The canvas area the picture is drawn in: the rows between the title and the status,
 * less the panel's columns when it sits beside the picture. `reduce` reads the same. */
export function canvasSize(state: TuiState, size: Size): { top: number; width: number; height: number } {
  const beside = state.diagram?.panel === true && size.columns >= PANEL_MIN_COLUMNS;
  return { top: 1, width: Math.max(0, size.columns - (beside ? PANEL_WIDTH : 0)), height: Math.max(0, size.rows - 2) };
}

/** Whether the canvas shows a picture for the overview and the legend to lie over: not
 * off the diagram screen, without one, or where the panel covers the canvas. */
function pictureShown(state: TuiState, scene: Scene | undefined, size: Size): scene is Scene {
  const d = state.diagram;
  if (state.screen !== 'diagram' || d === undefined || scene === undefined) return false;
  return scene.layout.boxes.size > 0 && !(d.panel && size.columns < PANEL_MIN_COLUMNS);
}

/** Where the overview goes on this screen, whether or not it is on. `reduce` reads the
 * same, for clicks. */
export function overviewPlaceOf(state: TuiState, scene: Scene | undefined, size: Size): OverviewPlace | undefined {
  return pictureShown(state, scene, size) ? overviewPlace(scene.layout, canvasSize(state, size)) : undefined;
}

/** The canvas as the scroll reads it: its size, and the corner the overview's frame
 * covers while it is on, which a selected box is kept out of and the scroll may run
 * past the picture to uncover. `reduce` and `settle` read it. */
export function viewOf(state: TuiState, scene: Scene | undefined, size: Size): View & { top: number } {
  const canvas = canvasSize(state, size);
  const place = state.diagram?.overview === true ? overviewPlaceOf(state, scene, size) : undefined;
  return place === undefined ? canvas : { ...canvas, corner: { width: place.width + 2, height: place.height + 2 } };
}

/** Where the legend goes on this screen, its border included, whether or not it is on:
 * kept off the overview while that is on. `reduce` reads the same, for clicks. */
export function legendPlaceOf(state: TuiState, scene: Scene | undefined, size: Size): CellRect | undefined {
  if (!pictureShown(state, scene, size) || scene.legend === undefined) return undefined;
  const overview = state.diagram?.overview === true ? overviewPlaceOf(state, scene, size) : undefined;
  const framed = overview && {
    x: overview.x - 1,
    y: overview.y - 1,
    width: overview.width + 2,
    height: overview.height + 2,
  };
  return legendPlace(legendSize(scene.legend), scene.legend.position, canvasSize(state, size), framed);
}

/** Where the overview is drawn on this frame: on, with a place, over a picture. */
function overviewDrawn(state: TuiState, input: FrameInput, size: Size): OverviewPlace | undefined {
  if (state.diagram?.overview !== true || input.canvas === undefined) return undefined;
  return overviewPlaceOf(state, input.scene, size);
}

/** Whether the overview goes as an image: the terminal shows them, and the help is not
 * up — it lies over the overview, and an image sits above the text. */
const asImage = (d: DiagramState, input: FrameInput): boolean => input.graphics !== undefined && !d.help;

/** The overview as an image, where it is drawn as one on this frame. */
export function overviewImage(state: TuiState, input: FrameInput, size: Size): FrameImage | undefined {
  const [d, place, scene, graphics] = [state.diagram, overviewDrawn(state, input, size), input.scene, input.graphics];
  if (d === undefined || place === undefined || scene === undefined || graphics === undefined || !asImage(d, input))
    return undefined;
  const { width, height } = canvasSize(state, size);
  const window = { scroll: d.scroll, width, height };
  const pixels = overviewPixels(scene.layout, { ...place, cell: graphics.cell }, window, d.selected);
  return { place, width: pixels.width, height: pixels.height, rgba: pixels.rgba(chromeOf(input).ink ?? graphics.ink) };
}

function titleOf(d: DiagramState, model: DiagramModel | undefined): string {
  if (model === undefined) return d.name;
  const name = (id: string): string => printable(model.nodes.find((n) => n.id === id)?.name ?? id);
  const parts = [[d.name, ...d.path.map(name)].join(' › ')];
  const plane = model.planes.find((p) => p.id === d.plane) ?? model.planes[0];
  if (plane !== undefined) parts.push(printable(plane.name));
  const layers = model.layers
    .slice(0, 9)
    .map((l, i) => `[${i + 1}] ${printable(l.name)}${d.layers.includes(l.id) ? ' ✓' : ''}`)
    .join('  ');
  if (layers !== '') parts.push(`layers ${layers}`);
  return parts.join(' · ');
}

function statusOf(d: DiagramState, input: FrameInput): [text: string, style: Style] {
  const chrome = chromeOf(input);
  if (d.search?.editing === true) return [`/${d.search.query}_`, chrome.status];
  if (d.message !== undefined) return [d.message.text, d.message.error ? chrome.error : chrome.status];
  const node = d.selected === undefined ? undefined : input.model?.nodes.find((n) => n.id === d.selected);
  if (node === undefined)
    return ['arrows move · Enter fold · > go in · / search · i details · ? help · q quit', chrome.hint];
  const subtitle = printable(subtitleOf(node, input.scene?.notation));
  const name = printable(node.name);
  return [`${name}${subtitle === '' ? '' : `  ${subtitle}`}   · Enter fold · i details · ? help`, chrome.status];
}

function drawPanel(rows: Row[], d: DiagramState, input: FrameInput, size: Size): void {
  const { panel, rule } = chromeOf(input);
  const beside = size.columns >= PANEL_MIN_COLUMNS;
  const left = beside ? size.columns - PANEL_WIDTH : 0;
  const width = beside ? PANEL_WIDTH - 3 : size.columns - 2;
  const lines =
    d.selected !== undefined && input.model !== undefined
      ? detailLines(input.model, d.selected, width, input.scene?.notation)
      : ['Select a box to see its details.'];
  for (let r = 1; r < size.rows - 1; r++) {
    const row = rows[r]!;
    for (let c = left; c < size.columns; c++) row[c] = { ch: ' ', style: panel };
    if (beside) row[left] = { ch: '│', style: rule };
    const line = lines[r - 1];
    if (line !== undefined)
      write(row, left + (beside ? 2 : 1), line, { style: r === 1 ? { ...panel, bold: true } : panel });
  }
}

/** The overview, opaque over the canvas, in a border a cell wide around `place`; blank
 * inside where an image goes over it. */
function drawOverview(rows: Row[], d: DiagramState, scene: Scene, places: OverviewPlaces): void {
  const { canvas, overview: place, image } = places;
  const { width, height } = canvas;
  const cells = image
    ? Array.from({ length: place.height }, () => blankRow(place.width))
    : overviewCells(scene.layout, place, { scroll: d.scroll, width, height }, d.selected);
  const [left, right] = [place.x - 1, place.x + place.width];
  for (let r = -1; r <= place.height; r++) {
    const row = rows[place.y + r];
    if (row === undefined) continue;
    if (r === -1 || r === place.height) {
      const [l, rt] = r === -1 ? ['┌', '┐'] : ['└', '┘'];
      write(row, left, `${l}${'─'.repeat(place.width)}${rt}`, { style: DIM });
      continue;
    }
    write(row, left, '│', { style: DIM });
    cells[r]!.forEach((cell, c) => write(row, place.x + c, cell.ch, { style: cell.style }));
    write(row, right, '│', { style: DIM });
  }
  const title = ' overview ';
  if (cellWidth(title) <= place.width - 2) write(rows[place.y - 1]!, left + 2, title, { style: DIM });
}

/** The legend, opaque over the canvas, cut to `place`. */
function drawLegend(rows: Row[], scene: Scene, place: CellRect): void {
  if (scene.legend === undefined) return;
  legendCells(scene.legend, UNICODE, place).forEach((cells, r) => {
    const row = rows[place.y + r];
    if (row !== undefined) cells.forEach((cell, c) => write(row, place.x + c, cell.ch, { style: cell.style }));
  });
}

/** A dialog's shadow, where the chrome casts one: two columns right of `box` and a row
 * below, as the DOS style's boxes cast theirs. */
function shade(rows: Row[], box: CellRect, shadow: Style | undefined): void {
  if (shadow === undefined) return;
  const [right, bottom] = [box.x + box.width, box.y + box.height];
  for (let y = box.y + SHADOW_REACH.y; y < bottom + SHADOW_REACH.y; y++) {
    const row = rows[y];
    for (let x = box.x + SHADOW_REACH.x; x < right + SHADOW_REACH.x; x++) {
      const cell = row?.[x];
      if (cell !== undefined && (x >= right || y >= bottom))
        row![x] = { ch: cell.ch, style: { ...cell.style, ...shadow } };
    }
  }
}

function drawHelp(rows: Row[], area: { top: number; width: number; height: number }, chrome: Chrome): void {
  const keyWidth = Math.max(...HELP.map(([k]) => cellWidth(k)));
  const lines = HELP.map(([k, what]) => `${k}${' '.repeat(keyWidth - cellWidth(k))}  ${what}`);
  const width = Math.min(area.width, Math.max(...lines.map(cellWidth)) + 4);
  const height = Math.min(area.height, lines.length + 2);
  if (width < 3 || height < 2) return;
  const x = (area.width - width) >> 1;
  const y = area.top + ((area.height - height) >> 1);
  const [tl, tr, bl, br, across, down] = chrome.frame;
  for (let r = 0; r < height; r++) {
    const row = rows[y + r]!;
    const edge = r === 0 || r === height - 1;
    const [l, rt] = r === 0 ? [tl, tr] : r === height - 1 ? [bl, br] : [down, down];
    write(row, x, l, { style: chrome.border });
    write(row, x + 1, (edge ? across : ' ').repeat(width - 2), { style: edge ? chrome.border : chrome.dialog });
    write(row, x + width - 1, rt, { style: chrome.border });
    if (!edge) write(row, x + 2, lines[r - 1] ?? '', { style: chrome.dialog, maxX: x + width - 1 });
  }
  write(rows[y]!, x + 2, ' Keys ', { style: { ...chrome.border, bold: true }, maxX: x + width - 1 });
  shade(rows, { x, y, width, height }, chrome.shadow);
}

/** The canvas's cells that set no background of their own, laid on the chrome's ground:
 * the picture's lies on it already, but not what lies over the picture. */
function onGround(rows: Row[], area: { top: number; height: number }, ground: Style): void {
  if (ground.bg === undefined) return;
  for (const row of rows.slice(area.top, area.top + area.height)) {
    row.forEach((cell, c) => {
      if (cell.style.bg === undefined) row[c] = { ch: cell.ch, style: { ...ground, ...cell.style } };
    });
  }
}

/** Where a frame's parts go: the canvas, and the overview and the legend where they
 * have a place. */
interface Places {
  canvas: ReturnType<typeof canvasSize>;
  overview?: OverviewPlace;
  legend?: CellRect;
}

type OverviewPlaces = Required<Pick<Places, 'canvas' | 'overview'>> & { image: boolean };

function composeDiagram(d: DiagramState, input: FrameInput, size: Size, places: Places): Row[] {
  const chrome = chromeOf(input);
  const rows = Array.from({ length: size.rows }, () => blankRow(size.columns, chrome.ground));
  const area = places.canvas;
  rows[0] = bar(size.columns, titleOf(d, input.model), chrome.title);
  if (input.scene === undefined || input.canvas === undefined) centred(rows, area, input.notice ?? 'Loading…');
  else if (input.scene.layout.boxes.size === 0) centred(rows, area, 'Nothing on this plane');
  else {
    blit(rows, input.canvas, d.scroll, area);
    const place = places.overview;
    if (d.overview && place !== undefined) {
      drawOverview(rows, d, input.scene, { canvas: area, overview: place, image: asImage(d, input) });
    }
    if (d.legend && places.legend !== undefined) drawLegend(rows, input.scene, places.legend);
  }
  onGround(rows, area, chrome.ground);
  if (d.panel && size.rows > 2) drawPanel(rows, d, input, size);
  if (d.help) drawHelp(rows, area, chrome);
  if (size.rows > 1) {
    const [text, style] = statusOf(d, input);
    rows[size.rows - 1] = bar(size.columns, fitCells(text, Math.max(0, size.columns - 2)), style);
  }
  return rows;
}

function composeList(state: TuiState, input: FrameInput, size: Size): Row[] {
  const chrome = chromeOf(input);
  const rows = Array.from({ length: size.rows }, () => blankRow(size.columns, chrome.ground));
  const count = state.names.length;
  rows[0] = bar(size.columns, `diagc · ${count} diagram${count === 1 ? '' : 's'}`, chrome.title);
  const area = { top: 1, width: size.columns, height: Math.max(0, size.rows - 2) };
  if (count === 0) centred(rows, area, input.notice ?? 'No diagrams under .diagrams/src');
  // keep the current name on screen: scroll the list once it passes the bottom
  const first = Math.max(0, state.index - area.height + 1);
  for (let r = 0; r < area.height && first + r < count; r++) {
    const current = first + r === state.index;
    // the marker as well as the inverse bar: a terminal may show no attributes at all
    const name = state.names[first + r]!;
    const row = current ? bar(size.columns, `› ${name}`, chrome.current) : blankRow(size.columns, chrome.ground);
    if (!current) write(row, 3, name, { style: chrome.ground });
    rows[area.top + r] = row;
  }
  onGround(rows, area, chrome.ground);
  // with names to show, a notice is what the last pick ran into, said in the status row
  const [status, style] =
    count > 0 && input.notice !== undefined
      ? [input.notice, chrome.error]
      : ['Enter open · ↑↓ move · s style · r reload · q quit', chrome.hint];
  if (size.rows > 1) rows[size.rows - 1] = bar(size.columns, fitCells(status, Math.max(0, size.columns - 2)), style);
  return rows;
}

/** The frame for `state`: `size.rows` lines of `size.columns` cells each. */
export function composeFrame(state: TuiState, input: FrameInput, size: Size, mode: ColorMode): string[] {
  const safe = { columns: Math.max(0, size.columns), rows: Math.max(0, size.rows) };
  const rows =
    state.screen === 'diagram' && state.diagram !== undefined
      ? composeDiagram(state.diagram, input, safe, {
          canvas: canvasSize(state, safe),
          overview: overviewPlaceOf(state, input.scene, safe),
          legend: legendPlaceOf(state, input.scene, safe),
        })
      : composeList(state, input, safe);
  return serialize(rows.slice(0, safe.rows), mode, false);
}

/** The escapes that put `lines` on the screen in one go: each line at its row, then
 * `images`' commands, inside a synchronized update, so a terminal that has them never
 * shows a frame half drawn. */
export function frameText(lines: readonly string[], images = ''): string {
  return `\x1b[?2026h${lines.map((line, i) => `\x1b[${i + 1};1H${line}`).join('')}${images}\x1b[?2026l`;
}
