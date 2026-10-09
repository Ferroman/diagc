import { describe, expect, it } from 'vitest';
import { validate } from './index';
import type { Comment, DiagramModel, DiagramNode, DiagramRelation, Link } from '../types';
import { emptyModel } from './models.fixture';

describe('threats', () => {
  const withThreats = (threats: unknown, where: 'node' | 'relation' = 'node'): DiagramModel => ({
    ...emptyModel(),
    nodes: [{ id: 'a', name: 'A', ...(where === 'node' ? { threats } : {}) } as DiagramNode, { id: 'b', name: 'B' }],
    relations: [
      { id: 'r', from: 'a', to: 'b', kind: 'x', ...(where === 'relation' ? { threats } : {}) } as DiagramRelation,
    ],
  });
  it('accepts a well-formed list on a node and on a relation', () => {
    const ok = [{ id: 't1', category: 'S', title: 'Spoofed', severity: 'high', status: 'open' }];
    expect(validate(withThreats(ok))).toEqual([]);
    expect(validate(withThreats(ok, 'relation'))).toEqual([]);
  });
  it('reports a threats field that is not a list of threat objects, and looks no further', () => {
    expect(validate(withThreats(5)).map((i) => [i.code, i.ref])).toEqual([['invalid-threats', 'a']]);
    expect(validate(withThreats(['t1'], 'relation')).map((i) => [i.code, i.ref])).toEqual([['invalid-threats', 'r']]);
  });
  it('reports each malformed field with the element as ref', () => {
    const issues = validate(
      withThreats(
        [
          { id: '', category: 'S', title: 'x' },
          { id: 't1', category: 'Q', title: 'x' },
          { id: 't1', category: 'S', title: '' },
          { id: 't2', category: 'S', title: 'x', status: 'fixed' },
          { id: 't3', category: 'S', title: 'x', severity: 'urgent' },
        ],
        'relation',
      ),
    );
    expect(issues.map((i) => [i.code, i.ref])).toEqual([
      ['threat-id', 'r'],
      ['threat-category', 'r'],
      ['threat-id', 'r'],
      ['threat-title', 'r'],
      ['threat-status', 'r'],
      ['threat-severity', 'r'],
    ]);
  });
});

describe('comments and links', () => {
  const model = (patch: Partial<DiagramNode>, rel: Partial<DiagramRelation> = {}): DiagramModel => ({
    version: 1,
    id: 'd',
    name: 'd',
    nodes: [
      { id: 'a', name: 'A', ...patch },
      { id: 'b', name: 'B' },
    ],
    containment: [],
    relations: [{ id: 'r', from: 'a', to: 'b', kind: 'sync', ...rel }],
    layers: [],
    planes: [],
  });
  const codes = (m: DiagramModel) => validate(m).map((i) => i.code);

  it('accepts well-formed comments on a node and a relation, and links on a node', () => {
    const m = model(
      {
        comments: [{ id: 'c1', text: 'ok', by: 'Ann', at: '2026-09-22' }],
        links: [{ label: 'Ticket', url: 'https://x/1' }],
      },
      { comments: [{ id: 'c1', text: 'also ok' }] },
    );
    expect(codes(m)).toEqual([]);
  });
  it('reports the wrong shape once per element', () => {
    expect(codes(model({ comments: 'nope' as unknown as Comment[] }))).toEqual(['invalid-comments']);
    expect(codes(model({ links: [null] as unknown as Link[] }))).toEqual(['invalid-links']);
    expect(codes(model({}, { comments: [1] as unknown as Comment[] }))).toEqual(['invalid-comments']);
  });
  it('reports a missing or repeated id, empty text, and a bad date, naming the element', () => {
    const issues = validate(
      model({
        comments: [
          { id: '', text: 'x' },
          { id: 'c1', text: '' },
          { id: 'c1', text: 'y', at: '2026-02-30' },
        ],
      }),
    );
    expect(issues.map((i) => i.code)).toEqual(['comment-id', 'comment-text', 'comment-id', 'comment-at']);
    expect(issues.every((i) => i.ref === 'a')).toBe(true);
  });
  it('reports a link without a label or a url', () => {
    expect(
      codes(
        model({
          links: [
            { label: '', url: 'https://x' },
            { label: 'x', url: '' },
          ],
        }),
      ),
    ).toEqual(['invalid-links', 'invalid-links']);
  });
});
