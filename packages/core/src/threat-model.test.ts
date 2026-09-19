import { describe, expect, it } from 'vitest';
import { BUILTIN_NOTATIONS, STRIDE, type DiagramModel, type LayoutOverlay } from './types';
import { allNotesOpen, boundaryName, boundaryOf, crossingLabel, crossings, isOpen, isThreatModelNode, nextThreatId, nextThreatStatus, strideFor, STRIDE_NAMES, threatRegister, threatsOf, threatSummary, threatTargetKey, TM_BOUNDARY_TYPE, TM_ENTITY_TYPE, TM_FLOW_KIND, TM_NOTATION, TM_PROCESS_TYPE, TM_STORE_TYPE } from './threat-model';

// Built by hand, not through the builder, so this file stays green on its own.
const base = (): DiagramModel => ({
  version: 1,
  id: 'tm',
  name: 'tm',
  notation: 'threat-model',
  nodes: [
    { id: 'user', name: 'Customer', type: TM_ENTITY_TYPE },
    { id: 'web', name: 'Web app', type: TM_PROCESS_TYPE, threats: [{ id: 't1', category: 'E', title: 'Admin route open' }, { id: 't2', category: 'S', title: 'Weak session', status: 'mitigated' }] },
    { id: 'db', name: 'Orders DB', type: TM_STORE_TYPE },
    { id: 'dmz', name: 'DMZ', type: TM_BOUNDARY_TYPE },
    { id: 'backend', name: 'Backend', type: TM_BOUNDARY_TYPE },
  ],
  containment: [
    { parent: 'dmz', child: 'web' },
    { parent: 'backend', child: 'db' },
  ],
  relations: [
    { id: 'user->web#0', from: 'user', to: 'web', kind: TM_FLOW_KIND, label: 'HTTPS', threats: [{ id: 't1', category: 'T', title: 'MITM', severity: 'high' }] },
    { id: 'web->db#0', from: 'web', to: 'db', kind: TM_FLOW_KIND },
  ],
  layers: [],
  planes: [],
});

describe('threat-model vocabulary', () => {
  it('registers the notation id', () => {
    expect(BUILTIN_NOTATIONS).toContain(TM_NOTATION);
  });
  it('recognises the four DFD types and nothing else', () => {
    for (const type of [TM_ENTITY_TYPE, TM_PROCESS_TYPE, TM_STORE_TYPE, TM_BOUNDARY_TYPE]) {
      expect(isThreatModelNode({ id: 'n', name: 'N', type })).toBe(true);
    }
    expect(isThreatModelNode({ id: 'n', name: 'N', type: 'c4-container' })).toBe(false);
    expect(isThreatModelNode({ id: 'n', name: 'N' })).toBe(false);
  });
  it('names every STRIDE category', () => {
    expect(Object.keys(STRIDE_NAMES)).toEqual([...STRIDE]);
  });
});

describe('strideFor', () => {
  it('follows STRIDE-per-element and offers everything to unknown types', () => {
    expect(strideFor(TM_ENTITY_TYPE)).toEqual(['S', 'R']);
    expect(strideFor(TM_PROCESS_TYPE)).toEqual(['S', 'T', 'R', 'I', 'D', 'E']);
    expect(strideFor(TM_STORE_TYPE)).toEqual(['T', 'R', 'I', 'D']);
    expect(strideFor(TM_FLOW_KIND)).toEqual(['T', 'I', 'D']);
    expect(strideFor('c4-container')).toEqual(['S', 'T', 'R', 'I', 'D', 'E']);
    expect(strideFor(undefined)).toEqual(['S', 'T', 'R', 'I', 'D', 'E']);
  });
});

