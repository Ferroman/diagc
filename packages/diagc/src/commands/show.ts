import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import {
  buildHierarchy,
  defined,
  errMessage,
  isLayoutOverlay,
  type DiagramModel,
  type LayoutOverlay,
} from '@diagc/core/internal';
import type { Command, CommandArgs } from '../cli/command';
import type { CliIo } from '../cli/io';
import { loadModel } from '../compile';
import { diagramName } from '../names';
import { RELATIVE_PATHS } from '../paths';
import { colorModeFor } from '../text/ansi';
import { depthPins, exportPins } from '../text/folds';
import { renderToLines } from '../text/render';
import { cellWidth } from '../text/width';
import { LOCKED, sourceOf } from './shared';

type ShowFlag = '--plane' | '--layers' | '--depth' | '--root' | '--ascii' | '--color' | '--no-color';
type ShowFlags = CommandArgs<ShowFlag>['flags'];

const listOf = (what: string, ids: readonly string[]): string =>
  ids.length === 0 ? `it has no ${what}` : `its ${what}: ${ids.join(', ')}`;

/** What is wrong with the view the flags ask for, or undefined when it can be drawn:
 * a plane, a layer or a root the model does not have, or a root with no inside. */
function viewProblem(name: string, model: DiagramModel, flags: ShowFlags): string | undefined {
  const plane = flags['--plane'];
  if (plane !== undefined && !model.planes.some((p) => p.id === plane)) {
    return `no plane '${plane}' in ${name}; ${listOf(
      'planes',
      model.planes.map((p) => p.id),
    )}`;
  }
  const layer = flags['--layers']?.find((id) => !model.layers.some((l) => l.id === id));
  if (layer !== undefined)
    return `no layer '${layer}' in ${name}; ${listOf(
      'layers',
      model.layers.map((l) => l.id),
    )}`;
  const root = flags['--root'];
  if (root === undefined) return undefined;
  const hierarchy = buildHierarchy(model, plane);
  if ((hierarchy.childrenOf.get(root)?.length ?? 0) > 0) return undefined;
  const containers = [...hierarchy.childrenOf].filter(([, kids]) => kids.length > 0).map(([id]) => id);
  const which = containers.length === 0 ? ', and it has none' : `: ${containers.join(', ')}`;
  const what = model.nodes.some((n) => n.id === root)
    ? `'${root}' holds nothing to draw`
    : `no node '${root}' in ${name}`;
  return `${what}; --root takes a container${which}`;
}

/** The layout beside the source, when there is one that reads as a layout. One that
 * does not is said on stderr and drawn without: the layout only steers the flow. */
async function readOverlay(source: string, io: CliIo): Promise<LayoutOverlay | undefined> {
  const file = source.replace(/\.diagram\.(ts|json)$/, '.layout.json');
  if (!existsSync(file)) return undefined;
  try {
    const parsed: unknown = JSON.parse(await readFile(file, 'utf8'));
    if (isLayoutOverlay(parsed)) return parsed;
  } catch {
    // reported below, as a layout that does not read
  }
  io.err(`diagc: ignoring ${file}: not a layout file`);
  return undefined;
}

const colorFlag = (flags: ShowFlags): 'color' | 'no-color' | undefined =>
  flags['--no-color'] === true ? 'no-color' : flags['--color'] === true ? 'color' : undefined;

/** A terminal wraps a line wider than itself, which takes a picture apart: say so,
 * once, on stderr, where the picture on stdout stays as it is. */
function widthHint(io: CliIo, lines: readonly string[], name: string): void {
  if (io.tty === undefined) return;
  // eslint-disable-next-line no-control-regex -- the escapes are what is stripped
  const width = Math.max(...lines.map((l) => cellWidth(l.replace(/\x1b\[[0-9;]*m/g, ''))));
  if (width <= io.tty.columns) return;
  io.err(
    `diagc: the picture is ${width} columns wide and the terminal ${io.tty.columns}; pipe it through 'less -S' or use 'diagc tui ${name}'.`,
  );
}

/** `diagc show <name>`: the diagram as text on stdout. */
export const show: Command<ShowFlag> = {
  flags: ['--plane', '--layers', '--depth', '--root', '--ascii', '--color', '--no-color'],
  positionals: { max: 1, what: 'one diagram name' },
  whyNot: LOCKED,
  async run({ positionals, flags }, { io, usage, home, snapshots }) {
    const name = positionals[0] === undefined ? '' : diagramName(positionals[0]);
    if (name === '' || (flags['--color'] === true && flags['--no-color'] === true)) {
      io.err(
        name === '' ? 'diagc: show needs a diagram name.' : 'diagc: --color and --no-color contradict each other.',
      );
      io.err(usage);
      return 1;
    }
    const source = sourceOf(name);
    if (source === undefined) {
      io.err(`diagc: no diagram '${name}'`);
      return 1;
    }
    let model: DiagramModel;
    try {
      // The source, not its artifact: the picture is of the diagram as it is now,
      // compiled or not, the way lint reads it.
      model = await loadModel(source, {
        rootDir: RELATIVE_PATHS.srcDir,
        coreEntry: home.coreEntry,
        resolver: snapshots.resolver,
        warn: io.err,
      });
    } catch (e) {
      io.err(errMessage(e));
      return 1;
    }
    const problem = viewProblem(name, model, flags);
    if (problem !== undefined) {
      io.err(`diagc: ${problem}`);
      return 1;
    }
    const overlay = await readOverlay(source, io);
    const plane = flags['--plane'];
    // A printed picture folds as the PNG does; --depth trades that for the top levels.
    const pins =
      flags['--depth'] !== undefined ? depthPins(model, plane, flags['--depth']) : exportPins(model, overlay);
    const lines = await renderToLines(
      { model, pins, ...defined({ overlay, plane, layers: flags['--layers'], root: flags['--root'] }) },
      { ascii: flags['--ascii'] === true, color: colorModeFor(process.env, io.tty !== undefined, colorFlag(flags)) },
    );
    if (lines.length === 0) {
      io.err(`diagc: nothing to draw in ${name}`);
      return 0;
    }
    io.write(`${lines.join('\n')}\n`);
    widthHint(io, lines, name);
    return 0;
  },
};
