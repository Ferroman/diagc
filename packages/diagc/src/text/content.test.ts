import { describe, expect, it } from 'vitest';
import type { DiagramNode, DiagramRelation, ViewEdge, ViewNode } from '@diagc/core/internal';
import { boxText, edgeText, LABEL_MAX, NAME_WRAP } from './content';
import { ASCII, UNICODE } from './glyphs';
import { cellWidth, isControl } from './width';

const view = (node: DiagramNode, extra: Partial<ViewNode> = {}): ViewNode => ({
  id: node.id,
  node,
  state: 'leaf',
  children: [],
  promoted: false,
  sharedMembers: [],
  ...extra,
});
const ctx = { inside: 0, glyphs: UNICODE };
const texts = (b: { lines: { text: string }[] }): string[] => b.lines.map((l) => l.text);

describe('boxText', () => {
  it('holds the name and the type subtitle, a cell of padding inside the border', () => {
    const b = boxText(view({ id: 'c', name: 'Checkout API', type: 'c4-container-api', technology: 'Java 21' }), ctx);
    expect(b.lines).toEqual([
      { text: 'Checkout API', role: 'title' },
      { text: '[Container: Java 21]', role: 'subtitle' },
    ]);
    expect([b.width, b.height, b.shape, b.dashed]).toEqual([24, 4, 'box', false]);
  });

  it('gives a cylinder a row for its lid', () => {
    const b = boxText(view({ id: 'd', name: 'Orders', type: 'c4-container-db' }), ctx);
    expect([b.shape, b.height]).toEqual(['cylinder', 5]);
  });

  it('says how much a folded container holds', () => {
    const b = boxText(view({ id: 'p', name: 'Platform', type: 'system' }, { state: 'collapsed' }), {
      ...ctx,
      inside: 4,
    });
    expect(b.lines.at(-1)).toEqual({ text: '+ 4 inside', role: 'note' });
    expect(b.dashed).toBe(true);
  });

  it('lists a table’s columns under its name and a rule, keys marked and types in one column', () => {
    const node: DiagramNode = {
      id: 't',
      name: 'orders',
      type: 'db-table',
      columns: [{ name: 'id', type: 'uuid', pk: true }, { name: 'user_id', type: 'uuid', fk: true }, { name: 'total' }],
    };
    const b = boxText(view(node), ctx);
    expect(texts(b)).toEqual(['orders', 'PK id       uuid', 'FK user_id  uuid', '   total']);
    expect(b.height).toBe(b.lines.length + 3);
  });

  it('draws only the rows a layer leaves', () => {
    const node: DiagramNode = { id: 't', name: 'users', type: 'db-table', columns: [{ name: 'id' }, { name: 'ssn' }] };
    expect(texts(boxText(view(node, { columns: [{ name: 'id' }] }), ctx))).toEqual(['users', 'id']);
  });

  it('keeps a name’s own line breaks, and no other control character', () => {
    const b = boxText(view({ id: 'n', name: 'Line one\nline two', technology: 'x' }), ctx);
    expect(texts(b)).toEqual(['Line one', 'line two']);
    const esc = boxText(view({ id: 'e', name: 'Red\x1b[31m\tname' }), ctx);
    expect([...texts(esc).join('')].some((ch) => isControl(ch.codePointAt(0)!))).toBe(false);
    const open = boxText(view({ id: 'o', name: 'Two\nlines' }, { state: 'expanded' }), ctx);
    expect(texts(open)).toEqual(['Two lines']);
  });

  it('keeps control characters out of an edge’s label', () => {
    const r = relation({ labels: [{ id: 'l', text: 'reads\nrows' }] });
    expect(edgeText(edge([r], { labels: r.labels! }), UNICODE)).toBe('reads rows');
  });

  it('wraps a long name', () => {
    const b = boxText(view({ id: 'n', name: 'A name that goes on for much longer than any box should be wide' }), ctx);
    expect(b.lines.length).toBeGreaterThan(1);
    for (const l of b.lines) expect(cellWidth(l.text)).toBeLessThanOrEqual(NAME_WRAP);
  });

  it('marks a drill view’s stand-in for an outside node, dashed', () => {
    const b = boxText(view({ id: 's', name: 'Stripe' }, { external: 'stripe' }), ctx);
    expect(b.lines[0]!.text).toBe('↗ Stripe');
    expect(b.dashed).toBe(true);
    expect(
      boxText(view({ id: 's', name: 'Stripe' }, { external: 'stripe' }), { ...ctx, glyphs: ASCII }).lines[0]!.text,
    ).toBe('-> Stripe');
  });

  it('draws a git commit as a dot, its tag beside it', () => {
    const git = { ...ctx, notation: 'git-graph' as const };
    expect(texts(boxText(view({ id: 'c', name: '', type: 'commit' }), git))).toEqual(['●']);
    expect(texts(boxText(view({ id: 'c', name: '24.10.0', type: 'commit' }), git))).toEqual(['● 24.10.0']);
  });

  it('puts a glyph type’s mark before its name', () => {
    expect(boxText(view({ id: 's', name: '', type: 'activity-start' }), ctx).lines[0]!.text).toBe('●');
    expect(boxText(view({ id: 'd', name: 'Paid?', type: 'activity-decision' }), ctx).lines[0]!.text).toBe('◇ Paid?');
  });

  it('gives an open container one title line, the frame as wide as the title needs', () => {
    const b = boxText(view({ id: 'b', name: 'Online Bookstore', type: 'c4-system' }, { state: 'expanded' }), ctx);
    expect(texts(b)).toEqual(['Online Bookstore [Software System]']);
    expect(b.width).toBe(cellWidth('Online Bookstore [Software System]') + 6);
    expect(b.height).toBe(3);
  });
});

