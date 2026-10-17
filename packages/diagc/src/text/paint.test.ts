import { describe, expect, it } from 'vitest';
import type { DiagramModel } from '@diagc/core/internal';
import { parseColor, serialize } from './ansi';
import type { Cell } from './canvas';
import { ASCII, UNICODE } from './glyphs';
import { paint } from './paint';
import type { BoxGeometry } from './layout';
import { buildScene, type Scene } from './scene';

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
const pair = (kind = 'sync', extra = {}): DiagramModel =>
  modelOf({
    nodes: [
      { id: 'a', name: 'Web' },
      { id: 'b', name: 'Database' },
    ],
    relations: [{ id: 'r', from: 'a', to: 'b', kind, ...extra }],
  });

async function drawn(
  model: DiagramModel,
  selected?: string,
  style?: 'dos',
): Promise<{ scene: Scene; cells: Cell[][]; text: string[] }> {
  const pins = Object.fromEntries(model.containment.map((c) => [c.parent, 'expanded' as const]));
  const scene = await buildScene({ model, pins, ...(style !== undefined ? { style } : {}) }, UNICODE);
  const cells = paint(scene, { glyphs: UNICODE, ...(selected !== undefined ? { selected } : {}) }).cells(UNICODE);
  return { scene, cells, text: serialize(cells, 'none') };
}

const at = (cells: Cell[][], x: number, y: number): Cell => cells[y]![x]!;

describe('paint', () => {
  it('draws each box with its name inside, and the arrowhead next to the target', async () => {
    const { scene, cells, text } = await drawn(pair());
    const b = scene.layout.boxes.get('b')!;
    expect(text[b.y + 1]!.slice(b.x, b.x + b.width)).toBe('│ Database │');
    const end = scene.layout.routes.get(scene.view.edges[0]!.id)!.points.at(-1)!;
    expect(at(cells, end.x, end.y).ch).toBe('▼');
  });

  it('points the arrowhead at the box even when the line runs along it', async () => {
    const { scene } = await drawn(pair());
    const [a, b] = [scene.layout.boxes.get('a')!, scene.layout.boxes.get('b')!];
    const id = scene.view.edges[0]!.id;
    // the route's last cells run sideways along the row above the target
    scene.layout.routes.set(id, {
      points: [
        { x: a.x + 1, y: a.y + a.height },
        { x: a.x + 1, y: b.y - 1 },
        { x: b.x + 2, y: b.y - 1 },
      ],
    });
    const cells = paint(scene, { glyphs: UNICODE }).cells(UNICODE);
    expect(at(cells, b.x + 2, b.y - 1).ch).toBe('▼');
  });

  it('keeps a frame’s title whole where an edge crosses it', async () => {
    const model = modelOf({
      nodes: [
        { id: 'c', name: 'Client' },
        { id: 'p', name: 'Platform' },
        { id: 'a', name: 'Api' },
      ],
      containment: [{ parent: 'p', child: 'a' }],
      relations: [{ id: 'r', from: 'c', to: 'a', kind: 'sync' }],
    });
    const { scene } = await drawn(model);
    const [c, p, a] = ['c', 'p', 'a'].map((id) => scene.layout.boxes.get(id)!) as [
      BoxGeometry,
      BoxGeometry,
      BoxGeometry,
    ];
    // straight down through the title's third letter
    const x = p.x + 5;
    scene.layout.routes.set(scene.view.edges[0]!.id, {
      points: [
        { x, y: c.y + c.height },
        { x, y: a.y - 1 },
      ],
    });
    const text = serialize(paint(scene, { glyphs: UNICODE }).cells(UNICODE), 'none');
    expect(text[p.y]).toContain(' Platform ');
  });

  it('joins the line to the border it leaves', async () => {
    const { scene, cells } = await drawn(pair());
    const a = scene.layout.boxes.get('a')!;
    const start = scene.layout.routes.get(scene.view.edges[0]!.id)!.points[0]!;
    expect(at(cells, start.x, a.y + a.height - 1).ch).toBe('┬');
  });

  it('draws a kind’s line style and end marks', async () => {
    expect((await drawn(pair('async'))).text.join('\n')).toContain('╎');
    expect((await drawn(pair('writes'))).text.join('\n')).toContain('┃');
    const none = await drawn(pair('note-link'));
    expect(none.text.join('\n')).not.toContain('▼');
    const fk = await drawn(pair('fk'));
    expect(fk.text.join('\n')).toContain('*');
    expect(fk.text.join('\n')).toContain('1');
  });

  it('writes an open container’s title into its top border', async () => {
    const model = modelOf({
      nodes: [
        { id: 'p', name: 'Platform', type: 'system' },
        { id: 'a', name: 'A' },
      ],
      containment: [{ parent: 'p', child: 'a' }],
    });
    const { scene, text } = await drawn(model);
    const p = scene.layout.boxes.get('p')!;
    // a system is a boundary, so its frame is dashed
    expect(text[p.y]!.slice(p.x, p.x + 18)).toBe('┌╌ Platform system');
  });

  it('draws shapes: rounded corners, a cylinder’s lid, a table’s rule', async () => {
    const model = modelOf({
      nodes: [
        { id: 'q', name: 'Queue', type: 'queue' },
        { id: 'd', name: 'Store', type: 'database' },
        { id: 't', name: 'users', type: 'db-table', columns: [{ name: 'id' }] },
      ],
    });
    const { scene, text } = await drawn(model);
    const q = scene.layout.boxes.get('q')!;
    expect(text[q.y]![q.x]).toBe('╭');
    const d = scene.layout.boxes.get('d')!;
    expect(text[d.y + 1]!.slice(d.x, d.x + d.width)).toMatch(/^├─+┤$/);
    const t = scene.layout.boxes.get('t')!;
    expect(text[t.y + 2]!.slice(t.x, t.x + t.width)).toMatch(/^├─+┤$/);
  });

  it('shows the selection heavy and its edges bold, the rest dim', async () => {
    const model = modelOf({
      nodes: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
        { id: 'c', name: 'C' },
      ],
      relations: [
        { id: 'r1', from: 'a', to: 'b', kind: 'sync' },
        { id: 'r2', from: 'b', to: 'c', kind: 'sync' },
      ],
    });
    const { scene, cells } = await drawn(model, 'a');
    const a = scene.layout.boxes.get('a')!;
    expect(at(cells, a.x, a.y).ch).toBe('┏');
    expect(at(cells, a.x + 2, a.y + 1).style.inverse).toBe(true);
    const [mine, other] = ['r1', 'r2'].map((id) => scene.view.edges.find((e) => e.constituents[0]!.id === id)!);
    const route = (e: typeof mine) => scene.layout.routes.get(e!.id)!.points;
    const mid = (points: { x: number; y: number }[]) => points[0]!;
    expect(at(cells, mid(route(mine)).x, mid(route(mine)).y).style.bold).toBe(true);
    expect(at(cells, mid(route(other)).x, mid(route(other)).y).style.dim).toBe(true);
  });

  it('colours a box border with the node’s colour', async () => {
    const model = modelOf({ nodes: [{ id: 'a', name: 'A', color: '#ff0000' }] });
    const { scene, cells } = await drawn(model);
    const a = scene.layout.boxes.get('a')!;
    expect(at(cells, a.x, a.y).style.fg).toEqual({ rgb: [255, 0, 0] });
  });

  it('draws in ASCII alone with the ASCII glyphs', async () => {
    const pins = {};
    const scene = await buildScene({ model: pair('async', { label: 'reads' }), pins }, ASCII);
    const text = serialize(paint(scene, { glyphs: ASCII }).cells(ASCII), 'none').join('\n');
    expect(text).toMatch(/^[\x20-\x7e\n]*$/);
    expect(text).toContain('reads');
  });
});

