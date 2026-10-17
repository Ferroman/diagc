import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { watch as chokidarWatch } from 'chokidar';
import { errMessage, isLayoutOverlay, type DiagramModel, type LayoutOverlay } from '@diagc/core/internal';
import { discoverDiagrams } from '../publish/discover';
import { lockedResolverFor } from '../snapshots';
import type { ColorMode } from '../text/ansi';
import type { Cell } from '../text/canvas';
import { UNICODE } from '../text/glyphs';
import { paint } from '../text/paint';
import { buildScene, type Scene } from '../text/scene';
import { startWatch } from '../watch';
import { isReply, parseInput, type Reply } from './keys';
import { CELL_SIZE_QUERY, graphicsOf, hear, imageChange, TERMINAL_QUERY, type FrameImage, type Heard } from './kitty';
import { canvasSize, composeFrame, frameText, legendPlaceOf, overviewImage, overviewPlaceOf } from './screen';
import { openDiagram, reduce, sceneInput, settle, type DiagramState, type Effect, type TuiState } from './state';
import type { Terminal } from './terminal';

/** A diagram's source compiled (or failed to), or its layout changed. */
export interface Change {
  name: string;
  ok: boolean;
  error?: string;
}

export interface DiagramWatcher {
  close(): Promise<void>;
}

/** Starts watching, reporting each change; the TUI's own loop is the only caller. */
export type WatchStarter = (onChange: (change: Change) => void) => DiagramWatcher;

export interface TuiOptions {
  terminal: Terminal;
  srcDir: string;
  artifactsDir: string;
  /** the diagram to open; the list of diagrams without one */
  name?: string;
  watch: WatchStarter;
  color: ColorMode;
  now?: () => number;
}

/** What makes the process end while the TUI owns the terminal; each gives it back. */
const ENDINGS = ['SIGINT', 'SIGTERM', 'SIGHUP', 'uncaughtException', 'unhandledRejection'] as const;

/** A name from a path under the sources: `team/app.diagram.ts` is `team/app`. */
const nameIn = (srcDir: string, file: string): string =>
  path
    .relative(srcDir, file)
    .replace(/\.(diagram\.(ts|json)|layout\.json)$/, '')
    .split(path.sep)
    .join('/');

/** The studio's compile-watch loop, for the TUI: sources compile into artifacts as they
 * are saved, and a layout's change is a change of its diagram. Compile warnings are
 * dropped rather than printed, which would scribble over the screen; `diagc lint`
 * reports them. */
export function watchSources(srcDir: string, artifactsDir: string, coreEntry: string): WatchStarter {
  return (onChange) => {
    const sources = startWatch(srcDir, artifactsDir, {
      coreEntry,
      resolver: lockedResolverFor(srcDir),
      warn: () => {},
      onEvent: (e) =>
        onChange(
          e.ok
            ? { name: nameIn(srcDir, e.file), ok: true }
            : { name: nameIn(srcDir, e.file), ok: false, error: e.error },
        ),
    });
    const layouts = chokidarWatch(srcDir, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 20 },
    });
    const onLayout = (file: string): void => {
      if (file.endsWith('.layout.json')) onChange({ name: nameIn(srcDir, file), ok: true });
    };
    layouts.on('add', onLayout).on('change', onLayout);
    return {
      async close() {
        await Promise.all([sources.close(), layouts.close()]);
      },
    };
  };
}

/** A diagram's state carried over to a new version of its model: the plane if it is
 * still there (else the diagram opens afresh), the layers and drill path that remain. */
function carried(d: DiagramState, model: DiagramModel, overlay: LayoutOverlay | undefined): DiagramState {
  if (d.plane !== undefined && !model.planes.some((p) => p.id === d.plane)) return openDiagram(d.name, model, overlay);
  const nodes = new Set(model.nodes.map((n) => n.id));
  const kept = d.path.findIndex((id) => !nodes.has(id));
  return {
    ...d,
    layers: d.layers.filter((id) => model.layers.some((l) => l.id === id)),
    path: kept < 0 ? d.path : d.path.slice(0, kept),
  };
}

