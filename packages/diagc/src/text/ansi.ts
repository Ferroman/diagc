import type { Cell, Color, Style } from './canvas';

/** How much colour the output may use: none (a pipe, NO_COLOR), the 256-colour
 * palette every modern terminal has, or 24-bit where the terminal says it has it.
 * `mono` is the TUI's no-colour: bold, dim and inverse but no colours, because a
 * screen without inverse has no way to show where the reader is. */
export type ColorMode = 'none' | 'mono' | 'ansi256' | 'truecolor';

/** A CSS colour as RGB, for the forms a diagram writes literally (`#rgb`, `#rrggbb`,
 * `rgb(r, g, b)`). Anything else — a theme variable, a colour name — has no value
 * outside a browser, and the cell keeps the terminal's own colour. */
export function parseColor(css: string): [number, number, number] | undefined {
  const s = css.trim().toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s);
  if (short !== null) return [1, 2, 3].map((i) => parseInt(short[i]!.repeat(2), 16)) as [number, number, number];
  const long = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(s);
  if (long !== null) return [1, 2, 3].map((i) => parseInt(long[i]!, 16)) as [number, number, number];
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,[^)]*)?\)$/.exec(s);
  if (rgb !== null) return [1, 2, 3].map((i) => Math.min(255, Number(rgb[i]))) as [number, number, number];
  return undefined;
}

/**
 * The colour mode for an output, by the usual conventions in their usual order: a
 * flag beats the environment, NO_COLOR (when non-empty) turns colour off, a dumb
 * terminal gets none, FORCE_COLOR turns it on for a pipe, and otherwise a terminal
 * is coloured and a pipe is not.
 */
export function colorModeFor(
  env: Readonly<Record<string, string | undefined>>,
  tty: boolean,
  flag?: 'color' | 'no-color',
): ColorMode {
  const depth: ColorMode = env.COLORTERM === 'truecolor' || env.COLORTERM === '24bit' ? 'truecolor' : 'ansi256';
  if (flag === 'no-color') return 'none';
  if (flag === 'color') return depth;
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return 'none';
  if (env.TERM === 'dumb') return 'none';
  if (env.FORCE_COLOR !== undefined) return env.FORCE_COLOR === '0' ? 'none' : depth;
  return tty ? depth : 'none';
}

/** The TUI's mode: colour as for a terminal `show` prints to, but the attributes
 * kept where colour is off. NO_COLOR is about colour, not about bold and inverse. */
export function screenColorMode(env: Readonly<Record<string, string | undefined>>): ColorMode {
  const mode = colorModeFor(env, true);
  return mode === 'none' ? 'mono' : mode;
}

const CUBE = [0, 95, 135, 175, 215, 255];

const nearestLevel = (v: number): number => {
  let best = 0;
  for (let i = 1; i < CUBE.length; i++) if (Math.abs(CUBE[i]! - v) < Math.abs(CUBE[best]! - v)) best = i;
  return best;
};

const distance = (a: readonly number[], b: readonly number[]): number =>
  a.reduce((sum, v, i) => sum + (v - b[i]!) ** 2, 0);

/** The 256-colour palette entry nearest `rgb`: the 6×6×6 cube or the 24 greys. */
function palette256([r, g, b]: readonly [number, number, number]): number {
  const [ri, gi, bi] = [r, g, b].map(nearestLevel) as [number, number, number];
  const cube = [CUBE[ri]!, CUBE[gi]!, CUBE[bi]!];
  const grey = Math.max(0, Math.min(23, Math.round(((r + g + b) / 3 - 8) / 10)));
  const greyValue = 8 + grey * 10;
  return distance([r, g, b], [greyValue, greyValue, greyValue]) < distance([r, g, b], cube)
    ? 232 + grey
    : 16 + 36 * ri + 6 * gi + bi;
}

function colorCode(color: Color, mode: ColorMode): string {
  if ('ansi' in color) return String(color.ansi < 8 ? 30 + color.ansi : 90 + color.ansi - 8);
  return mode === 'truecolor' ? `38;2;${color.rgb.join(';')}` : `38;5;${palette256(color.rgb)}`;
}

/** The escape that sets `style`, or `''` for the plain style. */
export function sgr(style: Style, mode: ColorMode): string {
  if (mode === 'none') return '';
  const codes: string[] = [];
  if (style.bold === true) codes.push('1');
  if (style.dim === true) codes.push('2');
  if (style.inverse === true) codes.push('7');
  if (style.fg !== undefined && mode !== 'mono') codes.push(colorCode(style.fg, mode));
  return codes.length === 0 ? '' : `\x1b[${codes.join(';')}m`;
}

const RESET = '\x1b[0m';

/** A blank that shows nothing: trailing ones can go. An inverse blank is a bar. */
const invisible = (cell: Cell): boolean => cell.ch === ' ' && cell.style.inverse !== true;

/**
 * The picture as text, one string per row. Trailing blanks are trimmed unless `trim`
 * is false (a full-screen frame keeps its width). A row that set a style ends with a
 * reset, so no colour leaks into the next line or the shell.
 */
export function serialize(rows: readonly Cell[][], mode: ColorMode, trim = true): string[] {
  return rows.map((row) => {
    let end = row.length;
    if (trim) while (end > 0 && (invisible(row[end - 1]!) || row[end - 1]!.ch === '')) end--;
    let out = '';
    let current = '';
    for (let i = 0; i < end; i++) {
      const cell = row[i]!;
      if (cell.ch === '') continue;
      const code = sgr(cell.style, mode);
      if (code !== current) {
        out += current === '' ? code : `${RESET}${code}`;
        current = code;
      }
      out += cell.ch;
    }
    return current === '' ? out : `${out}${RESET}`;
  });
}
