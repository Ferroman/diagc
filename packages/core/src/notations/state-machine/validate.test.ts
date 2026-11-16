import { describe, expect, it } from 'vitest';
import { model } from '../../builder/index';
import { diagramWarnings, validate } from '../../validate/index';
import type { ContainmentEdge, DiagramModel, DiagramNode, DiagramRelation } from '../../types';

const n = (id: string, type: string): DiagramNode => ({ id, name: id, type });
const t = (from: string, to: string, more: Partial<DiagramRelation> = {}): DiagramRelation => ({
  id: `${from}->${to}`,
  from,
  to,
  kind: 'transition',
  ...more,
});
const sm = (
  nodes: DiagramNode[],
  relations: DiagramRelation[] = [],
  containment: ContainmentEdge[] = [],
): DiagramModel => ({
  version: 1,
  id: 'm',
  name: 'm',
  notation: 'state-machine',
  nodes,
  containment,
  relations,
  layers: [],
  planes: [],
});
const c = (parent: string, child: string, plane?: string): ContainmentEdge => ({
  parent,
  child,
  ...(plane !== undefined ? { plane } : {}),
});
const warned = (m: DiagramModel) =>
  diagramWarnings(m)
    .filter((i) => i.code.startsWith('sm-'))
    .map((i) => [i.code, i.ref]);
const only = (m: DiagramModel, code: string) => warned(m).filter(([found]) => found === code);

/** an initial, one state and the transition between them: no flow warning of its own */
const started = (extra: DiagramNode[], rels: DiagramRelation[] = [], contain: ContainmentEdge[] = []) =>
  sm([n('i', 'sm-initial'), n('s', 'sm-state'), ...extra], [t('i', 's'), ...rels], contain);

