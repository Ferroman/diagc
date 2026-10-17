// What a terminal in raw mode sends, read into key presses and mouse reports. One read
// can hold several (a paste, keys typed faster than they are read), so the input is
// consumed sequence by sequence.

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

export type InputEvent = Key | Mouse;

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

/** The escape sequence at the start of `s`, which starts with ESC, read. The patterns
 * match what follows the ESC. */
function escape(s: string): Match {
  const body = s.slice(1);
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
