import { mkdirSync, mkdtempSync, realpathSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runTui, watchSources, type Change, type WatchStarter } from './app';
import type { Terminal } from './terminal';

let dir: string;
let srcDir: string;
let artifactsDir: string;
beforeEach(() => {
  dir = realpathSync(mkdtempSync(path.join(tmpdir(), 'diagc-tui-')));
  srcDir = path.join(dir, '.diagrams', 'src');
  artifactsDir = path.join(dir, '.diagrams', '.artifacts');
  mkdirSync(srcDir, { recursive: true });
  mkdirSync(artifactsDir, { recursive: true });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

/** A compiled diagram: `names` become boxes, the first pointing at the second. */
function compiled(name: string, ...names: string[]): void {
  const nodes = names.map((n, i) => ({ id: `n${i}`, name: n }));
  const relations = names.length > 1 ? [{ id: 'r', from: 'n0', to: 'n1', kind: 'sync' }] : [];
  const model = { version: 1, id: name, name, nodes, containment: [], relations, layers: [], planes: [] };
  writeFileSync(path.join(artifactsDir, `${name}.diagram.json`), JSON.stringify(model));
}

/** A terminal that keeps every frame written to it, and takes typed input. */
function fakeTerminal() {
  const writes: string[] = [];
  let input: ((data: string) => void) | undefined;
  let resize: (() => void) | undefined;
  let broken = false;
  const terminal: Terminal = {
    columns: 100,
    rows: 30,
    write: (text) => {
      if (broken) throw new Error('the terminal broke');
      writes.push(text);
    },
    onInput: (listener) => void (input = listener),
    onResize: (listener) => void (resize = listener),
    start: vi.fn(),
    stop: vi.fn(),
  };
  // eslint-disable-next-line no-control-regex -- the escapes are what is stripped
  const screen = (): string => (writes.at(-1) ?? '').replace(/\x1b\[\??[0-9;]*[a-zA-Z]/g, '\n');
  return {
    terminal,
    type: (data: string) => input!(data),
    resize: () => resize!(),
    screen,
    breakIt: () => void (broken = true),
  };
}

function manualWatch(): { start: WatchStarter; emit: (change: Change) => void; close: ReturnType<typeof vi.fn> } {
  let emit: ((change: Change) => void) | undefined;
  const close = vi.fn(async () => {});
  return { start: (onChange) => ((emit = onChange), { close }), emit: (c) => emit!(c), close };
}

/** Waits until the screen shows `text`. */
async function until(screen: () => string, text: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (screen().includes(text)) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`never showed '${text}'; last screen:\n${screen()}`);
}

const options = (fake: ReturnType<typeof fakeTerminal>, watch: ReturnType<typeof manualWatch>, name?: string) => ({
  terminal: fake.terminal,
  srcDir,
  artifactsDir,
  watch: watch.start,
  color: 'none' as const,
  ...(name !== undefined ? { name } : {}),
});

describe('runTui', () => {
  it('opens the diagram it is named, and quits with q, giving the terminal back', async () => {
    compiled('shop', 'Web', 'Database');
    const fake = fakeTerminal();
    const watch = manualWatch();
    const done = runTui(options(fake, watch, 'shop'));
    await until(fake.screen, 'Database');
    expect(fake.terminal.start).toHaveBeenCalled();
    fake.type('q');
    await done;
    expect(fake.terminal.stop).toHaveBeenCalled();
    expect(watch.close).toHaveBeenCalled();
  });

  it('lists the diagrams without a name, and opens the one picked', async () => {
    compiled('alpha', 'Alpha box');
    compiled('beta', 'Beta box');
    const fake = fakeTerminal();
    const done = runTui(options(fake, manualWatch()));
    await until(fake.screen, 'beta');
    fake.type('j');
    fake.type('\r');
    await until(fake.screen, 'Beta box');
    fake.type('q');
    await done;
  });

  it('redraws the open diagram when its source compiles again', async () => {
    compiled('shop', 'Web', 'Database');
    const fake = fakeTerminal();
    const watch = manualWatch();
    const done = runTui(options(fake, watch, 'shop'));
    await until(fake.screen, 'Database');
    compiled('shop', 'Web', 'Warehouse');
    watch.emit({ name: 'shop', ok: true });
    await until(fake.screen, 'Warehouse');
    fake.type('q');
    await done;
  });

  it('keeps the last picture and says what failed when a compile fails', async () => {
    compiled('shop', 'Web', 'Database');
    const fake = fakeTerminal();
    const watch = manualWatch();
    const done = runTui(options(fake, watch, 'shop'));
    await until(fake.screen, 'Database');
    watch.emit({ name: 'shop', ok: false, error: "relation 'r' points at a missing node 'ghost'\nmore detail" });
    await until(fake.screen, 'ghost');
    expect(fake.screen()).toContain('Database');
    fake.type('q');
    await done;
  });

  it('draws without a layout file that does not read, and says so', async () => {
    compiled('shop', 'Web', 'Database');
    writeFileSync(path.join(srcDir, 'shop.layout.json'), '{ half a file');
    const fake = fakeTerminal();
    const watch = manualWatch();
    const done = runTui(options(fake, watch, 'shop'));
    await until(fake.screen, 'Database');
    expect(fake.screen()).toContain('not a layout file');
    // and the same when it breaks while the diagram is open
    writeFileSync(path.join(srcDir, 'shop.layout.json'), '{');
    watch.emit({ name: 'shop', ok: true });
    await until(fake.screen, 'not a layout file');
    fake.type('q');
    await done;
  });

  it('keeps running, with the reason in the status row, when the diagram cannot be read', async () => {
    compiled('shop', 'Web', 'Database');
    const fake = fakeTerminal();
    const done = runTui(options(fake, manualWatch(), 'shop'));
    await until(fake.screen, 'Database');
    unlinkSync(path.join(artifactsDir, 'shop.diagram.json'));
    fake.type('r');
    await until(fake.screen, 'cannot read shop');
    expect(fake.screen()).toContain('Database');
    fake.type('q');
    await done;
  });

  it('stays on the list, saying why, when the picked diagram cannot be read', async () => {
    compiled('alpha', 'Alpha box');
    const fake = fakeTerminal();
    const done = runTui(options(fake, manualWatch()));
    await until(fake.screen, 'alpha');
    unlinkSync(path.join(artifactsDir, 'alpha.diagram.json'));
    fake.type('\r');
    await until(fake.screen, 'cannot read alpha');
    fake.type('q');
    await done;
  });

  it('waits for a named diagram that is still compiling', async () => {
    const fake = fakeTerminal();
    const watch = manualWatch();
    const done = runTui(options(fake, watch, 'shop'));
    await until(fake.screen, 'Compiling shop');
    compiled('shop', 'Web');
    watch.emit({ name: 'shop', ok: true });
    await until(fake.screen, 'Web');
    fake.type('q');
    await done;
  });

  it('gives the terminal back when something throws, and rejects', async () => {
    compiled('shop', 'Web');
    const fake = fakeTerminal();
    const watch = manualWatch();
    const done = runTui(options(fake, watch, 'shop'));
    await until(fake.screen, 'Web');
    fake.breakIt();
    fake.type('j');
    await expect(done).rejects.toThrow('the terminal broke');
    expect(fake.terminal.stop).toHaveBeenCalled();
    expect(watch.close).toHaveBeenCalled();
  });

  it('leaves no signal handler behind', async () => {
    compiled('shop', 'Web');
    const before = ['SIGINT', 'SIGTERM', 'uncaughtException'].map((e) => process.listenerCount(e));
    const fake = fakeTerminal();
    const done = runTui(options(fake, manualWatch(), 'shop'));
    await until(fake.screen, 'Web');
    expect(process.listenerCount('SIGTERM')).toBe(before[1]! + 1);
    fake.type('q');
    await done;
    expect(['SIGINT', 'SIGTERM', 'uncaughtException'].map((e) => process.listenerCount(e))).toEqual(before);
  });

  it('goes where the overview is clicked', async () => {
    // a chain far taller than the screen
    const nodes = Array.from({ length: 20 }, (_, i) => ({ id: `n${i}`, name: `Node ${i}` }));
    const relations = nodes.slice(1).map((n, i) => ({ id: `r${i}`, from: `n${i}`, to: n.id, kind: 'sync' }));
    const model = { version: 1, id: 'long', name: 'long', nodes, containment: [], relations, layers: [], planes: [] };
    writeFileSync(path.join(artifactsDir, 'long.diagram.json'), JSON.stringify(model));
    const fake = fakeTerminal();
    const done = runTui(options(fake, manualWatch(), 'long'));
    await until(fake.screen, 'Node 0');
    expect(fake.screen()).toMatch(/[\u2801-\u28ff]/);
    expect(fake.screen()).not.toContain('Node 19');
    // the overview's border ends in the canvas's bottom-right cell (99, 28), and a
    // click there is a click on its last cell: the picture's end
    fake.type('\x1b[<0;100;29M\x1b[<0;100;29m');
    await until(fake.screen, 'Node 19');
    fake.type('q');
    await done;
  });

  it('shows the legend a diagram declares, which L hides and brings back', async () => {
    const nodes = [
      { id: 'a', name: 'Web' },
      { id: 'b', name: 'DB' },
    ];
    const relations = [{ id: 'r', from: 'a', to: 'b', kind: 'sync' }];
    const model = { version: 1, id: 'keyed', name: 'keyed', nodes, containment: [], relations, layers: [], planes: [] };
    writeFileSync(path.join(artifactsDir, 'keyed.diagram.json'), JSON.stringify({ ...model, legend: {} }));
    const fake = fakeTerminal();
    const done = runTui(options(fake, manualWatch(), 'keyed'));
    await until(fake.screen, 'Legend');
    expect(fake.screen()).toContain('──▶ sync');
    fake.type('L');
    expect(fake.screen()).not.toContain('Legend');
    fake.type('L');
    expect(fake.screen()).toContain('Legend');
    expect(fake.screen()).not.toContain('too small');
    fake.type('q');
    await done;
  });

  it('redraws on a resize', async () => {
    compiled('shop', 'Web');
    const fake = fakeTerminal();
    const done = runTui(options(fake, manualWatch(), 'shop'));
    await until(fake.screen, 'Web');
    (fake.terminal as { columns: number }).columns = 50;
    fake.resize();
    expect(
      fake
        .screen()
        .split('\n')
        .some((line) => line.length === 50),
    ).toBe(true);
    fake.type('q');
    await done;
  });
});

describe('watchSources', () => {
  it('reports a compiled source and a changed layout by diagram name', async () => {
    const changes: Change[] = [];
    mkdirSync(path.join(srcDir, 'team'), { recursive: true });
    const model = {
      version: 1,
      id: 'app',
      name: 'app',
      nodes: [],
      containment: [],
      relations: [],
      layers: [],
      planes: [],
    };
    writeFileSync(path.join(srcDir, 'team', 'app.diagram.json'), JSON.stringify(model));
    const coreEntry = path.resolve(import.meta.dirname, '../../../core/src/index.ts');
    const watcher = watchSources(srcDir, artifactsDir, coreEntry)((c) => changes.push(c));
    try {
      const seen = async (match: (c: Change) => boolean): Promise<void> => {
        for (let i = 0; i < 300 && !changes.some(match); i++) await new Promise((r) => setTimeout(r, 10));
        expect(changes.some(match)).toBe(true);
      };
      await seen((c) => c.name === 'team/app' && c.ok);
      writeFileSync(path.join(srcDir, 'team', 'app.layout.json'), JSON.stringify({ version: 1, planes: {} }));
      const compiles = changes.length;
      await seen((c) => c.name === 'team/app' && changes.indexOf(c) >= compiles);
    } finally {
      await watcher.close();
    }
  });
});
