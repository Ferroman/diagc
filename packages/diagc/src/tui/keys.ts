// What a terminal in raw mode sends, read into key presses, mouse reports and its
// replies to the TUI's query. One read can hold several (a paste, keys typed faster
// than they are read), so the input is consumed sequence by sequence.

export interface Key {
  kind: 'key';
  /** `up down left right enter space tab backspace escape pageup pagedown home end`,
   * or the printable character itself */
  name: string;
  shift?: boolean;
  ctrl?: boolean;
}

export interface Mouse {
  kind: 'mouse';
  action: 'press' | 'release' | 'drag' | 'wheel-up' | 'wheel-down' | 'wheel-left' | 'wheel-right';
  /** the cell, counted from 0 */
  x: number;
  y: number;
  shift: boolean;
}

/** What the terminal says back to `TERMINAL_QUERY`, which nobody typed. */
export type Reply =
  | { kind: 'graphics'; ok: boolean }
  | { kind: 'cell-size'; width: number; height: number }
  | { kind: 'text-color'; rgb: [number, number, number] };

/** What the reader typed or did with the mouse. */
export type UserInput = Key | Mouse;

export type InputEvent = UserInput | Reply;

export const isReply = (event: InputEvent): event is Reply => event.kind !== 'key' && event.kind !== 'mouse';

const LETTER_KEYS: Record<string, string> = { A: 'up', B: 'down', C: 'right', D: 'left', H: 'home', F: 'end' };
const TILDE_KEYS: Record<string, string> = {
  '1': 'home',
  '7': 'home',
  '4': 'end',
  '8': 'end',
  '5': 'pageup',
  '6': 'pagedown',
};
const WHEEL = ['wheel-up', 'wheel-down', 'wheel-left', 'wheel-right'] as const;

/** xterm's modifier parameter: 1 + shift(1) + alt(2) + ctrl(4). */
function modifiers(param: string | undefined): Pick<Key, 'shift' | 'ctrl'> {
  const bits = param === undefined ? 0 : Number(param) - 1;
  return { ...((bits & 1) !== 0 ? { shift: true } : {}), ...((bits & 4) !== 0 ? { ctrl: true } : {}) };
}

/** An SGR (1006) mouse report: `ESC [ < button ; x ; y M` (press) or `m` (release). */
function mouseOf(button: number, x: number, y: number, release: boolean): Mouse {
  const shift = (button & 4) !== 0;
  const at = { kind: 'mouse' as const, x: x - 1, y: y - 1, shift };
  if ((button & 64) !== 0) return { ...at, action: WHEEL[button & 3]! };
  if (release) return { ...at, action: 'release' };
  return { ...at, action: (button & 32) !== 0 ? 'drag' : 'press' };
}

type Match = [event: InputEvent | undefined, length: number];

/** A colour channel of an `rgb:` reply, one to four hex digits, as 0–255. */
const channel = (hex: string): number => Math.round((parseInt(hex, 16) / (16 ** hex.length - 1)) * 255);

/** A string sequence, which the terminal ends with ST or, after `]`, BEL: its body and
 * its length — or, cut short, no body and everything left, so none of it reads as keys. */
function stringSequence(body: string): [text: string | undefined, length: number] {
  // eslint-disable-next-line no-control-regex -- the terminators are control characters
  const end = /\x1b\\|\x07/.exec(body);
  return end === null ? [undefined, body.length + 1] : [body.slice(0, end.index), end.index + end[0].length + 1];
}

/** A reply to the query, or a string sequence (`ESC _`, `ESC ]`) of any other kind,
 * read as nothing. Undefined for neither. */
function reply(body: string): Match | undefined {
  if (body.startsWith('_') || body.startsWith(']')) {
    const [text = '', length] = stringSequence(body);
    const graphics = /^_G[^;]*;(.*)$/s.exec(text);
    if (graphics !== null) return [{ kind: 'graphics', ok: graphics[1] === 'OK' }, length];
    const color = /^\]10;rgb:([0-9a-f]{1,4})\/([0-9a-f]{1,4})\/([0-9a-f]{1,4})$/i.exec(text);
    const rgb =
      color === null ? undefined : ([color[1]!, color[2]!, color[3]!].map(channel) as [number, number, number]);
    return [rgb === undefined ? undefined : { kind: 'text-color', rgb }, length];
  }
  const m = /^\[6;(\d+);(\d+)t/.exec(body);
  return m === null ? undefined : [{ kind: 'cell-size', width: Number(m[2]), height: Number(m[1]) }, m[0].length + 1];
}

/** The escape sequence at the start of `s`, which starts with ESC, read. The patterns
 * match what follows the ESC. */
function escape(s: string): Match {
  const body = s.slice(1);
  const answer = reply(body);
  if (answer !== undefined) return answer;
  let m = /^\[<(\d+);(\d+);(\d+)([Mm])/.exec(body);
  if (m !== null) return [mouseOf(Number(m[1]), Number(m[2]), Number(m[3]), m[4] === 'm'), m[0].length + 1];
  if (body.startsWith('[Z')) return [{ kind: 'key', name: 'tab', shift: true }, 3];
  m = /^(?:\[(?:1;(\d+))?|O)([ABCDHF])/.exec(body);
  if (m !== null) return [{ kind: 'key', name: LETTER_KEYS[m[2]!]!, ...modifiers(m[1]) }, m[0].length + 1];
  m = /^\[(\d+)(?:;(\d+))?~/.exec(body);
  if (m !== null) {
    const name = TILDE_KEYS[m[1]!];
    return [name === undefined ? undefined : { kind: 'key', name, ...modifiers(m[2]) }, m[0].length + 1];
  }
  // Anything else that looks like a control sequence is consumed whole, so its
  // letters do not arrive as keys; a lone ESC is the escape key.
  m = /^\[[0-9;?<>=]*[@-~]/.exec(body);
  if (m !== null) return [undefined, m[0].length + 1];
  return [{ kind: 'key', name: 'escape' }, 1];
}

const SINGLE: Record<string, string> = {
  '\r': 'enter',
  '\n': 'enter',
  '\t': 'tab',
  '\x7f': 'backspace',
  '\b': 'backspace',
  ' ': 'space',
};

/** The one key at the start of `s`, which is no escape sequence. */
function plain(s: string): Match {
  const ch = String.fromCodePoint(s.codePointAt(0)!);
  const named = SINGLE[ch];
  if (named !== undefined) return [{ kind: 'key', name: named }, ch.length];
  const code = ch.codePointAt(0)!;
  // Ctrl+A … Ctrl+Z arrive as 1 … 26
  if (code >= 1 && code <= 26) return [{ kind: 'key', name: String.fromCharCode(96 + code), ctrl: true }, 1];
  if (code < 0x20) return [undefined, 1];
  return [{ kind: 'key', name: ch }, ch.length];
}

export function parseInput(data: string): InputEvent[] {
  const events: InputEvent[] = [];
  for (let i = 0; i < data.length;) {
    const rest = data.slice(i);
    const [event, length] = rest.startsWith('\x1b') ? escape(rest) : plain(rest);
    if (event !== undefined) events.push(event);
    i += length;
  }
  return events;
}