const relation = (extra: Partial<DiagramRelation> = {}): DiagramRelation => ({
  id: 'r',
  from: 'a',
  to: 'b',
  kind: 'sync',
  ...extra,
});
const edge = (constituents: DiagramRelation[], extra: Partial<ViewEdge> = {}): ViewEdge => ({
  id: 'a=>b:',
  from: 'a',
  to: 'b',
  kind: 'sync',
  constituents,
  ...extra,
});

describe('edgeText', () => {
  it('joins a relation’s labels, then its polarity and delay', () => {
    const one = relation({ labels: [{ id: 'l', text: 'reads' }], polarity: '+' });
    expect(edgeText(edge([one], { labels: one.labels!, polarity: '+' }), UNICODE)).toBe('reads (+)');
    const two = relation({
      labels: [
        { id: 'l', text: 'a' },
        { id: 'm', text: 'b' },
      ],
    });
    expect(edgeText(edge([two], { labels: two.labels! }), UNICODE)).toBe('a / b');
    expect(edgeText(edge([relation()], { polarity: '-', delay: true }), UNICODE)).toBe('(-) ‖');
    expect(edgeText(edge([relation()], { delay: true }), ASCII)).toBe('||');
  });

  it('uses an aggregate’s own label', () => {
    expect(edgeText(edge([relation(), relation({ id: 's' })], { label: '3 relations' }), UNICODE)).toBe('3 relations');
  });

  it('is empty with nothing to say', () => {
    expect(edgeText(edge([relation()]), UNICODE)).toBe('');
  });

  it('cuts a long label', () => {
    const long = 'x'.repeat(50);
    const text = edgeText(edge([relation()], { labels: [{ id: 'l', text: long }] }), UNICODE);
    expect(cellWidth(text)).toBe(LABEL_MAX);
    expect(text.endsWith('…')).toBe(true);
    expect(edgeText(edge([relation()], { labels: [{ id: 'l', text: long }] }), ASCII).endsWith('~')).toBe(true);
  });
});
