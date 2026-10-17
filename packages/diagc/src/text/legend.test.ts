import { describe, expect, it } from 'vitest';
import type { DiagramModel } from '@diagc/core/internal';
import type { Cell } from './canvas';
import { ASCII, UNICODE } from './glyphs';
import { legendCells, legendSize, type TextLegend } from './legend';
import { buildScene, type SceneInput } from './scene';

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

// The docs' legend example: a layer, three kinds, an item that recaptions one of them
// and an item that is only a colour.
const shop = modelOf({
  nodes: [
    { id: 'web', name: 'Storefront', type: 'service' },
    { id: 'api', name: 'Orders API', type: 'service' },
    { id: 'db', name: 'Orders DB', type: 'database', color: '#f59e0b' },
  ],
  relations: [
    { id: 'r1', from: 'web', to: 'api', kind: 'sync' },
    { id: 'r2', from: 'api', to: 'db', kind: 'writes' },
    { id: 'r3', from: 'web', to: 'db', kind: 'flow', layer: 'data-flow' },
  ],
  layers: [{ id: 'data-flow', name: 'Data flow', tint: '#0ea5e9' }],
  legend: {
    items: [
      { label: 'Fire-and-forget', kind: 'flow' },
      { label: 'Owned by Payments', color: '#f59e0b' },
    ],
  },
});

const legendFor = async (model: DiagramModel, extra: Partial<SceneInput> = {}, glyphs = UNICODE) =>
  (await buildScene({ model, pins: {}, ...extra }, glyphs)).legend;

/** Each section as its title and then its rows, a row as its swatch and its label. */
const read = (legend: TextLegend | undefined): string[][] | undefined =>
  legend?.sections.map((s) => [s.title, ...s.rows.map((r) => `${r.swatch} ${r.label}`)]);

const text = (cells: Cell[][]): string[] => cells.map((row) => row.map((c) => c.ch).join(''));

