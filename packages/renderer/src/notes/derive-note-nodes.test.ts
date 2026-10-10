import { describe, expect, it } from 'vitest';
import { compileView, type DiagramModel } from '@diagc/core/internal';
import { notationProfile } from '../notations';
import { createTypeRegistry } from '../registry';
import { deriveNoteNodes, isNoteId, type DeriveNotesInput } from './derive-note-nodes';
import { badgeCenter, estimateNoteHeight, NOTE_WIDTH, type Rect } from './note-place';
import type { NoteData } from './NoteNode';

/** a boundary holding a threatened process, a store with a remark, and a
 * threatened flow between them */
const tm: DiagramModel = {
  version: 1,
  id: 'tm',
  name: 'tm',
  notation: 'threat-model',
  layers: [],
  planes: [],
  nodes: [
    {
      id: 'web',
      name: 'Web app',
      type: 'tm-process',
      threats: [{ id: 't1', category: 'S', title: 'Spoofed session' }],
    },
    { id: 'db', name: 'Orders DB', type: 'tm-store', comments: [{ id: 'c1', text: 'Backed up nightly' }] },
    { id: 'dmz', name: 'DMZ', type: 'tm-boundary' },
  ],
  containment: [{ parent: 'dmz', child: 'web' }],
  relations: [
    { id: 'f', from: 'web', to: 'db', kind: 'data-flow', threats: [{ id: 't2', category: 'I', title: 'Plain-text' }] },
  ],
};

/** parent-relative, as the arranged geometry is: `web` sits at (150, 180) absolute */
const geometry = new Map<string, Rect>([
  ['dmz', { x: 100, y: 100, width: 400, height: 300 }],
  ['web', { x: 50, y: 80, width: 120, height: 60 }],
  ['db', { x: 900, y: 150, width: 120, height: 60 }],
]);
const webAbs = { x: 150, y: 180, width: 120, height: 60 };
const dbAbs = { x: 900, y: 150, width: 120, height: 60 };

const onAddThreat = () => {};
const onRetitleThreat = () => {};

function input(over: Partial<DeriveNotesInput> = {}, model: DiagramModel = tm): DeriveNotesInput {
  return {
    compiled: compileView(model, { pins: { dmz: 'expanded' } }),
    geometry,
    open: new Set(['node:web', 'node:db', 'relation:f']),
    placements: undefined,
    badgeSpots: new Map(),
    editing: false,
    offersThreats: true,
    editingRow: null,
    onAddThreat,
    onRetitleThreat,
    onSetThreatStatus: undefined,
    onEditThreatText: undefined,
    onOpenLink: undefined,
    onEndEdit: () => {},
    nameOf: new Map(model.nodes.map((n) => [n.id, n.name])),
    typeRegistry: createTypeRegistry(notationProfile('threat-model').typeStyles),
    ...over,
  };
}

const dataOf = (n: { data: unknown }) => n.data as NoteData;
const byId = (nodes: ReturnType<typeof deriveNoteNodes>, id: string) => {
  const n = nodes.find((x) => x.id === id);
  if (n === undefined) throw new Error(`no ${id}`);
  return n;
};
/** a note's box in absolute flow coordinates */
const absBox = (nodes: ReturnType<typeof deriveNoteNodes>, id: string): Rect => {
  const n = byId(nodes, id);
  const parent = n.parentId !== undefined ? geometry.get(n.parentId)! : { x: 0, y: 0 };
  const d = dataOf(n);
  const height = estimateNoteHeight(d.name, d.threats, d.onAddThreat !== undefined, d.comments, d.links);
  return { x: n.position.x + parent.x, y: n.position.y + parent.y, width: NOTE_WIDTH, height };
};
const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

