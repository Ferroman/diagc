import { describe, expect, it } from 'vitest';
import { model } from '../builder/index';
import { applyCommand, emptyLayout, type EditorCommand, type EditorState } from './index';
import { withEdgeLabelPlacements } from './layout-pruning';
import { emptyDrawings } from '../drawings';
import { layoutPlaneKey } from '../planes';
import type { DiagramModel, LayoutOverlay } from '../types';

/** The state a command leaves; most tests need nothing else. */
const apply = (state: EditorState, command: EditorCommand): EditorState => applyCommand(state, command).state;

describe('viewer label placements (LayoutOverlay.edgeLabels)', () => {
  function labelled(): EditorState {
    const m = model('l');
    const a = m.node('a', { type: 'service' });
    const b = m.node('b', { type: 'service' });
    m.relate(a, b, { kind: 'sync', label: 'calls' });
    m.relate(b, a, { kind: 'sync', label: 'replies' });
    const json = m.toJSON();
    const [calls, replies] = json.relations;
    const layout = withEdgeLabelPlacements(emptyLayout(), 'default', {
      [calls!.id]: { legacy: { t: 0.2, side: 'top' } },
      [replies!.id]: { legacy: { t: 0.8 } },
    });
    return { model: json, layout, drawings: emptyDrawings() };
  }

  it('merges into the plane bucket without touching other relations', () => {
    const s = labelled();
    const id = s.model.relations[0]!.id;
    const next = withEdgeLabelPlacements(s.layout, 'default', { [id]: { legacy: { t: 0.4 } } });
    expect(next.edgeLabels?.['default']?.[id]).toEqual({ legacy: { t: 0.4 } });
    expect(Object.keys(next.edgeLabels?.['default'] ?? {})).toHaveLength(2);
    expect(withEdgeLabelPlacements(s.layout, 'default', {})).toBe(s.layout);
  });

  it('deleting a relation drops its placements; the last one drops the field', () => {
    let s = labelled();
    const [calls, replies] = s.model.relations;
    s = apply(s, { type: 'delete-relation', id: calls!.id });
    expect(Object.keys(s.layout.edgeLabels?.['default'] ?? {})).toEqual([replies!.id]);
    s = apply(s, { type: 'delete-relation', id: replies!.id });
    expect('edgeLabels' in s.layout).toBe(false);
  });

  it('positioning a label in the MODEL drops the viewer override for it, and only for it', () => {
    let s = labelled();
    const [calls, replies] = s.model.relations;
    s = apply(s, {
      type: 'update-relation',
      id: calls!.id,
      patch: { labels: [{ id: 'legacy', text: 'calls', t: 0.7, side: 'bottom' }] },
    });
    expect(s.layout.edgeLabels?.['default']?.[calls!.id]).toBeUndefined();
    expect(s.layout.edgeLabels?.['default']?.[replies!.id]).toEqual({ legacy: { t: 0.8 } });
  });

  it('an edit that leaves the label where it was keeps the override', () => {
    let s = labelled();
    const calls = s.model.relations[0]!;
    s = apply(s, { type: 'update-relation', id: calls.id, patch: { description: 'unrelated' } });
    expect(s.layout.edgeLabels?.['default']?.[calls.id]).toEqual({ legacy: { t: 0.2, side: 'top' } });
  });
});

describe('note hygiene counts comments and links as bubble content', () => {
  /** the three reasons a bubble exists, one per node: a comment, a threat and a
   * link. Every one of them has a saved placement, so a prune that only knew
   * about threats would be caught here twice over. */
  function mixedState(): EditorState {
    const base: DiagramModel = {
      version: 1,
      id: 'd',
      name: 'd',
      layers: [],
      planes: [],
      containment: [],
      nodes: [
        { id: 'a', name: 'A', comments: [{ id: 'c1', text: 'Remark on A' }] },
        { id: 'b', name: 'B', threats: [{ id: 't1', category: 'S', title: 'Spoofed session' }] },
        { id: 'c', name: 'C', links: [{ label: 'Ticket', url: 'https://x/1' }] },
      ],
      relations: [{ id: 'r', from: 'a', to: 'b', kind: 'sync', comments: [{ id: 'c1', text: 'Remark on r' }] }],
    };
    const layout: LayoutOverlay = {
      ...emptyLayout(),
      notes: {
        [layoutPlaneKey(base)]: {
          'node:a': { dx: 40, dy: -20, open: true },
          'node:b': { dx: 1, dy: 2 },
          'node:c': { dx: 3, dy: 4, open: true },
          'relation:r': { dx: 5, dy: 6, open: true },
        },
      },
    };
    return { model: base, layout, drawings: emptyDrawings() };
  }

  it('keeps a comment-only and a link-only placement through an edit and a rename', () => {
    const s = mixedState();
    const key = layoutPlaneKey(s.model);
    const edited = apply(s, {
      type: 'update-comment',
      target: { node: 'a' },
      id: 'c1',
      patch: { text: 'Edited' },
    });
    expect(edited.layout.notes?.[key]?.['node:a']).toEqual({ dx: 40, dy: -20, open: true });
    expect(edited.layout.notes?.[key]?.['relation:r']).toEqual({ dx: 5, dy: 6, open: true });
    // nothing died, so the overlay keeps its identity — the same contract the
    // threat-only case above pins
    const renamed = apply(s, { type: 'rename-node', id: 'a', name: 'A2' });
    expect(renamed.layout).toBe(s.layout);
    const detailed = apply(s, { type: 'set-node-details', id: 'c', details: { color: '#123456' } });
    expect(detailed.layout.notes?.[key]?.['node:c']).toEqual({ dx: 3, dy: 4, open: true });
  });

  it('prunes a bubble once its last comment or link goes', () => {
    const s = mixedState();
    const key = layoutPlaneKey(s.model);
    const noComment = apply(s, { type: 'remove-comment', target: { node: 'a' }, id: 'c1' });
    expect(noComment.layout.notes?.[key]?.['node:a']).toBeUndefined();
    expect(noComment.layout.notes?.[key]?.['node:b']).toEqual({ dx: 1, dy: 2 });
    const noLink = apply(s, { type: 'set-node-details', id: 'c', details: { links: null } });
    expect(noLink.layout.notes?.[key]?.['node:c']).toBeUndefined();
  });
});