describe('the legend of a scene', () => {
  it('keys the layers, the kinds and the items, in the sections the browser has', async () => {
    const legend = await legendFor(shop, { layers: ['data-flow'] });
    expect(read(legend)).toEqual([
      ['Layers', ' ■  Data flow'],
      ['Connections', '──▶ sync', '━━▶ writes', '──▶ Fire-and-forget'],
      ['Notes', ' ■  Owned by Payments'],
    ]);
    expect(legend).toMatchObject({ title: 'Legend', position: 'bottom-right', declared: true });
  });

  it('draws a swatch in the colour of what it stands for', async () => {
    const legend = (await legendFor(shop, { layers: ['data-flow'] }))!;
    const [layers, kinds, notes] = legend.sections;
    expect(layers!.rows[0]!.style).toEqual({ fg: { rgb: [14, 165, 233] } });
    expect(kinds!.rows.map((r) => r.style)).toEqual([{}, {}, { fg: { rgb: [14, 165, 233] } }]);
    expect(notes!.rows[0]!.style).toEqual({ fg: { rgb: [245, 158, 11] } });
  });

  it("colours a kind with its layers' tint only where every line of it shares one, never a relation's own", async () => {
    const model = modelOf({
      nodes: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
        { id: 'c', name: 'C' },
      ],
      relations: [
        { id: 'r1', from: 'a', to: 'b', kind: 'sync', layer: 'red' },
        { id: 'r2', from: 'b', to: 'c', kind: 'sync', layer: 'blue' },
        { id: 'r3', from: 'a', to: 'c', kind: 'async', layer: 'red' },
        { id: 'r4', from: 'c', to: 'a', kind: 'writes', style: { color: '#ff0000' } },
      ],
      layers: [
        { id: 'red', name: 'Red', tint: '#ff0000' },
        { id: 'blue', name: 'Blue', tint: '#0000ff' },
      ],
      legend: { show: ['kinds'] },
    });
    const kinds = (await legendFor(model, { layers: ['red', 'blue'] }))!.sections[0]!;
    expect(kinds.rows.map((r) => [r.label, r.style])).toEqual([
      ['sync', {}],
      ['async', { fg: { rgb: [255, 0, 0] } }],
      ['writes', {}],
    ]);
  });

  it('keys only what is drawn: a layer turned off leaves, and an item for a kind not drawn is a note', async () => {
    expect(read(await legendFor(shop, { layers: [] }))).toEqual([
      ['Connections', '──▶ sync', '━━▶ writes'],
      ['Notes', '──▶ Fire-and-forget', ' ■  Owned by Payments'],
    ]);
  });

  it('keys a layer that is on while what it tags is folded away, as the browser does', async () => {
    const folded = { ...shop, nodes: [{ id: 'shop', name: 'Shop' }, ...shop.nodes] };
    folded.containment = shop.nodes.map((n) => ({ parent: 'shop', child: n.id }));
    expect(read(await legendFor(folded, { layers: ['data-flow'] }))).toEqual([
      ['Layers', ' ■  Data flow'],
      ['Notes', '──▶ Fire-and-forget', ' ■  Owned by Payments'],
    ]);
  });

  it('keys a layer only on the part of the diagram drawn: none outside a drill', async () => {
    const drilled = {
      ...shop,
      nodes: [{ id: 'shop', name: 'Shop' }, { id: 'out', name: 'Outside', layer: 'data-flow' }, ...shop.nodes],
      containment: shop.nodes.map((n) => ({ parent: 'shop', child: n.id })),
      relations: shop.relations.filter((r) => r.layer === undefined),
    };
    expect(read(await legendFor(drilled, { layers: ['data-flow'] }))![0]).toEqual(['Layers', ' ■  Data flow']);
    expect(read(await legendFor(drilled, { layers: ['data-flow'], root: 'shop' }))![0]).toEqual([
      'Connections',
      '──▶ sync',
      '━━▶ writes',
    ]);
  });

  it('takes the title and the corner the diagram gives it', async () => {
    const legend = await legendFor({ ...shop, legend: { title: 'Key', position: 'top-left' } });
    expect(legend).toMatchObject({ title: 'Key', position: 'top-left' });
  });

  it('keys the element types only when asked, and then exactly the sections asked for', async () => {
    expect(read(await legendFor({ ...shop, legend: { show: ['types'] } }))).toEqual([
      ['Elements', '┌─┐ service', '╭─╮ database'],
    ]);
  });

  it('keys a shape that says nothing about itself without being asked, under the name the browser gives it', async () => {
    const model = modelOf({
      nodes: [
        { id: 's', name: '', type: 'activity-start' },
        { id: 'a', name: 'Pick', type: 'activity-action' },
        { id: 'd', name: 'In stock?', type: 'activity-decision' },
      ],
      relations: [
        { id: 'r1', from: 's', to: 'a', kind: 'control' },
        { id: 'r2', from: 'a', to: 'd', kind: 'control' },
      ],
      legend: {},
    });
    expect(read(await legendFor(model))).toEqual([
      ['Connections', '──▶ Control flow'],
      ['Elements', '╭─╮ Action', ' ◇  Decision / merge', ' ●  Start'],
    ]);
  });

  it('is offered on a diagram that declared none only for such shapes, lines and marks', async () => {
    const plain = modelOf({
      nodes: [
        { id: 'a', name: 'A', type: 'service' },
        { id: 'b', name: 'B', type: 'service' },
      ],
      relations: [{ id: 'r', from: 'a', to: 'b', kind: 'sync' }],
    });
    expect(await legendFor(plain)).toBeUndefined();
    const flow = modelOf({
      nodes: [
        { id: 'a', name: 'A', type: 'activity-action' },
        { id: 'b', name: 'B', type: 'activity-action' },
      ],
      relations: [{ id: 'r', from: 'a', to: 'b', kind: 'control' }],
    });
    expect(await legendFor(flow)).toMatchObject({ declared: false });
  });

  it("keys a table's key columns", async () => {
    const model = modelOf({
      nodes: [
        {
          id: 't',
          name: 'orders',
          type: 'db-table',
          columns: [
            { name: 'id', pk: true },
            { name: 'user_id', fk: true },
          ],
        },
      ],
    });
    expect(read(await legendFor(model))).toEqual([['Marks', 'PK  Primary key', 'FK  Foreign key column']]);
  });

  it('draws its swatches in the glyphs the picture is drawn in', async () => {
    const legend = await legendFor(shop, { layers: ['data-flow'] }, ASCII);
    expect(read(legend)![1]).toEqual(['Connections', '--> sync', '==> writes', '--> Fire-and-forget']);
  });

  it('is nothing for a declared legend with nothing to key', async () => {
    expect(await legendFor(modelOf({ nodes: [{ id: 'a', name: 'A' }], legend: {} }))).toBeUndefined();
  });
});

describe('legendCells', () => {
  it('frames the legend, its title in the top border and its section titles over their rows', async () => {
    const legend = (await legendFor(shop, { layers: ['data-flow'] }))!;
    expect(legendSize(legend)).toEqual({ width: 25, height: 10 });
    const cells = legendCells(legend, UNICODE);
    expect(text(cells)).toEqual([
      '┌─ Legend ──────────────┐',
      '│ Layers                │',
      '│  ■  Data flow         │',
      '│ Connections           │',
      '│ ──▶ sync              │',
      '│ ━━▶ writes            │',
      '│ ──▶ Fire-and-forget   │',
      '│ Notes                 │',
      '│  ■  Owned by Payments │',
      '└───────────────────────┘',
    ]);
    expect(cells[0]![0]!.style).toEqual({ dim: true });
    expect(cells[0]![3]!.style).toEqual({ bold: true });
    expect(cells[1]![2]!.style).toEqual({ dim: true });
    expect(cells[2]![3]!.style).toEqual({ fg: { rgb: [14, 165, 233] } });
  });

  it('cuts the rows and the labels to the room it is given, saying how many lines are left out', async () => {
    const legend = (await legendFor(shop, { layers: ['data-flow'] }))!;
    expect(text(legendCells(legend, UNICODE, { width: 16, height: 5 }))).toEqual([
      '┌─ Legend ─────┐',
      '│ Layers       │',
      '│  ■  Data fl… │',
      '│ … 6 more     │',
      '└──────────────┘',
    ]);
  });
});