describe('boundaryOf', () => {
  it('finds the nearest boundary ancestor, or nothing outside every boundary', () => {
    const m = base();
    expect(boundaryOf(m, undefined, 'web')).toBe('dmz');
    expect(boundaryOf(m, undefined, 'db')).toBe('backend');
    expect(boundaryOf(m, undefined, 'user')).toBeUndefined();
    expect(boundaryOf(m, undefined, 'dmz')).toBeUndefined();
  });
  it('walks through non-boundary parents and stops at the nearest boundary', () => {
    const m = base();
    m.nodes.push({ id: 'grp', name: 'Group' }, { id: 'inner', name: 'Inner', type: TM_BOUNDARY_TYPE });
    m.containment.push({ parent: 'backend', child: 'inner' }, { parent: 'inner', child: 'grp' }, { parent: 'grp', child: 'db' });
    m.containment = m.containment.filter((e) => !(e.parent === 'backend' && e.child === 'db'));
    expect(boundaryOf(m, undefined, 'db')).toBe('inner');
  });
  it('reads the viewed plane, resolving containmentOf and untagged edges', () => {
    const m = base();
    m.planes = [
      { id: 'arch', name: 'Arch' },
      { id: 'threats', name: 'Threats', notation: 'threat-model' },
      { id: 'borrowed', name: 'Borrowed', containmentOf: 'threats' },
    ];
    // untagged edges belong to the first plane; the threats plane nests differently
    m.containment.push({ parent: 'backend', child: 'web', plane: 'threats' });
    expect(boundaryOf(m, 'arch', 'web')).toBe('dmz');
    expect(boundaryOf(m, undefined, 'web')).toBe('dmz');
    expect(boundaryOf(m, 'threats', 'web')).toBe('backend');
    expect(boundaryOf(m, 'borrowed', 'web')).toBe('backend');
  });
  it('takes the first parent by declaration order when containment is a DAG', () => {
    const m = base();
    m.containment.push({ parent: 'backend', child: 'web' });
    expect(boundaryOf(m, undefined, 'web')).toBe('dmz');
  });
});

describe('crossings', () => {
  it('lists relations whose ends resolve to different boundaries, either side possibly outside', () => {
    const m = base();
    const c = crossings(m, undefined);
    expect(c.get('user->web#0')).toEqual({ to: 'dmz' });
    expect(c.get('web->db#0')).toEqual({ from: 'dmz', to: 'backend' });
  });
  it('ignores flows inside one boundary, whatever their kind', () => {
    const m = base();
    m.containment = m.containment.map((e) => (e.child === 'db' ? { ...e, parent: 'dmz' } : e));
    m.relations.push({ id: 'x', from: 'db', to: 'web', kind: 'reads' });
    const c = crossings(m, undefined);
    expect(c.has('web->db#0')).toBe(false);
    expect(c.has('x')).toBe(false);
    expect(c.size).toBe(1);
  });
});

describe('boundaryName / crossingLabel', () => {
  it('names a boundary, and calls an absent end "outside"', () => {
    const m = base();
    expect(boundaryName(m, 'dmz')).toBe('DMZ');
    expect(boundaryName(m, undefined)).toBe('outside');
  });

  it('falls back to the id for a boundary no node carries', () => {
    // a broken model still has to say WHICH id it means
    expect(boundaryName(base(), 'ghost')).toBe('ghost');
  });

  it('reads a crossing between the two boundaries, with the other arrow', () => {
    const m = base();
    const cross = crossings(m, undefined);
    // the flow's own line is `from → to` over the ELEMENTS; this one is ⇢ over
    // the trust zones, and the studio panel and published table share it
    expect(crossingLabel(m, cross.get('user->web#0')!)).toBe('outside ⇢ DMZ');
    expect(crossingLabel(m, cross.get('web->db#0')!)).toBe('DMZ ⇢ Backend');
    expect(crossingLabel(m, {})).toBe('outside ⇢ outside');
  });
});

describe('threatRegister', () => {
  it('flattens nodes then relations in declaration order, naming a flow by its ends and label', () => {
    const rows = threatRegister(base());
    expect(rows.map((r) => [r.target, r.name, r.threat.id])).toEqual([
      [{ node: 'web' }, 'Web app', 't1'],
      [{ node: 'web' }, 'Web app', 't2'],
      [{ relation: 'user->web#0' }, 'Customer → Web app (HTTPS)', 't1'],
    ]);
  });
  it('names an unlabelled flow by its ends alone', () => {
    const m = base();
    m.relations[1]!.threats = [{ id: 't1', category: 'I', title: 'Plain text' }];
    expect(threatRegister(m).at(-1)?.name).toBe('Web app → Orders DB');
  });
});

