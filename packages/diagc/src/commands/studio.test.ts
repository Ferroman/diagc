import { afterEach, describe, expect, it, vi } from 'vitest';
import { argsOf, captureIo, contextFor, home } from '../../test-fixtures/cli';
import { studio } from './studio';

const runStudio = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('../studio', () => ({ runStudio }));

afterEach(() => {
  runStudio.mockClear();
});

describe('studio', () => {
  it('takes no argument, and refuses --update-includes as it always resolves locked', () => {
    expect(studio.flags).toEqual([]);
    expect(studio.positionals).toEqual({ max: 0, what: 'no arguments' });
    expect(studio.whyNot).toEqual({ '--update-includes': 'it always resolves includes locked' });
  });

  it('runs the studio against the current directory, and exits 0 once it is stopped', async () => {
    const io = captureIo();
    expect(await studio.run(argsOf(), contextFor(io))).toBe(0);
    expect(runStudio).toHaveBeenCalledWith(home, process.cwd());
    expect([io.stdout, io.stderr]).toEqual(['', '']);
  });

  it('gives no exit code while the studio runs, so main does not stop it', async () => {
    let stop!: () => void;
    runStudio.mockImplementationOnce(() => new Promise<void>((resolve) => (stop = resolve)));
    let code: number | undefined;
    const running = studio.run(argsOf(), contextFor(captureIo())).then((c) => (code = c));
    await new Promise((r) => setTimeout(r, 20));
    expect(code).toBeUndefined();
    stop();
    await running;
    expect(code).toBe(0);
  });
});