describe('state-machine rules', () => {
  it('never raise an error', () => {
    const m = sm([n('r', 'sm-region'), n('x', 'sm-state')], [t('r', 'x')], [c('x', 'r'), c('r', 'x')]);
    // a containment cycle is the shared check's error; no sm- rule adds one, and none loops on it
    expect(validate(m).map((i) => i.code)).toEqual(['containment-cycle']);
    expect(validate(sm([n('r', 'sm-region'), n('h', 'sm-history')], [], [c('h', 'r')]))).toEqual([]);
  });

  it('sm-region-parent: a region in a pseudo-state; a loose region is fine', () => {
    expect(only(sm([n('r', 'sm-region'), n('h', 'sm-history')], [], [c('h', 'r')]), 'sm-region-parent')).toEqual([
      ['sm-region-parent', 'r'],
    ]);
    expect(warned(sm([n('r', 'sm-region')]))).toEqual([]);
  });

  it('sm-region-siblings: a plain state beside a region, not an exit point', () => {
    const o = [n('o', 'sm-state'), n('r1', 'sm-region'), n('r2', 'sm-region')];
    const inO = [c('o', 'r1'), c('o', 'r2')];
    expect(warned(sm([...o, n('x', 'sm-exit')], [], [...inO, c('o', 'x')]))).toEqual([]);
    expect(warned(sm([...o, n('p', 'sm-state')], [], [...inO, c('o', 'p')]))).toEqual([['sm-region-siblings', 'p']]);
  });

  it('sm-machine-parent', () => {
    expect(warned(sm([n('a', 'sm-machine'), n('b', 'sm-machine')], [], [c('a', 'b')]))).toEqual([
      ['sm-machine-parent', 'b'],
    ]);
  });

  it('sm-pseudo-children', () => {
    expect(warned(sm([n('f', 'sm-final'), n('s', 'sm-state')], [], [c('f', 's')]))).toEqual([
      ['sm-pseudo-children', 'f'],
    ]);
  });

  it('sm-transition-ends: a machine, a region or a foreign node', () => {
    const m = sm([n('a', 'sm-state'), n('mach', 'sm-machine'), n('reg', 'sm-region'), { id: 'z', name: 'z' }]);
    m.relations = [t('a', 'mach'), t('reg', 'a'), t('a', 'z'), t('a', 'a')];
    expect(warned(m)).toEqual([
      ['sm-transition-ends', 'a->mach'],
      ['sm-transition-ends', 'reg->a'],
      ['sm-transition-ends', 'a->z'],
    ]);
  });

  it('sm-history-parent: a machine and an orthogonal state, not a region or a plain composite', () => {
    const o = [n('o', 'sm-state'), n('r', 'sm-region'), n('h', 'sm-history'), n('d', 'sm-deep-history')];
    expect(only(sm(o, [], [c('o', 'r'), c('r', 'h'), c('o', 'd')]), 'sm-history-parent')).toEqual([
      ['sm-history-parent', 'd'],
    ]);
    expect(warned(sm([n('p', 'sm-state'), n('h', 'sm-history')], [], [c('p', 'h')]))).toEqual([]);
    expect(warned(sm([n('mach', 'sm-machine'), n('h', 'sm-history')], [], [c('mach', 'h')]))).toEqual([
      ['sm-history-parent', 'h'],
    ]);
    expect(warned(sm([n('h', 'sm-history')]))).toEqual([]);
  });

  it('sm-point-parent: in a region, not on a state', () => {
    expect(warned(sm([n('r', 'sm-region'), n('e', 'sm-entry')], [], [c('r', 'e')]))).toEqual([
      ['sm-point-parent', 'e'],
    ]);
    expect(warned(sm([n('p', 'sm-state'), n('e', 'sm-entry')], [], [c('p', 'e')]))).toEqual([]);
    expect(warned(sm([n('e', 'sm-exit')]))).toEqual([]);
  });

  it('sm-initial-count: a second initial in one container', () => {
    const m = sm(
      [n('p', 'sm-state'), n('i1', 'sm-initial'), n('i2', 'sm-initial'), n('s', 'sm-state')],
      [t('i1', 's'), t('i2', 's')],
      [c('p', 'i1'), c('p', 'i2')],
    );
    expect(only(m, 'sm-initial-count')).toEqual([['sm-initial-count', 'i2']]);
  });

  it('sm-initial-flow: a trigger, a missing exit, an entry', () => {
    expect(warned(sm([n('i', 'sm-initial'), n('s', 'sm-state')], [t('i', 's', { trigger: 'go' })]))).toEqual([
      ['sm-initial-flow', 'i'],
    ]);
    expect(warned(sm([n('i', 'sm-initial')]))).toEqual([['sm-initial-flow', 'i']]);
    expect(only(sm([n('i', 'sm-initial'), n('s', 'sm-state')], [t('s', 'i'), t('i', 's')]), 'sm-initial-flow')).toEqual(
      [['sm-initial-flow', 'i']],
    );
    expect(warned(started([]))).toEqual([]);
  });

  it('sm-final-outgoing: a final or terminate with an exit', () => {
    const m = started(
      [n('f', 'sm-final'), n('x', 'sm-terminate')],
      [t('s', 'f'), t('f', 's'), t('s', 'x'), t('x', 's')],
    );
    expect(only(m, 'sm-final-outgoing')).toEqual([
      ['sm-final-outgoing', 'f'],
      ['sm-final-outgoing', 'x'],
    ]);
  });

  it('sm-choice-guards', () => {
    const choice = (guards: (string | undefined)[]) =>
      started(
        [n('c', 'sm-choice'), n('a', 'sm-state'), n('b', 'sm-state')],
        [t('s', 'c'), ...guards.map((g, k) => t('c', k === 0 ? 'a' : 'b', g === undefined ? {} : { guard: g }))],
      );
    expect(only(choice(['ok', 'else']), 'sm-choice-guards')).toEqual([]);
    expect(only(choice(['else', 'else']), 'sm-choice-guards')).toEqual([['sm-choice-guards', 'c']]);
    expect(only(choice([undefined]), 'sm-choice-guards')).toEqual([['sm-choice-guards', 'c']]);
  });

  describe('sm-bar-shape', () => {
    const orth = [
      n('o', 'sm-state'),
      n('r1', 'sm-region'),
      n('r2', 'sm-region'),
      n('a', 'sm-state'),
      n('b', 'sm-state'),
    ];
    const fork = (regionOfB: string) =>
      started(
        [...orth, n('f', 'sm-bar')],
        [t('s', 'f'), t('f', 'a'), t('f', 'b')],
        [c('o', 'r1'), c('o', 'r2'), c('r1', 'a'), c(regionOfB, 'b')],
      );

    it('a fork into different regions of one state is clean', () => {
      expect(only(fork('r2'), 'sm-bar-shape')).toEqual([]);
    });
    it('a fork into one region warns', () => {
      expect(only(fork('r1'), 'sm-bar-shape')).toEqual([['sm-bar-shape', 'f']]);
    });
    it('a bar with neither one in nor one out warns', () => {
      expect(only(sm([n('f', 'sm-bar')]), 'sm-bar-shape')).toEqual([['sm-bar-shape', 'f']]);
    });
    it('a join is clean', () => {
      const m = sm(
        [n('a', 'sm-state'), n('b', 'sm-state'), n('f', 'sm-bar'), n('z', 'sm-state')],
        [t('a', 'f'), t('b', 'f'), t('f', 'z')],
      );
      expect(only(m, 'sm-bar-shape')).toEqual([]);
    });
  });

  it('sm-unreachable', () => {
    expect(warned(started([n('island', 'sm-state')]))).toEqual([['sm-unreachable', 'island']]);
  });

  it('sm-transition-label: parts and a label together', () => {
    expect(warned(started([], [t('s', 's', { trigger: 'x', label: 'go' })]))).toEqual([
      ['sm-transition-label', 's->s'],
    ]);
    expect(warned(started([], [t('s', 's', { trigger: 'x' })]))).toEqual([]);
    expect(warned(started([], [t('s', 's', { label: 'go' })]))).toEqual([]);
  });

  it('lists the structure rules before the flow rules', () => {
    const m = sm([n('i', 'sm-initial'), n('f', 'sm-final'), n('s', 'sm-state')], [t('f', 's')], [c('f', 's')]);
    expect(
      warned(m)
        .map(([code]) => code)
        .filter((code) => code !== 'sm-unreachable'),
    ).toEqual(['sm-pseudo-children', 'sm-initial-flow', 'sm-final-outgoing']);
  });

  describe('planes', () => {
    const planed = (): DiagramModel => ({
      ...sm([n('h', 'sm-history'), n('r', 'sm-region')]),
      planes: [
        { id: 'a', name: 'A', notation: 'state-machine' },
        { id: 'k', name: 'K', notation: 'c4' },
        { id: 'b', name: 'B', notation: 'state-machine' },
      ],
      containment: [c('h', 'r', 'a'), c('h', 'r', 'b'), c('h', 'r', 'k')],
    });

    it('warns once per plane it is wrong on, in declaration order, naming each', () => {
      const m = planed();
      const found = diagramWarnings(m).filter((i) => i.code === 'sm-region-parent');
      expect(found.map((w) => w.message)).toEqual([
        expect.stringContaining("on plane 'a'"),
        expect.stringContaining("on plane 'b'"),
      ]);
      const keys = diagramWarnings(m).map((i) => `${i.code}|${i.ref}|${i.message}`);
      expect(new Set(keys).size).toBe(keys.length);
    });

    const regionWarnings = (model: DiagramModel) =>
      diagramWarnings(model)
        .filter((i) => i.code === 'sm-region-parent')
        .map((i) => i.message);

    it("reads each plane's own containment: wrong only on b, warns only for b", () => {
      const m = planed();
      m.containment = [c('h', 'r', 'b')];
      expect(regionWarnings(m)).toEqual([expect.stringContaining("on plane 'b'")]);
    });

    it('counts an untagged edge on the default plane only', () => {
      const m = planed();
      m.containment = [c('h', 'r')];
      expect(regionWarnings(m)).toEqual([expect.stringContaining("on plane 'a'")]);
    });

    it("reads the donor's containment on a plane that borrows, and ignores its own edges", () => {
      const m = planed();
      m.planes = [
        { id: 'a', name: 'A', notation: 'state-machine' },
        { id: 'c', name: 'C', notation: 'state-machine', containmentOf: 'a' },
      ];
      m.containment = [c('h', 'r', 'a')];
      expect(regionWarnings(m)).toEqual([
        expect.stringContaining("on plane 'a'"),
        expect.stringContaining("on plane 'c'"),
      ]);
      m.containment = [c('h', 'r', 'c')];
      expect(regionWarnings(m)).toEqual([]);
    });

    it('leaves a plane of another notation alone, and a model without planes unlabelled', () => {
      const m = planed();
      m.planes = [{ id: 'k', name: 'K', notation: 'c4' }];
      expect(warned(m)).toEqual([]);
      const plain = sm([n('r', 'sm-region'), n('h', 'sm-history')], [], [c('h', 'r')]);
      expect(diagramWarnings(plain)[0]!.message).not.toContain('plane');
    });
  });

  describe('messages', () => {
    const said = (m: DiagramModel, code: string) =>
      diagramWarnings(m)
        .filter((i) => i.code === code)
        .map((i) => i.message);

    it('state the fact, then the rule', () => {
      expect(
        said(sm([n('i', 'sm-initial'), n('s', 'sm-state')], [t('i', 's'), t('i', 's')]), 'sm-initial-flow'),
      ).toEqual([
        "'i' has 2 outgoing transitions; an initial has no incoming transition and exactly one outgoing, with no trigger or guard",
      ]);
      expect(
        said(sm([n('i', 'sm-initial'), n('s', 'sm-state')], [t('i', 's', { guard: 'x' })]), 'sm-initial-flow'),
      ).toEqual([
        "'i' leaves by a transition with a trigger or guard; an initial has no incoming transition and exactly one outgoing, with no trigger or guard",
      ]);
      expect(said(started([n('f', 'sm-final')], [t('s', 'f'), t('f', 's')]), 'sm-final-outgoing')).toEqual([
        "'f' has 1 outgoing transition; a final or a terminate ends the machine and has none",
      ]);
      expect(said(sm([n('f', 'sm-bar')]), 'sm-bar-shape')).toEqual([
        "'f' has 0 incoming and 0 outgoing transitions; a bar is a fork (one in, several out, into different regions of one state) or a join (several in, one out)",
      ]);
      expect(said(started([], [t('s', 's', { trigger: 'x', label: 'go' })]), 'sm-transition-label')).toEqual([
        "'s->s' has both a label and trigger/guard/effect; the parts are drawn and the label is ignored",
      ]);
    });

    it("end every warning with ' on plane <id>' on a model with planes", () => {
      const nodes = [
        n('m1', 'sm-machine'),
        n('m2', 'sm-machine'),
        n('h', 'sm-history'),
        n('r', 'sm-region'),
        n('o', 'sm-state'),
        n('r2', 'sm-region'),
        n('x', 'sm-state'),
        n('e', 'sm-entry'),
        n('i1', 'sm-initial'),
        n('i2', 'sm-initial'),
        n('s', 'sm-state'),
        n('u', 'sm-state'),
        n('f', 'sm-final'),
        n('ch', 'sm-choice'),
        n('b', 'sm-bar'),
      ];
      const inM1 = ['m2', 'h', 'o', 'i1', 'i2', 's', 'u', 'f', 'ch', 'b'].map((k) => c('m1', k, 'p'));
      const containment = [...inM1, c('h', 'r', 'p'), c('o', 'r2', 'p'), c('o', 'x', 'p'), c('r2', 'e', 'p')];
      const relations = [
        t('i1', 's'),
        t('s', 'f'),
        t('f', 's'),
        t('s', 'ch'),
        t('ch', 's'),
        t('s', 'm2'),
        t('s', 's', { trigger: 'x', label: 'go' }),
      ];
      const m: DiagramModel = {
        ...sm(nodes, relations, containment),
        planes: [{ id: 'p', name: 'P', notation: 'state-machine' }],
      };
      const found = diagramWarnings(m).filter((i) => i.code.startsWith('sm-'));
      expect(new Set(found.map((i) => i.code))).toEqual(
        new Set([
          'sm-region-parent',
          'sm-region-siblings',
          'sm-machine-parent',
          'sm-pseudo-children',
          'sm-transition-ends',
          'sm-history-parent',
          'sm-point-parent',
          'sm-initial-count',
          'sm-initial-flow',
          'sm-final-outgoing',
          'sm-choice-guards',
          'sm-bar-shape',
          'sm-unreachable',
          'sm-transition-label',
        ]),
      );
      for (const w of found) expect(w.message).toMatch(/ on plane 'p'$/);
    });
  });

  describe('a machine with nothing in it yet', () => {
    it('an empty diagram has no warnings', () => {
      expect(diagramWarnings(sm([]))).toEqual([]);
    });
    it('no initial means no unreachable warning', () => {
      expect(warned(sm([n('a', 'sm-state'), n('b', 'sm-state')], [t('a', 'b')]))).toEqual([]);
    });
  });

  it('the spec example has no warnings', () => {
    const m = model('order');
    const order = m.stateMachine('order', { name: 'Order' });
    const draft = order.state('draft', 'Draft');
    const paid = order.state('paid', 'Paid', { entry: 'reserveStock', exit: 'releaseHold' });
    const fulfil = order.state('fulfil', 'Fulfilment');
    order.final();
    const pick = fulfil.region('pick', 'Picking');
    const bill = fulfil.region('bill', 'Billing');
    pick.initial().to(pick.state('picking', 'Picking'));
    bill.initial().to(bill.state('invoicing', 'Invoicing'));
    order.initial().to(draft);
    order.transition(draft, paid, { trigger: 'pay', guard: 'total > 0', effect: 'charge' });
    order.transition(paid, fulfil, { trigger: 'ship' });
    paid.on('remind', { guard: 'overdue', effect: 'email' });
    pick.history();
    expect(diagramWarnings(m.toJSON())).toEqual([]);
  });
});
