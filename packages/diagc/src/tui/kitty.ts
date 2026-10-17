import { deflateSync } from 'node:zlib';
import type { CellRect } from '../text/canvas';
import type { Reply } from './keys';
import type { CellPixels } from './overview';

// Pictures on the terminal through kitty's graphics protocol
// (https://sw.kovidgoyal.net/kitty/graphics-protocol/), which kitty, Ghostty and
// WezTerm speak: as much of it as the overview needs. One image, placed over cells the
// screen leaves blank, sent again only when it changes. A terminal that never says it
// shows images keeps the braille overview, and so does tmux, which keeps the query to
// itself.

/** What the TUI asks the terminal as it starts: its text colour (OSC 10), its cell's
 * size in pixels (CSI 16 t), and whether it shows images, by the query the protocol
 * keeps for that, which a terminal without it ignores. Terminals answer in order, so
 * by the time the last answer comes the others have. */
export const TERMINAL_QUERY = '\x1b]10;?\x1b\\\x1b[16t\x1b_Gi=31,s=1,v=1,a=q,t=d,f=24;AAAA\x1b\\';

/** The cell's size again, after a resize: a font size change is one. */
export const CELL_SIZE_QUERY = '\x1b[16t';

/** The overview's image id: any number, since the TUI's screen is its own. */
export const OVERVIEW_IMAGE = 0x64696167;

/** The protocol's limit on one command's base64 payload. */
const CHUNK = 4096;

/** A cell's size where the terminal does not say, about a usual one: the terminal scales
 * the image to its cells either way, so a wrong guess only blurs it. */
const CELL_STAND_IN: CellPixels = { width: 10, height: 20 };
/** Text colour where the terminal does not say: as readable on a light ground as a dark one. */
const INK_STAND_IN: [number, number, number] = [128, 128, 128];

/** What the terminal has said about itself. */
export interface Heard {
  images?: boolean;
  cell?: CellPixels;
  ink?: [number, number, number];
}

/** A terminal that shows images: its cell's size in pixels, and its text colour, which
 * the overview is drawn in, so it looks like the rest of the screen's text. */
export interface Graphics {
  cell: CellPixels;
  ink: [number, number, number];
}

/** An image for a frame, `width` × `height` pixels of RGBA, over the cells of `place`. */
export interface FrameImage {
  place: CellRect;
  width: number;
  height: number;
  rgba: Uint8Array;
}

export function hear(heard: Heard, reply: Reply): Heard {
  if (reply.kind === 'graphics') return { ...heard, images: reply.ok };
  if (reply.kind === 'text-color') return { ...heard, ink: reply.rgb };
  // 0 is a terminal that does not know
  const { width, height } = reply;
  return width > 0 && height > 0 ? { ...heard, cell: { width, height } } : heard;
}

export function graphicsOf(heard: Heard): Graphics | undefined {
  return heard.images === true ? { cell: heard.cell ?? CELL_STAND_IN, ink: heard.ink ?? INK_STAND_IN } : undefined;
}

const command = (keys: string, payload?: string): string =>
  `\x1b_G${keys}${payload === undefined ? '' : `;${payload}`}\x1b\\`;

/** The image, sent and shown at its place in one go, zlib-compressed. The cursor goes to
 * the place's corner, and stays there: the frame positions its own. Sending an image under
 * an id already in use replaces it. */
function showImage({ place, width, height, rgba }: FrameImage): string {
  const data = deflateSync(rgba).toString('base64');
  const chunks = data.match(new RegExp(`.{1,${CHUNK}}`, 'g')) ?? [''];
  const keys = `a=T,f=32,o=z,s=${width},v=${height},c=${place.width},r=${place.height},i=${OVERVIEW_IMAGE},p=1,C=1,q=2`;
  const sent = chunks.map((chunk, i) => {
    const more = `m=${i < chunks.length - 1 ? 1 : 0}`;
    return command(i === 0 ? `${keys},${more}` : `q=2,${more}`, chunk);
  });
  return `\x1b[${place.y + 1};${place.x + 1}H${sent.join('')}`;
}

/** The image off the screen, and out of the terminal's memory. */
const removeImage = (): string => command(`a=d,d=I,i=${OVERVIEW_IMAGE},q=2`);

const sameImage = (a: FrameImage, b: FrameImage): boolean =>
  a.place.x === b.place.x &&
  a.place.y === b.place.y &&
  a.place.width === b.place.width &&
  a.place.height === b.place.height &&
  a.width === b.width &&
  a.height === b.height &&
  Buffer.from(a.rgba.buffer, a.rgba.byteOffset, a.rgba.byteLength).equals(b.rgba);

/** What turns the image `shown` into `next` on the screen: nothing when they are the same,
 * which is most frames, since every frame rewrites the text but an image stays put. */
export function imageChange(shown: FrameImage | undefined, next: FrameImage | undefined): string {
  if (next === undefined) return shown === undefined ? '' : removeImage();
  return shown !== undefined && sameImage(shown, next) ? '' : showImage(next);
}
