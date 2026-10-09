import { describe, expect, it } from 'vitest';
import { lintModel } from './lint';
import type { DiagramModel } from './types';
import { diagramWarnings } from './validate/index';

const base = (over: Partial<DiagramModel> = {}): DiagramModel => ({
  version: 1,
  id: 'd',
  name: 'D',
  nodes: [
    { id: 'a', name: 'A', type: 'service' },
    { id: 'b', name: 'B', type: 'database' },
  ],
  containment: [],
  relations: [{ id: 'r', from: 'a', to: 'b', kind: 'sync' }],
  layers: [],
  planes: [],
  ...over,
});

const codes = (m: DiagramModel) => lintModel(m).map((f) => f.code);

describe('lintModel', () => {
  it('is quiet on a clean diagram', () => {
    expect(lintModel(base())).toEqual([]);
  });

  describe('duplicate-name', () => {
    it('flags siblings of one type sharing a name, ignoring case and spaces', () => {
      const m = base({ nodes: [...base().nodes, { id: 'a2', name: ' a ', type: 'service' }] });
      expect(lintModel(m)).toEqual([
        { code: 'duplicate-name', message: "'a2' has the same name as its sibling 'a' (' a ')", ref: 'a2' },
      ]);
    });

    it('allows the same name under different parents, of different types, or on glyphs', () => {
      const m = base({
        nodes: [
          { id: 's1', name: 'S1', type: 'system' },
          { id: 's2', name: 'S2', type: 'system' },
          { id: 'db1', name: 'Database', type: 'database' },
          { id: 'db2', name: 'Database', type: 'database' },
          { id: 'x', name: 'Database', type: 'service' },
          { id: 'e1', name: 'End', type: 'activity-end' },
          { id: 'e2', name: 'End', type: 'activity-end' },
          { id: 'n1', name: '', type: 'service' },
          { id: 'n2', name: '', type: 'service' },
        ],
        containment: [
          { parent: 's1', child: 'db1' },
          { parent: 's2', child: 'db2' },
        ],
        relations: [],
      });
      expect(codes(m)).toEqual([]);
    });
  });

  describe('unknown-type / unknown-kind', () => {
    it('names a type or kind the renderer has no style for, with the near miss', () => {
      const m = base({
        nodes: [
          { id: 'a', name: 'A', type: 'servcie' },
          { id: 'b', name: 'B', type: 'database' },
        ],
        relations: [{ id: 'r', from: 'a', to: 'b', kind: 'object_flow' }],
      });
      expect(lintModel(m)).toEqual([
        {
          code: 'unknown-type',
          message: "'a' has type 'servcie', which draws as a plain box (did you mean 'service'?)",
          ref: 'a',
        },
        {
          code: 'unknown-kind',
          message: "'r' has kind 'object_flow', which draws as a plain arrow (did you mean 'object-flow'?)",
          ref: 'r',
        },
      ]);
    });

    it('offers no guess when nothing is close, and reports each id once', () => {
      const m = base({
        relations: [
          { id: 'r1', from: 'a', to: 'b', kind: 'depends-upon' },
          { id: 'r2', from: 'b', to: 'a', kind: 'depends-upon' },
        ],
      });
      expect(lintModel(m)).toEqual([
        { code: 'unknown-kind', message: "'r1' has kind 'depends-upon', which draws as a plain arrow", ref: 'r1' },
      ]);
    });

    it("knows a notation's own vocabulary only where the diagram uses it", () => {
      const git = (notation?: 'git-graph'): DiagramModel =>
        base({
          ...(notation !== undefined ? { notation } : {}),
          nodes: [
            { id: 'main', name: 'main', type: 'branch' },
            { id: 'c1', name: '', type: 'commit' },
          ],
          containment: [{ parent: 'main', child: 'c1' }],
          relations: [],
        });
      expect(codes(git('git-graph'))).toEqual([]);
      expect(codes(git())).toEqual(['unknown-type', 'unknown-type']);
    });

    it('leaves typeless nodes, pictures and silhouettes alone', () => {
      const m = base({
        nodes: [
          { id: 'a', name: 'A' },
          { id: 'b', name: 'B', type: 'image', image: 'abc.png' },
          { id: 'c', name: 'C', type: 'logo', shape: '/library/x.svg' },
        ],
        relations: [],
      });
      expect(codes(m)).toEqual([]);
    });
  });

  describe('declared but unused', () => {
    it('flags a layer nothing is on', () => {
      const m = base({
        layers: [
          { id: 'used-node', name: 'N' },
          { id: 'used-rel', name: 'R' },
          { id: 'used-rule', name: 'U' },
          { id: 'idle', name: 'I' },
        ],
        nodes: [{ id: 'a', name: 'A', type: 'service', layer: 'used-node' }, base().nodes[1]!],
        relations: [{ id: 'r', from: 'a', to: 'b', kind: 'sync', layer: 'used-rel' }],
        layerRules: [{ kind: 'async', layer: 'used-rule' }],
      });
      expect(lintModel(m)).toEqual([{ code: 'unused-layer', message: "Layer 'idle' has nothing on it", ref: 'idle' }]);
    });

    it('flags a plane with nothing of its own, and not one that borrows, scopes or nests', () => {
      const m = base({
        planes: [
          { id: 'arch', name: 'Arch' },
          { id: 'flow', name: 'Flow', containmentOf: 'arch' },
          { id: 'flat', name: 'Flat' },
        ],
        nodes: [...base().nodes, { id: 'box', name: 'Box', type: 'system' }],
        containment: [{ parent: 'box', child: 'a' }],
      });
      expect(codes(m)).toEqual(['empty-plane']);
      expect(lintModel(m)[0]!.ref).toBe('flat');
    });

    it('flags a legend row for a type or kind the diagram never uses', () => {
      const m = base({
        legend: {
          items: [
            { label: 'Svc', type: 'service' },
            { label: 'Queue', type: 'queue' },
            { label: 'Calls', kind: 'sync' },
            { label: 'Events', kind: 'async' },
            { label: 'Ours', color: '#f00' },
          ],
        },
      });
      expect(lintModel(m).map((f) => f.message)).toEqual([
        "Legend row 'Queue' describes type 'queue', which no node has",
        "Legend row 'Events' describes kind 'async', which no relation has",
      ]);
    });
  });

  describe('undrawn', () => {
    it('flags a node no plane shows, and only that node, not its relations', () => {
      const m = base({
        planes: [
          { id: 'arch', name: 'Arch' },
          { id: 'flow', name: 'Flow', containmentOf: 'arch' },
        ],
        // scoped to a borrowing plane: matched against the donor, so never shown
        nodes: [...base().nodes, { id: 'ghost', name: 'Ghost', type: 'service', plane: 'flow' }],
        relations: [...base().relations, { id: 'r2', from: 'a', to: 'ghost', kind: 'sync' }],
        containment: [{ parent: 'a', child: 'b' }],
      });
      expect(lintModel(m)).toEqual([
        { code: 'undrawn-node', message: "'ghost' is in no plane's view, so it is never drawn", ref: 'ghost' },
      ]);
    });

    it('flags a relation whose ends never share a view', () => {
      const m = base({
        planes: [
          { id: 'p1', name: 'P1' },
          { id: 'p2', name: 'P2' },
        ],
        nodes: [
          { id: 'a', name: 'A', type: 'service', plane: 'p1' },
          { id: 'b', name: 'B', type: 'database', plane: 'p2' },
        ],
      });
      expect(lintModel(m)).toEqual([
        { code: 'undrawn-relation', message: "'r' joins 'a' and 'b', which no plane shows together", ref: 'r' },
      ]);
    });
  });
});

describe('diagramWarnings', () => {
  it('carries the lint findings', () => {
    const m = base({ layers: [{ id: 'idle', name: 'I' }] });
    expect(diagramWarnings(m).map((w) => w.code)).toEqual(['unused-layer']);
  });
});

describe('a model validation refuses', () => {
  // diagramWarnings is public, so it can meet a model nobody validated; what is
  // malformed is validation's to report, and lint reads past it
  it('gets its findings without throwing on a malformed column or legend item', () => {
    const m = base({
      nodes: [
        { id: 'a', name: 'A', type: 'service', columns: [null] },
        { id: 'b', name: 'B', type: 'database', columns: 5 },
      ] as unknown as DiagramModel['nodes'],
      legend: { items: [null, { label: 'Queue', type: 'queue' }] } as unknown as DiagramModel['legend'],
    });
    expect(lintModel(m)).toEqual([
      { code: 'unused-legend-item', message: "Legend row 'Queue' describes type 'queue', which no node has" },
    ]);
    expect(lintModel(base({ legend: { items: 5 } as unknown as DiagramModel['legend'] }))).toEqual([]);
  });
});