describe('threatTargetKey / threatsOf / nextThreatId', () => {
  it('keys node and relation targets in separate namespaces', () => {
    // one flat map holds both, and a node and a relation may share an id
    expect(threatTargetKey({ node: 'a' })).toBe('node:a');
    expect(threatTargetKey({ relation: 'a' })).toBe('relation:a');
  });

  it('reads an element’s threats, undefined for a missing element', () => {
    const m: DiagramModel = {
      version: 1,
      id: 'm',
      name: 'm',
      layers: [],
      planes: [],
      containment: [],
      nodes: [{ id: 'a', name: 'A', threats: [{ id: 't1', category: 'S', title: 'x' }] }],
      relations: [{ id: 'r', from: 'a', to: 'a', kind: TM_FLOW_KIND }],
    };
    expect(threatsOf(m, { node: 'a' })?.map((t) => t.id)).toEqual(['t1']);
    // an element with no `threats` field reads as an empty list; only a missing
    // element is undefined, so callers can tell "none" from "no such element"
    expect(threatsOf(m, { relation: 'r' })).toEqual([]);
    expect(threatsOf(m, { node: 'zz' })).toBeUndefined();
    expect(threatsOf(m, { relation: 'zz' })).toBeUndefined();
  });

  it('hands out the first free t<n>', () => {
    expect(nextThreatId([])).toBe('t1');
    expect(nextThreatId([{ id: 't1', category: 'S', title: 'a' }, { id: 't2', category: 'S', title: 'b' }])).toBe('t3');
    // the gap a removed threat left is reused — ids are per element, not global
    expect(nextThreatId([{ id: 't1', category: 'S', title: 'a' }, { id: 't3', category: 'S', title: 'b' }])).toBe('t2');
  });
});

describe('threatSummary / isOpen', () => {
  it('counts open threats, treating an unset status as open', () => {
    expect(threatSummary(undefined)).toEqual({ open: 0, total: 0 });
    expect(threatSummary([])).toEqual({ open: 0, total: 0 });
    expect(threatSummary(base().nodes[1]!.threats)).toEqual({ open: 1, total: 2 });
    expect(isOpen({ id: 't', category: 'S', title: 'x' })).toBe(true);
    expect(isOpen({ id: 't', category: 'S', title: 'x', status: 'accepted' })).toBe(false);
  });
});

describe('nextThreatStatus', () => {
  it('cycles open → mitigated → accepted → not-applicable → open, reading an absent status as open', () => {
    const t = { id: 't', category: 'S' as const, title: 'x' };
    expect(nextThreatStatus(t)).toBe('mitigated');
    expect(nextThreatStatus({ ...t, status: 'open' })).toBe('mitigated');
    expect(nextThreatStatus({ ...t, status: 'mitigated' })).toBe('accepted');
    expect(nextThreatStatus({ ...t, status: 'accepted' })).toBe('not-applicable');
    expect(nextThreatStatus({ ...t, status: 'not-applicable' })).toBe('open');
  });
});

describe('allNotesOpen', () => {
  const model: DiagramModel = {
    version: 1, id: 'm', name: 'm', layers: [], planes: [], containment: [],
    nodes: [
      { id: 'a', name: 'A', threats: [{ id: 't1', category: 'S', title: 'x' }] },
      { id: 'b', name: 'B' },
    ],
    relations: [{ id: 'r', from: 'a', to: 'b', kind: TM_FLOW_KIND, threats: [{ id: 't1', category: 'T', title: 'y' }] }],
  };
  const layout = (notes: LayoutOverlay['notes']): LayoutOverlay => ({ version: 1, planes: {}, ...(notes !== undefined ? { notes } : {}) });

  it('is true only when every threat-bearing element has open: true on that plane', () => {
    expect(allNotesOpen(model, layout(undefined), 'default')).toBe(false);
    expect(allNotesOpen(model, layout({ default: { 'node:a': { dx: 0, dy: 0, open: true } } }), 'default')).toBe(false);
    expect(
      allNotesOpen(model, layout({ default: { 'node:a': { dx: 0, dy: 0, open: true }, 'relation:r': { dx: 5, dy: 0, open: true } } }), 'default'),
    ).toBe(true);
    // another plane's bucket says nothing about this one
    expect(allNotesOpen(model, layout({ p: { 'node:a': { dx: 0, dy: 0, open: true }, 'relation:r': { dx: 0, dy: 0, open: true } } }), 'default')).toBe(false);
  });

  it('is false for a model with no threats — nothing is open, so "all open" would be vacuous', () => {
    expect(allNotesOpen({ ...model, nodes: [{ id: 'b', name: 'B' }], relations: [] }, layout(undefined), 'default')).toBe(false);
  });
});