describe('deriveNoteNodes', () => {
  it('draws a note only for an open element, boxes in view-tree order before flows', () => {
    // `db` is a root; `web` sits inside the boundary, which comes after it
    expect(deriveNoteNodes(input()).map((n) => n.id)).toEqual(['note:node:db', 'note:node:web', 'note:relation:f']);
    expect(deriveNoteNodes(input({ open: new Set(['node:db']) })).map((n) => n.id)).toEqual(['note:node:db']);
    expect(deriveNoteNodes(input({ open: new Set() }))).toEqual([]);
  });

  it('parents a box’s note like the box, with its anchor in the parent’s frame and its badge absolute', () => {
    const note = byId(deriveNoteNodes(input()), 'note:node:web');
    const badge = badgeCenter(webAbs, 'ellipse');
    expect(note.type).toBe('note');
    expect(note.parentId).toBe('dmz');
    expect(dataOf(note).badge).toEqual(badge);
    expect(dataOf(note).anchor).toEqual({ x: badge.x - 100, y: badge.y - 100 });
    expect(overlaps(absBox(deriveNoteNodes(input()), 'note:node:web'), webAbs)).toBe(false);
  });

  it('puts a dragged note at its badge plus the saved offset, and treats {0,0} as never dragged', () => {
    const badge = badgeCenter(webAbs, 'ellipse');
    const dragged = deriveNoteNodes(input({ placements: { 'node:web': { dx: 30, dy: -40 } } }));
    expect(byId(dragged, 'note:node:web').position).toEqual({ x: badge.x + 30 - 100, y: badge.y - 40 - 100 });
    const zero = deriveNoteNodes(input({ placements: { 'node:web': { dx: 0, dy: 0 } } }));
    expect(byId(zero, 'note:node:web').position).toEqual(byId(deriveNoteNodes(input()), 'note:node:web').position);
  });

  it('hangs a flow’s note off the badge the edge reported, top-level, titled by its ends and label', () => {
    const spot = { at: { x: 600, y: 190 }, away: { x: 0, y: 1 }, line: [] };
    const labelled: DiagramModel = { ...tm, relations: [{ ...tm.relations[0]!, label: 'orders' }] };
    const note = byId(deriveNoteNodes(input({ badgeSpots: new Map([['f', spot]]) }, labelled)), 'note:relation:f');
    expect(note.parentId).toBeUndefined();
    expect(dataOf(note).badge).toEqual(spot.at);
    expect(dataOf(note).name).toBe('Web app → Orders DB (orders)');
    expect(dataOf(note).links).toEqual([]);
  });

  it('stands the midpoint of the two boxes in for a flow’s badge until the edge reports one', () => {
    const note = byId(deriveNoteNodes(input()), 'note:relation:f');
    expect(dataOf(note).badge).toEqual({
      x: (webAbs.x + webAbs.width / 2 + dbAbs.x + dbAbs.width / 2) / 2,
      y: (webAbs.y + webAbs.height / 2 + dbAbs.y + dbAbs.height / 2) / 2,
    });
  });

  it('never stacks two open notes, and keeps every note off a reported line', () => {
    const line = Array.from({ length: 25 }, (_, k) => ({ x: 270 + (630 * k) / 24, y: 210 - (30 * k) / 24 }));
    const spot = { at: line[12]!, away: { x: 0, y: -1 }, line };
    const nodes = deriveNoteNodes(input({ badgeSpots: new Map([['f', spot]]) }));
    const boxes = nodes.map((n) => absBox(nodes, n.id));
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i]!, boxes[j]!)).toBe(false);
    for (const box of boxes)
      expect(line.some((p) => p.x > box.x && p.x < box.x + box.width && p.y > box.y && p.y < box.y + box.height)).toBe(
        false,
      );
  });

  it('gives an external stub no note, nor an aggregated flow', () => {
    // drilled into the boundary, `db` is drawn as a stub for an off-frame node
    const drilled = compileView(tm, { root: 'dmz' });
    expect(drilled.externals?.size).toBeGreaterThan(0);
    const stubGeometry = new Map<string, Rect>([...drilled.roots].map((r, i) => [r.id, { ...dbAbs, y: 400 * i }]));
    expect(
      deriveNoteNodes(input({ compiled: drilled, geometry: stubGeometry })).some((n) => n.id === 'note:node:db'),
    ).toBe(false);

    const bundled: DiagramModel = {
      ...tm,
      relations: [
        ...tm.relations,
        { id: 'g', from: 'web', to: 'db', kind: 'data-flow', threats: [{ id: 't3', category: 'T', title: 'Replay' }] },
      ],
    };
    const nodes = deriveNoteNodes(input({ open: new Set(['relation:f', 'relation:g']) }, bundled));
    expect(nodes).toEqual([]);
  });

  it('offers a threat, the row editors and the open row only in edit mode, where threats belong', () => {
    const viewing = deriveNoteNodes(input({ editingRow: { key: 'node:web', id: 't1' } }));
    expect(dataOf(byId(viewing, 'note:node:web')).onAddThreat).toBeUndefined();
    expect(dataOf(byId(viewing, 'note:node:web')).onRetitleThreat).toBeUndefined();
    expect(dataOf(byId(viewing, 'note:node:web')).editingId).toBe('t1');

    const editing = deriveNoteNodes(input({ editing: true, editingRow: { key: 'node:web', id: 't1' } }));
    expect(dataOf(byId(editing, 'note:node:web')).onAddThreat).toBe(onAddThreat);
    expect(dataOf(byId(editing, 'note:node:web')).onRetitleThreat).toBe(onRetitleThreat);
    expect(dataOf(byId(editing, 'note:relation:f')).editingId).toBeUndefined();
    // a store with only a remark: the offer comes from the canvas, not the element
    expect(dataOf(byId(editing, 'note:node:db')).onAddThreat).toBe(onAddThreat);
    const plain = deriveNoteNodes(input({ editing: true, offersThreats: false }));
    expect(dataOf(byId(plain, 'note:node:db')).onAddThreat).toBeUndefined();
    expect(dataOf(byId(plain, 'note:node:web')).onAddThreat).toBe(onAddThreat);
  });

  it('draws no note inside a box the geometry has not placed', () => {
    const noBoundary = new Map([...geometry].filter(([id]) => id !== 'dmz'));
    expect(deriveNoteNodes(input({ geometry: noBoundary })).map((n) => n.id)).toEqual(['note:node:db']);
  });

  it('names a note node by its element key behind the note prefix', () => {
    expect(isNoteId('note:node:web')).toBe(true);
    expect(isNoteId('web')).toBe(false);
  });
});
