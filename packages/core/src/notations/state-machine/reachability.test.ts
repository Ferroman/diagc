import { describe, expect, it } from 'vitest';
import type { ContainmentEdge, DiagramModel, DiagramNode, DiagramRelation } from '../../types';
import { unreachableStates } from './reachability';

const n = (id: string, type: string): DiagramNode => ({ id, name: id, type });
const t = (from: string, to: string): DiagramRelation => ({ id: `${from}->${to}`, from, to, kind: 'transition' });
const c = (parent: string, child: string): ContainmentEdge => ({ parent, child });
const sm = (nodes: DiagramNode[], relations: DiagramRelation[], containment: ContainmentEdge[] = []): DiagramModel => ({
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

describe('unreachableStates', () => {
  it('follows transitions from an initial and lists an island', () => {
    const m = sm(
      [n('i', 'sm-initial'), n('a', 'sm-state'), n('b', 'sm-state'), n('island', 'sm-state')],
      [t('i', 'a'), t('a', 'b')],
    );
    expect(unreachableStates(m, undefined)).toEqual(['island']);
  });

  it('reaches a state through the entry point of a composite', () => {
    const m = sm(
      [n('i', 'sm-initial'), n('comp', 'sm-state'), n('e', 'sm-entry'), n('inner', 'sm-state')],
      [t('i', 'comp'), t('e', 'inner')],
      [c('comp', 'e'), c('comp', 'inner')],
    );
    expect(unreachableStates(m, undefined)).toEqual([]);
  });

  it('reaches the states of each region through an orthogonal state', () => {
    const m = sm(
      [
        n('i', 'sm-initial'),
        n('o', 'sm-state'),
        n('r1', 'sm-region'),
        n('r2', 'sm-region'),
        n('i1', 'sm-initial'),
        n('i2', 'sm-initial'),
        n('a', 'sm-state'),
        n('b', 'sm-state'),
      ],
      [t('i', 'o'), t('i1', 'a'), t('i2', 'b')],
      [c('o', 'r1'), c('o', 'r2'), c('r1', 'i1'), c('r1', 'a'), c('r2', 'i2'), c('r2', 'b')],
    );
    expect(unreachableStates(m, undefined)).toEqual([]);
    // the same states are unreachable once the orthogonal state is
    m.relations = [t('i1', 'a'), t('i2', 'b')];
    expect(unreachableStates(m, undefined)).toEqual(['o', 'a', 'b']);
  });

  it('says nothing about a machine with no initial', () => {
    expect(unreachableStates(sm([n('a', 'sm-state'), n('b', 'sm-state')], [t('a', 'b')]), undefined)).toEqual([]);
    const framed = sm([n('mach', 'sm-machine'), n('a', 'sm-state')], [], [c('mach', 'a')]);
    expect(unreachableStates(framed, undefined)).toEqual([]);
  });

  it('judges each machine on its own', () => {
    const m = sm(
      [n('m1', 'sm-machine'), n('i', 'sm-initial'), n('a', 'sm-state'), n('m2', 'sm-machine'), n('x', 'sm-state')],
      [t('i', 'a')],
      [c('m1', 'i'), c('m1', 'a'), c('m2', 'x')],
    );
    expect(unreachableStates(m, undefined)).toEqual([]);
    m.relations = [];
    expect(unreachableStates(m, undefined)).toEqual(['a']);
  });
});
