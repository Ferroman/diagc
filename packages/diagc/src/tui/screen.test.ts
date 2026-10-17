import { describe, expect, it } from 'vitest';
import type { DiagramModel } from '@diagc/core/internal';
import { UNICODE } from '../text/glyphs';
import { paint } from '../text/paint';
import { buildScene, type Scene } from '../text/scene';
import { cellWidth } from '../text/width';
import type { Graphics } from './kitty';
import {
  canvasSize,
  composeFrame,
  frameText,
  legendPlaceOf,
  overviewImage,
  overviewPlaceOf,
  PANEL_WIDTH,
  viewOf,
  type FrameInput,
} from './screen';
import { openDiagram, type TuiState } from './state';

const model: DiagramModel = {
  version: 1,
  id: 'm',
  name: 'shop',
  nodes: [
    { id: 'a', name: '数据库 Store' },
    { id: 'b', name: 'Web' },
  ],
  containment: [],
  relations: [{ id: 'r', from: 'b', to: 'a', kind: 'sync' }],
  layers: [{ id: 'l1', name: 'Payments' }],
  planes: [],
};

// eslint-disable-next-line no-control-regex -- the escapes are what is stripped
const plain = (line: string): string => line.replace(/\x1b\[[0-9;]*m/g, '');

async function sceneOf(m: DiagramModel = model): Promise<Scene> {
  return buildScene({ model: m, pins: {} }, UNICODE);
}

function stateOf(extra: Partial<NonNullable<TuiState['diagram']>> = {}): TuiState {
  return {
    screen: 'diagram',
    names: ['shop'],
    index: 0,
    diagram: { ...openDiagram('shop', model, undefined), ...extra },
  };
}

async function inputOf(state: TuiState, scene?: Scene, graphics?: Graphics): Promise<FrameInput> {
  const s = scene ?? (await sceneOf());
  const canvas = paint(s, {
    glyphs: UNICODE,
    ...(state.diagram?.selected !== undefined ? { selected: state.diagram.selected } : {}),
  }).cells(UNICODE);
  return { model, scene: s, canvas, ...(graphics !== undefined ? { graphics } : {}) };
}

async function frame(state: TuiState, size: { columns: number; rows: number }, scene?: Scene, graphics?: Graphics) {
  return composeFrame(state, await inputOf(state, scene, graphics), size, 'ansi256');
}

const sized = (lines: string[], size: { columns: number; rows: number }) => {
  expect(lines).toHaveLength(size.rows);
  for (const line of lines) expect(cellWidth(plain(line))).toBe(size.columns);
};

describe('composeFrame', () => {
  it('fills the screen exactly, the title on top and the status at the bottom', async () => {
    const size = { columns: 80, rows: 24 };
    const lines = await frame(stateOf(), size);
    sized(lines, size);
    expect(plain(lines[0]!)).toContain('shop');
    expect(plain(lines[0]!)).toContain('[1] Payments');
    expect(plain(lines.join('\n'))).toContain('Web');
    expect(plain(lines.at(-1)!)).toContain('? help');
  });

  it('marks the layers that are on', async () => {
    expect(plain((await frame(stateOf({ layers: ['l1'] }), { columns: 80, rows: 10 }))[0]!)).toContain(
      '[1] Payments ✓',
    );
  });

  it('keeps its size on a tiny terminal, and on one cell', async () => {
    for (const size of [
      { columns: 20, rows: 6 },
      { columns: 1, rows: 1 },
      { columns: 3, rows: 2 },
    ]) {
      sized(await frame(stateOf({ panel: true, help: true, selected: 'a' }), size), size);
    }
  });

  it('gives the details panel its columns on a wide terminal', async () => {
    const state = stateOf({ panel: true, selected: 'a' });
    expect(canvasSize(state, { columns: 120, rows: 30 })).toEqual({ top: 1, width: 120 - PANEL_WIDTH, height: 28 });
    expect(canvasSize(stateOf(), { columns: 120, rows: 30 })).toEqual({ top: 1, width: 120, height: 28 });
    const lines = await frame(state, { columns: 120, rows: 30 });
    sized(lines, { columns: 120, rows: 30 });
    expect(lines.some((l) => plain(l).includes('id a'))).toBe(true);
  });

  it('says so when the plane has nothing on it, and while it is loading', async () => {
    const empty = await sceneOf({ ...model, nodes: [], relations: [] });
    const lines = await frame(stateOf(), { columns: 60, rows: 10 }, empty);
    expect(lines.some((l) => plain(l).includes('Nothing on this plane'))).toBe(true);
    const loading = composeFrame(stateOf(), { model }, { columns: 60, rows: 10 }, 'none');
    expect(loading.some((l) => l.includes('Loading…'))).toBe(true);
  });

  it('never leaves half a wide character at the edge of the canvas', async () => {
    const scene = await sceneOf();
    const a = scene.layout.boxes.get('a')!;
    // scroll so the canvas starts on the second cell of 数
    const lines = await frame(stateOf({ scroll: { x: a.x + 3, y: 0 } }), { columns: 40, rows: 12 }, scene);
    sized(lines, { columns: 40, rows: 12 });
  });

  it('shows the search line, then the message, then the selection in the status row', async () => {
    const search = await frame(stateOf({ search: { query: 'we', editing: true } }), { columns: 60, rows: 8 });
    expect(plain(search.at(-1)!)).toContain('/we');
    const message = await frame(stateOf({ message: { text: 'no layer 2', error: true } }), { columns: 60, rows: 8 });
    expect(plain(message.at(-1)!)).toContain('no layer 2');
    const selected = await frame(stateOf({ selected: 'b' }), { columns: 60, rows: 8 });
    expect(plain(selected.at(-1)!)).toContain('Web');
  });

  it('keeps a multi-line name on its row in the status and the title', async () => {
    const multi: DiagramModel = { ...model, nodes: [{ id: 'a', name: 'Two\nlines' }], relations: [] };
    const scene = await buildScene({ model: multi, pins: {} }, UNICODE);
    const state = stateOf({ selected: 'a', path: ['a'] });
    const canvas = paint(scene, { glyphs: UNICODE }).cells(UNICODE);
    const lines = composeFrame(state, { model: multi, scene, canvas }, { columns: 60, rows: 8 }, 'none');
    sized(lines, { columns: 60, rows: 8 });
    expect(lines.join('')).not.toContain('\n');
    expect(lines.join('')).not.toContain('\x1b');
  });

  it('keeps every row its width where the help covers wide characters', async () => {
    const wide: DiagramModel = {
      ...model,
      nodes: Array.from({ length: 8 }, (_, i) => ({ id: `n${i}`, name: '数据库服务器'.repeat(1 + (i % 3)) })),
      // a chain, so the boxes stack down the screen, under the help
      relations: Array.from({ length: 7 }, (_, i) => ({ id: `r${i}`, from: `n${i}`, to: `n${i + 1}`, kind: 'sync' })),
    };
    const scene = await buildScene({ model: wide, pins: {} }, UNICODE);
    const canvas = paint(scene, { glyphs: UNICODE }).cells(UNICODE);
    for (let columns = 60; columns <= 71; columns++) {
      const size = { columns, rows: 30 };
      sized(composeFrame(stateOf({ help: true }), { model: wide, scene, canvas }, size, 'none'), size);
    }
  });

  it('lists the keys in the help', async () => {
    const lines = await frame(stateOf({ help: true }), { columns: 100, rows: 30 });
    expect(lines.some((l) => plain(l).includes('next / previous plane'))).toBe(true);
  });

  it('draws the list, the current name marked', () => {
    const list: TuiState = { screen: 'list', names: ['alpha', 'beta'], index: 1 };
    const lines = composeFrame(list, {}, { columns: 30, rows: 6 }, 'ansi256');
    sized(lines, { columns: 30, rows: 6 });
    const beta = lines.find((l) => plain(l).includes('beta'))!;
    expect(beta).toContain('\x1b[7m');
    expect(lines.find((l) => plain(l).includes('alpha'))).not.toContain('\x1b[7m');
    const empty = composeFrame(
      { screen: 'list', names: [], index: 0 },
      { notice: 'Compiling…' },
      { columns: 30, rows: 6 },
      'none',
    );
    expect(empty.some((l) => l.includes('Compiling…'))).toBe(true);
  });

  it('marks the current name on the list without colour too', () => {
    const lines = composeFrame(
      { screen: 'list', names: ['alpha', 'beta'], index: 1 },
      {},
      { columns: 30, rows: 6 },
      'none',
    );
    expect(lines.find((l) => l.includes('beta'))).toContain('› beta');
    expect(lines.find((l) => l.includes('alpha'))).not.toContain('›');
  });

  it('writes no escape without colour', async () => {
    const lines = composeFrame(stateOf(), { model, scene: await sceneOf() }, { columns: 40, rows: 8 }, 'none');
    expect(lines.join('')).not.toContain('\x1b');
  });
});

describe('the overview', () => {
  // a chain, so the boxes stack down past a 20-row screen
  const chain: DiagramModel = {
    ...model,
    nodes: Array.from({ length: 12 }, (_, i) => ({ id: `n${i}`, name: `Node ${i}` })),
    relations: Array.from({ length: 11 }, (_, i) => ({ id: `r${i}`, from: `n${i}`, to: `n${i + 1}`, kind: 'sync' })),
    layers: [],
  };
  const size = { columns: 60, rows: 20 };
  const braille = /[\u2801-\u28ff]/;
  const at = (line: string, x: number): string | undefined => [...plain(line)][x];

  it('sits in the canvas’s bottom-right corner, framed, while the picture is bigger than the screen', async () => {
    const scene = await sceneOf(chain);
    const place = overviewPlaceOf(stateOf(), scene, size)!;
    const lines = await frame(stateOf(), size, scene);
    sized(lines, size);
    const [top, bottom] = [lines[place.y - 1]!, lines[place.y + place.height]!];
    expect([at(top, place.x - 1), at(top, place.x + place.width)]).toEqual(['┌', '┐']);
    expect([at(bottom, place.x - 1), at(bottom, place.x + place.width)]).toEqual(['└', '┘']);
    // the border's right column is the canvas's last, its bottom row the canvas's last
    expect(place.x + place.width).toBe(size.columns - 1);
    expect(place.y + place.height).toBe(size.rows - 2);
    const inside = lines
      .slice(place.y, place.y + place.height)
      .map((l) => [...plain(l)].slice(place.x, place.x + place.width).join(''));
    expect(inside.join('')).toMatch(braille);
  });

  it('is the corner of the view the scroll keeps clear, while it is on', async () => {
    const scene = await sceneOf(chain);
    const place = overviewPlaceOf(stateOf(), scene, size)!;
    expect(viewOf(stateOf(), scene, size)).toEqual({
      ...canvasSize(stateOf(), size),
      corner: { width: place.width + 2, height: place.height + 2 },
    });
    expect(viewOf(stateOf({ overview: false }), scene, size)).toEqual(canvasSize(stateOf(), size));
  });

  it('goes beside the panel, not under it, on a wide terminal', async () => {
    const wide = { columns: 100, rows: 20 };
    const place = overviewPlaceOf(stateOf({ panel: true }), await sceneOf(chain), wide)!;
    expect(place.x + place.width).toBe(wide.columns - PANEL_WIDTH - 1);
  });

  it('is left out while it is off, when the picture fits, and where the panel covers the canvas', async () => {
    const scene = await sceneOf(chain);
    const shows = async (state: TuiState, s: Scene = scene): Promise<boolean> =>
      (await frame(state, size, s)).some((l) => braille.test(plain(l)));
    expect(await shows(stateOf())).toBe(true);
    expect(await shows(stateOf({ overview: false }))).toBe(false);
    expect(await shows(stateOf(), await sceneOf())).toBe(false);
    expect(overviewPlaceOf(stateOf({ panel: true }), scene, size)).toBeUndefined();
    expect(await shows(stateOf({ panel: true }))).toBe(false);
  });

  it('is in the help', async () => {
    const lines = await frame(stateOf({ help: true }), { columns: 100, rows: 30 });
    expect(lines.some((l) => plain(l).includes('overview on / off'))).toBe(true);
  });

  describe('on a terminal that shows images', () => {
    const graphics: Graphics = { cell: { width: 10, height: 20 }, ink: [200, 210, 220] };

    it('is an image over its place, in the terminal’s text colour, the cells under it blank', async () => {
      const scene = await sceneOf(chain);
      const place = overviewPlaceOf(stateOf(), scene, size)!;
      const image = overviewImage(stateOf(), await inputOf(stateOf(), scene, graphics), size)!;
      expect(image.place).toMatchObject({ x: place.x, y: place.y, width: place.width, height: place.height });
      expect([image.width, image.height]).toEqual([place.width * 10, place.height * 20]);
      expect([...image.rgba.slice(0, 3)]).toEqual([200, 210, 220]);
      expect(image.rgba.some((v, i) => i % 4 === 3 && v > 0)).toBe(true);
      const lines = await frame(stateOf(), size, scene, graphics);
      sized(lines, size);
      const inside = lines
        .slice(place.y, place.y + place.height)
        .map((l) => [...plain(l)].slice(place.x, place.x + place.width).join(''));
      expect(inside.join('').trim()).toBe('');
      // the border stays text
      expect([at(lines[place.y - 1]!, place.x - 1), at(lines[place.y + place.height]!, place.x + place.width)]).toEqual(
        ['┌', '┘'],
      );
    });

    it('is braille under the help, which an image would cover', async () => {
      const scene = await sceneOf(chain);
      const help = stateOf({ help: true });
      // wide enough that the help, in the middle, leaves the overview in its corner
      const big = { columns: 160, rows: 40 };
      expect(overviewImage(help, await inputOf(help, scene, graphics), big)).toBeUndefined();
      expect((await frame(help, big, scene, graphics)).some((l) => braille.test(plain(l)))).toBe(true);
    });

    it('is no image where the overview is not drawn', async () => {
      const scene = await sceneOf(chain);
      const off = stateOf({ overview: false });
      expect(overviewImage(off, await inputOf(off, scene, graphics), size)).toBeUndefined();
      expect(overviewImage(stateOf(), await inputOf(stateOf(), await sceneOf(), graphics), size)).toBeUndefined();
      const list: TuiState = { ...stateOf(), screen: 'list' };
      expect(overviewImage(list, await inputOf(list, scene, graphics), size)).toBeUndefined();
      expect(overviewImage(stateOf(), await inputOf(stateOf(), scene), size)).toBeUndefined();
    });
  });
});

describe('the legend', () => {
  const chain: DiagramModel = {
    ...model,
    nodes: Array.from({ length: 12 }, (_, i) => ({ id: `n${i}`, name: `Node ${i}` })),
    relations: Array.from({ length: 11 }, (_, i) => ({ id: `r${i}`, from: `n${i}`, to: `n${i + 1}`, kind: 'sync' })),
    layers: [],
    legend: {},
  };
  const size = { columns: 60, rows: 20 };
  const row = (lines: string[], y: number, x: number, width: number): string =>
    [...plain(lines[y]!)].slice(x, x + width).join('');

  it('sits in its corner over the overview, framed, its title in the border', async () => {
    const scene = await sceneOf(chain);
    const state = stateOf({ legend: true });
    const place = legendPlaceOf(state, scene, size)!;
    const overview = overviewPlaceOf(state, scene, size)!;
    const lines = await frame(state, size, scene);
    sized(lines, size);
    expect(place.x + place.width).toBe(size.columns);
    expect(place.y + place.height).toBe(overview.y - 1);
    expect([0, 1, 2, 3].map((r) => row(lines, place.y + r, place.x, place.width))).toEqual([
      '┌─ Legend ────┐',
      '│ Connections │',
      '│ ──▶ sync    │',
      '└─────────────┘',
    ]);
  });

  it('goes to the corner the diagram names, and takes the overview’s rows once that is off', async () => {
    const topLeft = await sceneOf({ ...chain, legend: { position: 'top-left' } });
    expect(legendPlaceOf(stateOf({ legend: true }), topLeft, size)).toMatchObject({ x: 0, y: 1 });
    const scene = await sceneOf(chain);
    // its bottom border on the canvas's last row, the one over the status row
    expect(legendPlaceOf(stateOf({ legend: true, overview: false }), scene, size)).toMatchObject({
      y: size.rows - 1 - 4,
    });
  });

  it('is left out while it is off, without a legend, and where the panel covers the canvas', async () => {
    const scene = await sceneOf(chain);
    const shows = async (state: TuiState, s: Scene = scene): Promise<boolean> =>
      (await frame(state, size, s)).some((l) => plain(l).includes('Legend'));
    expect(await shows(stateOf({ legend: true }))).toBe(true);
    expect(await shows(stateOf({ legend: false }))).toBe(false);
    expect(await shows(stateOf({ legend: true }), await sceneOf({ ...chain, legend: undefined }))).toBe(false);
    expect(legendPlaceOf(stateOf({ legend: true, panel: true }), scene, size)).toBeUndefined();
    expect(await shows(stateOf({ legend: true, panel: true }))).toBe(false);
  });

  it('is in the help', async () => {
    const lines = await frame(stateOf({ help: true }), { columns: 100, rows: 30 });
    expect(lines.some((l) => plain(l).includes('legend on / off'))).toBe(true);
  });
});

describe('frameText', () => {
  it('puts each line at its row, inside a synchronized update', () => {
    expect(frameText(['ab', 'cd'])).toBe('\x1b[?2026h\x1b[1;1Hab\x1b[2;1Hcd\x1b[?2026l');
  });

  it('puts the images after the text, inside the same update', () => {
    expect(frameText(['ab'], '<image>')).toBe('\x1b[?2026h\x1b[1;1Hab<image>\x1b[?2026l');
  });
});

describe('the DOS style', () => {
  const GROUND = { blue: '48;2;0;0;170', grey: '48;2;170;170;170', cyan: '48;2;0;170;170', black: '48;2;0;0;0' };
  const DESKTOP = '\x1b[38;2;255;255;255;48;2;0;0;170m';

  async function dosFrame(state: TuiState, size: { columns: number; rows: number }) {
    const scene = await buildScene({ model, pins: {}, style: 'dos' }, UNICODE);
    const canvas = paint(scene, { glyphs: UNICODE }).cells(UNICODE);
    return composeFrame(state, { model, scene, canvas, style: 'dos' }, size, 'truecolor');
  }

  it('draws the title and the status grey, as a menu bar and a status line', async () => {
    const lines = await dosFrame(stateOf(), { columns: 80, rows: 24 });
    for (const bar of [lines[0]!, lines.at(-1)!]) {
      expect(bar.startsWith('\x1b[38;2;0;0;0;48;2;170;170;170m')).toBe(true);
      expect(bar).not.toContain('\x1b[7m');
    }
  });

  it('lays the canvas on the blue desktop out to the screen’s edges', async () => {
    const size = { columns: 80, rows: 24 };
    const lines = await dosFrame(stateOf(), size);
    sized(lines, size);
    // a row below the picture, and the cells right of it on a row it is on
    expect(lines[20]).toBe(`${DESKTOP}${' '.repeat(80)}\x1b[0m`);
    const row = lines[2]!;
    expect(row.slice(row.lastIndexOf(DESKTOP) + DESKTOP.length, -'\x1b[0m'.length)).toMatch(/^ {10,}$/);
  });

  it('puts the help in a grey dialog with a double frame and a shadow', async () => {
    const lines = await dosFrame(stateOf({ help: true }), { columns: 100, rows: 30 });
    const top = lines.find((l) => plain(l).includes(' Keys '))!;
    expect(plain(top)).toMatch(/╔═ Keys ═+╗/);
    expect(top).toContain(GROUND.grey);
    // the dialog's foot, wider than any box's, and the shadow under it
    const foot = lines.findIndex((l) => /╚═{20,}╝/.test(plain(l)));
    expect(lines[foot + 1]).toContain(GROUND.black);
  });

  it('draws the details panel cyan', async () => {
    const lines = await dosFrame(stateOf({ panel: true, selected: 'a' }), { columns: 120, rows: 30 });
    const id = lines.find((l) => plain(l).includes('id a'))!;
    expect(id).toContain(GROUND.cyan);
  });

  it('marks the list’s current name in cyan on the desktop', () => {
    const list: TuiState = { screen: 'list', names: ['alpha', 'beta'], index: 1 };
    const lines = composeFrame(list, { style: 'dos' }, { columns: 30, rows: 6 }, 'truecolor');
    sized(lines, { columns: 30, rows: 6 });
    expect(lines.find((l) => plain(l).includes('beta'))).toContain(GROUND.cyan);
    expect(lines.find((l) => plain(l).includes('alpha'))!.startsWith(DESKTOP)).toBe(true);
    expect(lines[0]).toContain(GROUND.grey);
  });

  it('draws the overview’s image white, as the desktop’s text', async () => {
    const chain: DiagramModel = {
      ...model,
      nodes: Array.from({ length: 12 }, (_, i) => ({ id: `n${i}`, name: `Node ${i}` })),
      relations: Array.from({ length: 11 }, (_, i) => ({ id: `r${i}`, from: `n${i}`, to: `n${i + 1}`, kind: 'sync' })),
    };
    const scene = await buildScene({ model: chain, pins: {}, style: 'dos' }, UNICODE);
    const canvas = paint(scene, { glyphs: UNICODE }).cells(UNICODE);
    const graphics: Graphics = { cell: { width: 10, height: 20 }, ink: [200, 210, 220] };
    const input = { model: chain, scene, canvas, graphics, style: 'dos' as const };
    const image = overviewImage(stateOf(), input, { columns: 60, rows: 20 })!;
    expect([...image.rgba.slice(0, 3)]).toEqual([255, 255, 255]);
  });
});
