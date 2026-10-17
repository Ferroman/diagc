import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { DiagramModel } from '@diagc/core/internal';
import { loadModel } from '../compile';
import { findHome, homePaths } from '../home';
import { exportPins } from './folds';
import { renderToLines } from './render';
import { cellWidth } from './width';

const modelOf = (extra: Partial<DiagramModel>): DiagramModel => ({
  version: 1,
  id: 'm',
  name: 'm',
  nodes: [],
  containment: [],
  relations: [],
  layers: [],
  planes: [],
  ...extra,
});
const plain = { ascii: false, color: 'none' as const };

describe('renderToLines', () => {
  it('draws two boxes and an arrow between them', async () => {
    const model = modelOf({
      nodes: [
        { id: 'a', name: 'Web' },
        { id: 'b', name: 'DB' },
      ],
      relations: [{ id: 'r', from: 'a', to: 'b', kind: 'sync' }],
    });
    expect(await renderToLines({ model, pins: {} }, plain)).toEqual([
      '┌─────┐',
      '│ Web │',
      '└───┬─┘',
      '    │',
      '    ▼',
      ' ┌────┐',
      ' │ DB │',
      ' └────┘',
    ]);
  });

  it('draws an edge from a child to its own container, every way it flows', async () => {
    const model = modelOf({
      nodes: [
        { id: 'p', name: 'Platform' },
        { id: 'a', name: 'Api' },
      ],
      containment: [{ parent: 'p', child: 'a' }],
      relations: [{ id: 'r', from: 'a', to: 'p', kind: 'sync' }],
    });
    for (const direction of ['DOWN', 'UP', 'RIGHT', 'LEFT']) {
      const overlay = { version: 1 as const, planes: {}, settings: { default: { direction } } };
      const lines = await renderToLines({ model, overlay, pins: { p: 'expanded' } }, plain);
      // the arrowhead sits in the frame, so the frame's rows are the whole picture
      expect({ direction, rows: lines.length, arrow: /[▲▼◀▶]/.test(lines.join('')) }).toEqual({
        direction,
        rows: 6,
        arrow: true,
      });
    }
  });

  it('prints a declared legend under the picture, a blank line between', async () => {
    const model = modelOf({
      nodes: [
        { id: 'a', name: 'Web' },
        { id: 'b', name: 'DB' },
      ],
      relations: [{ id: 'r', from: 'a', to: 'b', kind: 'sync' }],
      legend: {},
    });
    const lines = await renderToLines({ model, pins: {} }, plain);
    expect(lines.slice(-5)).toEqual(['', '┌─ Legend ────┐', '│ Connections │', '│ ──▶ sync    │', '└─────────────┘']);
    expect(lines[0]).toBe('┌─────┐');
  });

  it("puts a top corner's legend over the picture, and a right corner's against its right edge", async () => {
    const model = modelOf({
      nodes: [
        { id: 'a', name: 'A web front end with a long name' },
        { id: 'b', name: 'DB' },
      ],
      relations: [{ id: 'r', from: 'a', to: 'b', kind: 'sync' }],
      legend: { position: 'top-right' },
    });
    const lines = await renderToLines({ model, pins: {} }, plain);
    expect(lines[0]!.trimStart()).toBe('┌─ Legend ────┐');
    expect(lines[4]).toBe('');
    const picture = lines.slice(5);
    expect(cellWidth(lines[0]!)).toBe(Math.max(...picture.map(cellWidth)));
  });

  it('leaves out a legend the diagram did not declare, though one is offered for its shapes', async () => {
    const model = modelOf({
      nodes: [
        { id: 'a', name: 'Pick', type: 'activity-action' },
        { id: 'b', name: 'Pack', type: 'activity-action' },
      ],
      relations: [{ id: 'r', from: 'a', to: 'b', kind: 'control' }],
    });
    expect((await renderToLines({ model, pins: {} }, plain)).join('\n')).not.toContain('Legend');
  });

  it('draws nothing for a view with nothing in it', async () => {
    expect(await renderToLines({ model: modelOf({}), pins: {} }, plain)).toEqual([]);
  });

  it('writes only printable ASCII with --ascii', async () => {
    const model = modelOf({
      nodes: [
        { id: 'p', name: 'Platform', type: 'system' },
        { id: 'a', name: 'Queue', type: 'queue' },
        { id: 'b', name: 'Store', type: 'database' },
      ],
      containment: [{ parent: 'p', child: 'a' }],
      relations: [
        { id: 'r', from: 'a', to: 'b', kind: 'async', label: 'a label far too long to fit on any edge at all' },
      ],
    });
    const lines = await renderToLines({ model, pins: { p: 'expanded' } }, { ascii: true, color: 'none' });
    expect(lines.join('\n')).toMatch(/^[\x20-\x7e\n]+$/);
  });

  it('writes no escape without colour, and resets every coloured row', async () => {
    const model = modelOf({ nodes: [{ id: 'a', name: 'A', color: '#1168bd' }] });
    expect((await renderToLines({ model, pins: {} }, plain)).join('')).not.toContain('\x1b');
    const coloured = await renderToLines({ model, pins: {} }, { ascii: false, color: 'truecolor' });
    for (const line of coloured.filter((l) => l.includes('\x1b'))) expect(line.endsWith('\x1b[0m')).toBe(true);
  });

  it('keeps a frame straight around wide characters', async () => {
    const model = modelOf({ nodes: [{ id: 'a', name: '数据库 🙂', type: 'database', technology: 'PG' }] });
    const lines = await renderToLines({ model, pins: {} }, plain);
    expect(lines.length).toBe(5);
    // every row of the box ends its right border in the same terminal column
    expect(new Set(lines.map((l) => cellWidth(l)))).toEqual(new Set([cellWidth(lines[0]!)]));
    expect(lines[2]).toContain('数据库 🙂');
  });

  it('draws a name over several lines, and never writes an escape it was handed', async () => {
    const model = modelOf({ nodes: [{ id: 'a', name: 'First line\nsecond\x1b[2Jline' }] });
    const lines = await renderToLines({ model, pins: {} }, plain);
    expect(lines.join('\n')).not.toContain('\x1b');
    expect(lines).toHaveLength(4);
    expect(new Set(lines.map((l) => cellWidth(l)))).toEqual(new Set([cellWidth(lines[0]!)]));
  });

  it('draws every node of a real diagram', async () => {
    const home = homePaths(findHome(fileURLToPath(import.meta.url)));
    const file = path.join(home.root, '.diagrams', 'src', 'examples', 'c4', 'online-bookstore.diagram.ts');
    const model = await loadModel(file, { coreEntry: home.coreEntry });
    const text = (await renderToLines({ model, pins: exportPins(model, undefined) }, plain)).join('\n');
    for (const n of model.nodes) expect(text).toContain(n.name);
  });
});
