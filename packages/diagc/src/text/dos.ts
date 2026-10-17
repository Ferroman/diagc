import type { DiagramModel, NotationId } from '@diagc/core/internal';
import { parseColor } from './ansi';
import type { Canvas, CellRect, Color, Style } from './canvas';
import { typeLook } from './vocabulary';

// The DOS style in character cells: the browser's Turbo Vision screen (the DOS preset
// in packages/renderer/src/sketch/stylePresets.ts, its rules in presets.css) as far as
// a terminal can draw it. A blue desktop; boxes solid in CGA's light colours, one per
// type, in a white double frame with a block shadow; open groups double-framed in
// their type's colour and titled on the frame; lines white, their labels yellow.
// dos.test.ts holds the palette and the colouring rule to the renderer's.

/** The styles a terminal draws: its own, and DOS. The rest are the browser's. */
export type TextStyle = 'clean' | 'dos';

/** The style a diagram asks to be drawn in, as far as a terminal has it. */
export const styleOf = (model: Pick<DiagramModel, 'style'>): TextStyle => (model.style === 'dos' ? 'dos' : 'clean');

/** CGA's light colours, the boxes' by type in slot order: every one takes black text. */
export const DOS_PALETTE: readonly string[] = [
  '#aaaaaa',
  '#00aaaa',
  '#00aa00',
  '#55ffff',
  '#ffff55',
  '#55ff55',
  '#ff55ff',
  '#ff5555',
];

/** A colour a palette or an author wrote down, as against one of the terminal's own. */
export type Rgb = Extract<Color, { rgb: unknown }>;

const cga = (css: string): Rgb => ({ rgb: parseColor(css)! });

export const BLUE = cga('#0000aa');
export const WHITE = cga('#ffffff');
export const BLACK = cga('#000000');
export const GREY = cga('#aaaaaa');
export const CYAN = cga('#00aaaa');
export const YELLOW = cga('#ffff55');
export const RED = cga('#aa0000');
const DARK_GREY = cga('#555555');

/** What the picture, and the screen round it, lie on. */
export const DESKTOP: Style = { bg: BLUE, fg: WHITE };
/** A box's block shadow: what it falls on, dark grey on black, as Turbo Vision casts it. */
export const SHADOW: Style = { bg: BLACK, fg: DARK_GREY };
/** How far right and down the shadow falls: two columns to one row, a cell being about
 * twice as tall as it is wide. */
export const SHADOW_REACH = { x: 2, y: 1 };

/**
 * Each node type's palette slot, as the renderer's `typeSlots` gives it: by first
 * appearance, the types of the nodes that contain nothing first, and the types a
 * notation fills alike (C4's containers) sharing one. Counted over the whole model, so
 * a drill or a plane switch never recolours a box.
 */
export function dosSlots(
  model: Pick<DiagramModel, 'nodes' | 'containment'>,
  notation?: NotationId,
): Map<string, number> {
  const parents = new Set(model.containment.map((e) => e.parent));
  const ordered = [...model.nodes.filter((n) => !parents.has(n.id)), ...model.nodes.filter((n) => parents.has(n.id))];
  const byKey = new Map<string, number>();
  const slots = new Map<string, number>();
  for (const n of ordered) {
    if (n.type === undefined || slots.has(n.type)) continue;
    // a notation's fill is the accent the text vocabulary keeps for the type
    const key = typeLook(n.type, notation).accent ?? `type:${n.type}`;
    const slot = byKey.get(key) ?? byKey.size;
    byKey.set(key, slot);
    slots.set(n.type, slot);
  }
  return slots;
}

/** A box's colour: its own (`css`, as the author or the notation set it), else its
 * type's from the palette; nothing for an untyped box, which is grey. */
export function dosHue(css: string | undefined, type: string | undefined, slots: ReadonlyMap<string, number>): Rgb {
  const own = css === undefined ? undefined : parseColor(css);
  if (own !== undefined) return { rgb: own };
  const slot = type === undefined ? undefined : slots.get(type);
  return slot === undefined ? GREY : cga(DOS_PALETTE[slot % DOS_PALETTE.length]!);
}

/** Black or white, whichever reads on `rgb`: the renderer's `hueInk`. */
export function inkOn([r, g, b]: readonly number[]): Rgb {
  const linear = (v: number): number => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  // 0.179 is the luminance at which black and white text contrast equally
  return 0.2126 * linear(r!) + 0.7152 * linear(g!) + 0.0722 * linear(b!) > 0.179 ? BLACK : WHITE;
}

/** `share` of `a` over `b`: a box's small print, its ink 70% over its fill as the page
 * mixes it. */
export const mixed = (a: readonly number[], b: readonly number[], share: number): Rgb => ({
  rgb: [0, 1, 2].map((i) => Math.round(a[i]! * share + b[i]! * (1 - share))) as [number, number, number],
});

const inside = (boxes: readonly CellRect[], x: number, y: number): boolean =>
  boxes.some((b) => x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height);

/** Each box's block shadow, cast over whatever lies beside it and below it — a line, a
 * frame, an arrowhead, which keep their characters in the shade — but never on a box. */
export function castShadows(canvas: Canvas, boxes: readonly CellRect[]): void {
  const { x: dx, y: dy } = SHADOW_REACH;
  for (const b of boxes) {
    const [right, bottom] = [b.x + b.width, b.y + b.height];
    for (let y = b.y + dy; y < bottom + dy; y++) {
      for (let x = b.x + dx; x < right + dx; x++) {
        const beside = x >= right || y >= bottom;
        if (beside && !inside(boxes, x, y)) canvas.restyle({ x, y, width: 1, height: 1 }, SHADOW);
      }
    }
  }
}
