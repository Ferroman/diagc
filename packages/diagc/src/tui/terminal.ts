// The terminal the TUI draws on, behind an interface small enough for a test to fake.

/** The alternate screen (the shell's own screen comes back untouched), the cursor
 * hidden, and mouse reports: presses, drags (1002) in the SGR encoding (1006),
 * which has no 223-column limit. */
export const ENTER_SEQUENCE = '\x1b[?1049h\x1b[?25l\x1b[?1000h\x1b[?1002h\x1b[?1006h';

/** Everything `ENTER_SEQUENCE` turned on, off again, in the reverse order. */
export const LEAVE_SEQUENCE = '\x1b[?1006l\x1b[?1002l\x1b[?1000l\x1b[?25h\x1b[?1049l';

export interface Terminal {
  readonly columns: number;
  readonly rows: number;
  write(text: string): void;
  /** called with what each read brings, while started */
  onInput(listener: (data: string) => void): void;
  /** called when the window changes size, while started */
  onResize(listener: () => void): void;
  /** raw input and the alternate screen */
  start(): void;
  /** the terminal as it was; safe to call twice, or without a start */
  stop(): void;
}

/** The process's own terminal. */
export function processTerminal(stdin: NodeJS.ReadStream, stdout: NodeJS.WriteStream): Terminal {
  const inputs: ((data: string) => void)[] = [];
  const resizes: (() => void)[] = [];
  let started = false;
  const onData = (data: string | Buffer): void => {
    for (const listener of inputs) listener(data.toString());
  };
  const onResize = (): void => {
    for (const listener of resizes) listener();
  };
  return {
    get columns() {
      return stdout.columns ?? 80;
    },
    get rows() {
      return stdout.rows ?? 24;
    },
    write: (text) => void stdout.write(text),
    onInput: (listener) => void inputs.push(listener),
    onResize: (listener) => void resizes.push(listener),
    start() {
      if (started) return;
      started = true;
      stdin.setRawMode?.(true);
      stdin.setEncoding('utf8');
      stdin.on('data', onData);
      stdout.on('resize', onResize);
      stdin.resume();
      stdout.write(ENTER_SEQUENCE);
    },
    stop() {
      if (!started) return;
      started = false;
      stdout.write(LEAVE_SEQUENCE);
      stdin.off('data', onData);
      stdout.off('resize', onResize);
      stdin.setRawMode?.(false);
      stdin.pause();
    },
  };
}