interface Loaded {
  model: DiagramModel;
  overlay: LayoutOverlay | undefined;
  /** what was wrong with the layout, which was left out */
  problem?: string;
}

class App {
  private state: TuiState = { screen: 'list', names: [], index: 0 };
  private model?: DiagramModel;
  private overlay?: LayoutOverlay;
  private scene?: Scene;
  private canvas?: Cell[][];
  private notice?: string;
  /** a diagram asked for by name that has not compiled yet */
  private pending?: string;
  /** the newest layout asked for; an older one that finishes later is dropped */
  private layoutSeq = 0;
  /** what the terminal has said about itself, in answer to `TERMINAL_QUERY` */
  private heard: Heard = {};
  /** the image on the screen, which a frame changes only when it has to */
  private image?: FrameImage;
  /** the image may not be where it was: a resize can move or clear it */
  private imageStale = false;
  private watcher?: DiagramWatcher;
  private finished = false;
  private settleRun: { resolve: () => void; reject: (e: unknown) => void } = { resolve: () => {}, reject: () => {} };
  private readonly onEnding = (reason?: unknown): void => {
    void this.finish(reason instanceof Error ? reason : undefined);
  };

  constructor(private readonly options: TuiOptions) {}

  run(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.settleRun = { resolve, reject };
      for (const ending of ENDINGS) process.on(ending, this.onEnding);
      const { terminal } = this.options;
      terminal.onInput((data) => this.guard(() => this.input(data)));
      terminal.onResize(() => this.guard(() => this.resized()));
      terminal.start();
      terminal.write(TERMINAL_QUERY);
      this.watcher = this.options.watch((change) => this.later(() => this.changed(change)));
      this.later(() => this.boot());
    });
  }

  /** Ends the run once, the terminal given back first: whatever happens after must not
   * happen on a screen left in raw mode. */
  private async finish(error?: unknown): Promise<void> {
    if (this.finished) return;
    this.finished = true;
    for (const ending of ENDINGS) process.off(ending, this.onEnding);
    try {
      if (this.image !== undefined) this.options.terminal.write(imageChange(this.image, undefined));
    } catch {
      // a terminal that cannot take the image's removal still has to be given back
    }
    try {
      this.options.terminal.stop();
    } finally {
      await this.watcher?.close().catch(() => {});
      if (error === undefined) this.settleRun.resolve();
      else this.settleRun.reject(error);
    }
  }

  private guard(step: () => void): void {
    if (this.finished) return;
    try {
      step();
    } catch (e) {
      void this.finish(e);
    }
  }

  private later(step: () => Promise<void>): void {
    if (!this.finished) step().catch((e: unknown) => void this.finish(e));
  }

  private size() {
    return { columns: this.options.terminal.columns, rows: this.options.terminal.rows };
  }

  private draw(): void {
    if (this.finished) return;
    const graphics = graphicsOf(this.heard);
    const input = {
      ...(this.model !== undefined ? { model: this.model } : {}),
      ...(this.scene !== undefined ? { scene: this.scene } : {}),
      ...(this.canvas !== undefined ? { canvas: this.canvas } : {}),
      ...(this.notice !== undefined ? { notice: this.notice } : {}),
      ...(graphics !== undefined ? { graphics } : {}),
    };
    const size = this.size();
    const lines = composeFrame(this.state, input, size, this.options.color);
    const image = overviewImage(this.state, input, size);
    const change = this.imageStale
      ? imageChange(this.image, undefined) + imageChange(undefined, image)
      : imageChange(this.image, image);
    [this.image, this.imageStale] = [image, false];
    this.options.terminal.write(frameText(lines, change));
  }

  /** A reply to the query: the overview turns into an image once the terminal says it
   * shows them, and is redrawn at a new cell size. Off the diagram screen there is no
   * overview to redraw, and nothing drawn yet that is worth drawing early. */
  private replied(reply: Reply): void {
    const before = JSON.stringify(graphicsOf(this.heard));
    this.heard = hear(this.heard, reply);
    if (this.state.screen === 'diagram' && JSON.stringify(graphicsOf(this.heard)) !== before) this.draw();
  }

  private repaint(): void {
    const selected = this.state.diagram?.selected;
    this.canvas =
      this.scene === undefined
        ? undefined
        : paint(this.scene, { glyphs: UNICODE, ...(selected !== undefined ? { selected } : {}) }).cells(UNICODE);
  }

  private async names(): Promise<string[]> {
    return (await discoverDiagrams(this.options.artifactsDir, this.options.srcDir)).map((d) => d.name);
  }

  private async boot(): Promise<void> {
    const names = await this.names();
    this.state = { ...this.state, names };
    const wanted = this.options.name;
    if (wanted === undefined) return this.draw();
    this.state.index = Math.max(0, names.indexOf(wanted));
    if (names.includes(wanted)) return this.open(wanted);
    this.pending = wanted;
    this.notice = `Compiling ${wanted}…`;
    // a diagram screen without a picture yet, so the notice shows where it will be
    this.state = {
      ...this.state,
      screen: 'diagram',
      diagram: {
        name: wanted,
        layers: [],
        pins: {},
        path: [],
        scroll: { x: 0, y: 0 },
        panel: false,
        help: false,
        overview: true,
        legend: false,
      },
    };
    this.draw();
  }

  /** The diagram's model and layout. A layout that does not read is left out and
   * named in `problem` — it only steers the picture, as `show` treats it. A model that
   * does not read throws. */
  private async load(name: string): Promise<Loaded> {
    const model = JSON.parse(
      await readFile(path.join(this.options.artifactsDir, `${name}.diagram.json`), 'utf8'),
    ) as DiagramModel;
    const layoutFile = path.join(this.options.srcDir, `${name}.layout.json`);
    if (!existsSync(layoutFile)) return { model, overlay: undefined };
    try {
      const parsed: unknown = JSON.parse(await readFile(layoutFile, 'utf8'));
      if (isLayoutOverlay(parsed)) return { model, overlay: parsed };
    } catch {
      // said below, as a layout that does not read
    }
    return { model, overlay: undefined, problem: `ignoring ${name}.layout.json: not a layout file` };
  }

  /** `load`, with a failure said where the reader is looking instead of ending the run:
   * the open diagram's status row, or the list's. */
  private async tryLoad(name: string): Promise<Loaded | undefined> {
    try {
      return await this.load(name);
    } catch (e) {
      this.say(`cannot read ${name}: ${errMessage(e)}`);
      return undefined;
    }
  }

  private say(text: string): void {
    const d = this.state.diagram;
    if (this.state.screen === 'diagram' && d !== undefined) {
      this.state = { ...this.state, diagram: { ...d, message: { text, error: true } } };
    } else this.notice = text;
    this.draw();
  }

  private withProblem(d: DiagramState, problem: string | undefined): DiagramState {
    return problem === undefined ? d : { ...d, message: { text: problem, error: true } };
  }

  private async open(name: string): Promise<void> {
    const loaded = await this.tryLoad(name);
    if (loaded === undefined) return;
    const { model, overlay, problem } = loaded;
    [this.model, this.overlay, this.scene, this.canvas, this.notice] = [
      model,
      overlay,
      undefined,
      undefined,
      undefined,
    ];
    const diagram = this.withProblem(openDiagram(name, model, overlay), problem);
    this.state = { ...this.state, screen: 'diagram', diagram };
    await this.relayout();
  }

  private async reload(): Promise<void> {
    const d = this.state.diagram;
    if (this.state.screen === 'list' || d === undefined || this.model === undefined) {
      this.state = { ...this.state, names: await this.names() };
      return this.draw();
    }
    const loaded = await this.tryLoad(d.name);
    if (loaded === undefined) return;
    [this.model, this.overlay] = [loaded.model, loaded.overlay];
    this.state = { ...this.state, diagram: this.withProblem(carried(d, loaded.model, loaded.overlay), loaded.problem) };
    await this.relayout();
  }

  private async relayout(): Promise<void> {
    const seq = ++this.layoutSeq;
    const d = this.state.diagram;
    if (d === undefined || this.model === undefined) return this.draw();
    let scene: Scene;
    try {
      scene = await buildScene(sceneInput(d, this.model, this.overlay), UNICODE);
    } catch (e) {
      this.state = { ...this.state, diagram: { ...d, message: { text: errMessage(e), error: true } } };
      return this.draw();
    }
    if (seq !== this.layoutSeq || this.state.diagram === undefined) return;
    this.scene = scene;
    // the state as it is now: keys pressed while elk worked have moved it on
    this.state = { ...this.state, diagram: settle(this.state.diagram, scene, canvasSize(this.state, this.size())) };
    this.repaint();
    this.draw();
  }

  private runEffect(effect: Effect): void {
    if (effect.kind === 'quit') void this.finish();
    else if (effect.kind === 'open') this.later(() => this.open(effect.name));
    else if (effect.kind === 'reload') this.later(() => this.reload());
    else this.later(() => this.relayout());
  }

  private input(data: string): void {
    // what the list said about the last pick is answered by the next key
    if (this.state.screen === 'list' && this.pending === undefined) this.notice = undefined;
    for (const event of parseInput(data)) {
      if (this.finished) return;
      if (isReply(event)) {
        this.replied(event);
        continue;
      }
      const size = this.size();
      const ctx = {
        model: this.model,
        overlay: this.overlay,
        scene: this.scene,
        view: canvasSize(this.state, size),
        overview: overviewPlaceOf(this.state, this.scene, size),
        legend: legendPlaceOf(this.state, this.scene, size),
        at: (this.options.now ?? Date.now)(),
      };
      const { state, effects } = reduce(this.state, event, ctx);
      this.state = state;
      for (const effect of effects) this.runEffect(effect);
      // a new layout repaints when it lands; anything else repaints now, which is
      // what shows a new selection
      if (!this.finished && !effects.some((e) => e.kind === 'relayout')) {
        this.repaint();
        this.draw();
      }
    }
  }

  private resized(): void {
    if (graphicsOf(this.heard) !== undefined) this.options.terminal.write(CELL_SIZE_QUERY);
    this.imageStale = true;
    if (this.state.diagram !== undefined && this.scene !== undefined) {
      this.state = {
        ...this.state,
        diagram: settle(this.state.diagram, this.scene, canvasSize(this.state, this.size())),
      };
    }
    this.draw();
  }

  private async changed(change: Change): Promise<void> {
    const open = this.state.diagram?.name;
    if (!change.ok) {
      if (open === change.name && this.state.diagram !== undefined) {
        const text = `${change.name} does not compile: ${(change.error ?? '').split('\n')[0]}`;
        this.state = { ...this.state, diagram: { ...this.state.diagram, message: { text, error: true } } };
      }
      return this.draw();
    }
    const names = await this.names();
    this.state = { ...this.state, names, index: Math.min(this.state.index, Math.max(0, names.length - 1)) };
    if (this.pending === change.name) {
      this.pending = undefined;
      return this.open(change.name);
    }
    if (open === change.name && this.model !== undefined) return this.reload();
    this.draw();
  }
}

/** The TUI, until it is quit. The terminal is given back however the run ends; an
 * error that ended it rejects the promise once it has been. */
export function runTui(options: TuiOptions): Promise<void> {
  return new App(options).run();
}