describe('paint in the DOS style', () => {
  const rgb = (css: string) => ({ rgb: parseColor(css)! });
  const [BLUE, WHITE, BLACK, YELLOW] = ['#0000aa', '#ffffff', '#000000', '#ffff55'].map(rgb);
  const dos = (model: DiagramModel, selected?: string) => drawn(model, selected, 'dos');
  const typed = modelOf({
    nodes: [
      { id: 'a', name: 'Web', type: 'service' },
      { id: 'b', name: 'Database', type: 'database' },
    ],
    relations: [{ id: 'r', from: 'a', to: 'b', kind: 'sync', label: 'reads' }],
  });

  it('lays the picture on a blue desktop, and leaves room for the shadows', async () => {
    const { scene, cells } = await dos(pair());
    const plain = await drawn(pair());
    expect(scene.layout.width).toBe(plain.scene.layout.width + 2);
    expect(scene.layout.height).toBe(plain.scene.layout.height + 1);
    expect(cells.length).toBe(scene.layout.height);
    // the room's top corner, where no shadow falls
    expect(at(cells, scene.layout.width - 1, 0).style).toEqual({ bg: BLUE, fg: WHITE });
  });

  it("fills a box in its type's colour, in a white double frame, with black text", async () => {
    const { scene, cells, text } = await dos(typed);
    const [a, b] = [scene.layout.boxes.get('a')!, scene.layout.boxes.get('b')!];
    expect(text[a.y]!.slice(a.x, a.x + a.width)).toMatch(/^╔═+╗$/);
    expect(at(cells, a.x, a.y).style).toEqual({ bg: rgb('#aaaaaa'), fg: WHITE });
    const name = at(cells, text[a.y + 1]!.indexOf('Web'), a.y + 1);
    expect(name).toEqual({ ch: 'W', style: { bg: rgb('#aaaaaa'), fg: BLACK, bold: true } });
    // the second type takes the palette's second colour
    expect(at(cells, b.x + 1, b.y + 1).style.bg).toEqual(rgb('#00aaaa'));
  });

  it('fills a box in its own colour, with text in whichever of black and white reads on it', async () => {
    const { scene, cells } = await dos(modelOf({ nodes: [{ id: 'a', name: 'A', color: '#08427b' }] }));
    const a = scene.layout.boxes.get('a')!;
    expect(at(cells, a.x + 1, a.y + 1).style).toEqual({ bg: rgb('#08427b'), fg: WHITE });
  });

  it('casts a block shadow two columns right and a row down, over what is under it', async () => {
    const { scene, cells } = await dos(pair());
    const a = scene.layout.boxes.get('a')!;
    const shade = { bg: BLACK, fg: rgb('#555555') };
    const [right, bottom] = [a.x + a.width, a.y + a.height];
    expect(at(cells, right, a.y + 1).style).toMatchObject(shade);
    expect(at(cells, right + 1, bottom).style).toMatchObject(shade);
    expect(at(cells, a.x + 2, bottom).style).toMatchObject(shade);
    // the light the box stands in: its top row's right and its bottom row's first two
    expect(at(cells, right, a.y).style.bg).toEqual(BLUE);
    expect(at(cells, a.x + 1, bottom).style.bg).toEqual(BLUE);
    // the line leaving the box keeps its character in the shade
    const start = scene.layout.routes.get(scene.view.edges[0]!.id)!.points[0]!;
    expect(at(cells, start.x, bottom).ch).toBe('│');
  });

  it('keeps an end mark bright where it lies in a shadow', async () => {
    const { scene, cells, text } = await dos(pair('fk'));
    const a = scene.layout.boxes.get('a')!;
    const y = a.y + a.height;
    const x = text[y]!.indexOf('*');
    expect(x).toBeGreaterThanOrEqual(a.x + 2);
    expect(at(cells, x, y).style).toEqual({ bg: BLACK, fg: WHITE });
  });

  it('joins a line to the double frame it leaves with the mixed junction', async () => {
    const { scene, cells } = await dos(pair());
    const a = scene.layout.boxes.get('a')!;
    const start = scene.layout.routes.get(scene.view.edges[0]!.id)!.points[0]!;
    expect(at(cells, start.x, a.y + a.height - 1).ch).toBe('╤');
  });

  it('draws lines white and their labels yellow, on the desktop', async () => {
    const { scene, cells } = await dos(typed);
    const route = scene.layout.routes.get(scene.view.edges[0]!.id)!;
    const end = route.points.at(-1)!;
    expect(at(cells, end.x, end.y)).toEqual({ ch: '▼', style: { bg: BLUE, fg: WHITE } });
    const label = route.label!;
    expect(at(cells, label.x, label.y).style).toEqual({ bg: BLUE, fg: YELLOW });
  });

  it('double-frames an open group in white, its title on the frame, and casts it no shadow', async () => {
    const model = modelOf({
      nodes: [
        { id: 'p', name: 'Platform', type: 'team' },
        { id: 'a', name: 'A', type: 'service' },
      ],
      containment: [{ parent: 'p', child: 'a' }],
    });
    const { scene, cells, text } = await dos(model);
    const p = scene.layout.boxes.get('p')!;
    expect(text[p.y]![p.x]).toBe('╔');
    // the palette colours boxes, never an open group's frame
    expect(at(cells, p.x, p.y).style).toEqual({ bg: BLUE, fg: WHITE });
    expect(at(cells, p.x + 3, p.y)).toEqual({ ch: 'P', style: { bg: BLUE, fg: WHITE, bold: true, inverse: false } });
    expect(at(cells, p.x + p.width, p.y + 1).style.bg).toEqual(BLUE);
  });

  it('frames an open group in its own colour where it has one', async () => {
    const model = modelOf({
      nodes: [
        { id: 'p', name: 'Platform', color: '#ff5555' },
        { id: 'a', name: 'A' },
      ],
      containment: [{ parent: 'p', child: 'a' }],
    });
    const { scene, cells } = await dos(model);
    const p = scene.layout.boxes.get('p')!;
    expect(at(cells, p.x, p.y).style.fg).toEqual(rgb('#ff5555'));
  });

  it('heads a table in cyan over its grey body', async () => {
    const model = modelOf({ nodes: [{ id: 't', name: 'users', type: 'db-table', columns: [{ name: 'id' }] }] });
    const { scene, cells } = await dos(model);
    const t = scene.layout.boxes.get('t')!;
    expect(at(cells, t.x + 1, t.y + 1).style.bg).toEqual(rgb('#00aaaa'));
    expect(at(cells, t.x + 1, t.y + 3).style.bg).toEqual(rgb('#aaaaaa'));
  });

  it('shows the selection with a yellow frame and its title reversed', async () => {
    const { scene, cells } = await dos(pair(), 'a');
    const a = scene.layout.boxes.get('a')!;
    expect(at(cells, a.x, a.y)).toMatchObject({ ch: '╔', style: { fg: YELLOW } });
    expect(at(cells, a.x + 2, a.y + 1).style.inverse).toBe(true);
  });
});
