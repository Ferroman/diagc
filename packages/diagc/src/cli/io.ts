/** Where the CLI writes. A command writes through this and never to the console, so a
 * test can run it in process and read what it wrote. */
export interface CliIo {
  /** a line on stdout, as console.log writes it */
  out: (line: string) => void;
  /** a line on stderr, as console.error writes it */
  err: (line: string) => void;
  /** text on stdout as it is */
  write: (text: string) => void;
}

/** The process's own streams. `write` is a plain write, which, unlike console.log's, does
 * not swallow the error of a reader that has closed the pipe. */
export const processIo: CliIo = {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
  write: (text) => void process.stdout.write(text),
};
