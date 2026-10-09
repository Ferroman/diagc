import { describe, expect, it } from 'vitest';
import { FlowRef, model, NodeRef } from './index';

describe('comments and links', () => {
  it('ref.comment() synthesises c1, c2 per element and keeps by/at; ref.link() appends', () => {
    const m = model('d', { name: 'D' });
    const a = m
      .node('a', { name: 'A' })
      .comment('first')
      .comment('second', { by: 'Ann', at: '2026-09-22' })
      .link('Ticket', 'https://x/1');
    const b = m.node('b', { name: 'B' }).comment('other');
    m.threatModel().flow(a, b, 'sync').comment('on the arrow', { id: 'note' });
    const json = m.toJSON();
    expect(json.nodes[0]!.comments).toEqual([
      { id: 'c1', text: 'first' },
      { id: 'c2', text: 'second', by: 'Ann', at: '2026-09-22' },
    ]);
    expect(json.nodes[0]!.links).toEqual([{ label: 'Ticket', url: 'https://x/1' }]);
    expect(json.nodes[1]!.comments).toEqual([{ id: 'c1', text: 'other' }]);
    expect(json.relations[0]!.comments).toEqual([{ id: 'note', text: 'on the arrow' }]);
  });

  it('accepts comments and links as node/relation opts', () => {
    const m = model('opts');
    const a = m.node('x', {
      name: 'X',
      comments: [{ id: 'c1', text: 'via opts' }],
      links: [{ label: 'L', url: 'https://x' }],
    });
    const b = m.node('b');
    m.relate(a, b, { kind: 'reads', comments: [{ id: 'c1', text: 'on the edge' }] });
    const json = m.toJSON();
    expect(json.nodes[0]!.comments).toEqual([{ id: 'c1', text: 'via opts' }]);
    expect(json.nodes[0]!.links).toEqual([{ label: 'L', url: 'https://x' }]);
    expect(json.relations[0]!.comments).toEqual([{ id: 'c1', text: 'on the edge' }]);
  });

  it('drops an explicitly-undefined by/at rather than writing the key', () => {
    // A caller spreading an optional field (`{ by: user?.name }`) must not put
    // `"by": undefined` in the saved file — the same pruning addThreat does.
    const m = model('prune');
    m.node('a').comment('t', { by: undefined, at: undefined });
    const c = m.toJSON().nodes[0]!.comments![0]!;
    expect(c).toEqual({ id: 'c1', text: 't' });
    expect('by' in c).toBe(false);
    expect('at' in c).toBe(false);
  });

  it('rejects a duplicate comment id on the same element (but not across elements), and comment()/link() against an unknown node or relation', () => {
    const m = model('dup');
    const a = m.node('a');
    const b = m.node('b');
    a.comment('one', { id: 'x' });
    expect(() => a.comment('two', { id: 'x' })).toThrow(/x/);
    expect(() => b.comment('other', { id: 'x' })).not.toThrow();
    expect(() => new NodeRef('zz', m).comment('nowhere')).toThrow(/zz/);
    expect(() => new NodeRef('zz', m).link('L', 'https://x')).toThrow(/zz/);
    expect(() => new FlowRef('rr', m).comment('nowhere')).toThrow(/rr/);
  });
});
