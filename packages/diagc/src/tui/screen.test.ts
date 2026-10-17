import { describe, expect, it } from 'vitest';
import type { DiagramModel } from '@diagc/core/internal';
import { UNICODE } from '../text/glyphs';
import { paint } from '../text/paint';
import { buildScene, type Scene } from '../text/scene';
import { cellWidth } from '../text/width';
import { canvasSize, composeFrame, frameText, PANEL_WIDTH } from './screen';
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

async function frame(state: TuiState, size: { columns: number; rows: number }, scene?: Scene) {
  const s = scene ?? (await sceneOf());
  const canvas = paint(s, {
    glyphs: UNICODE,
    ...(state.diagram?.selected !== undefined ? { selected: state.diagram.selected } : {}),
  }).cells(UNICODE);
  return composeFrame(state, { model, scene: s, canvas }, size, 'ansi256');
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

describe('frameText', () => {
  it('puts each line at its row, inside a synchronized update', () => {
    expect(frameText(['ab', 'cd'])).toBe('\x1b[?2026h\x1b[1;1Hab\x1b[2;1Hcd\x1b[?2026l');
  });
});
