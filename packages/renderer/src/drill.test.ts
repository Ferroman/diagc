import { describe, expect, it } from 'vitest';
import { drillChain, truncatePath } from './drill';

/** build a parentsOf map (id -> its parent ids) like HierarchyIndex.parentsOf */
const pf = (entries: Record<string, string[]>) => new Map<string, string[]>(Object.entries(entries));

describe('drillChain', () => {
  it('returns the containment chain root->id for a linear hierarchy', () => {
    const parents = pf({ root: [], sys: ['root'], a: ['sys'] });
    expect(drillChain(parents, 'a')).toEqual(['root', 'sys', 'a']);
  });

  it('returns just the id when it is a root', () => {
    const parents = pf({ root: [], sys: ['root'] });
    expect(drillChain(parents, 'root')).toEqual(['root']);
  });

  it('returns [] for an unknown node', () => {
    const parents = pf({ root: [] });
    expect(drillChain(parents, 'ghost')).toEqual([]);
  });

  it('prefers a parent already on the current path when a node has several', () => {
    const parents = pf({ p1: [], p2: [], x: ['p1', 'p2'] });
    expect(drillChain(parents, 'x')).toEqual(['p1', 'x']); // first parent by default
    expect(drillChain(parents, 'x', ['p2'])).toEqual(['p2', 'x']); // honor the current frame
  });

  it('terminates and stays repeat-free even if containment somehow cycles', () => {
    const parents = pf({ a: ['b'], b: ['a'] });
    const chain = drillChain(parents, 'a');
    expect(chain[chain.length - 1]).toBe('a'); // requested id is the deepest frame
    expect(new Set(chain).size).toBe(chain.length); // no repeats
  });
});

describe('truncatePath', () => {
  it('cuts the path to end at the clicked crumb (inclusive)', () => {
    expect(truncatePath(['root', 'sys', 'a'], 'sys')).toEqual(['root', 'sys']);
  });

  it('keeps just the first crumb when it is clicked', () => {
    expect(truncatePath(['root', 'sys', 'a'], 'root')).toEqual(['root']);
  });

  it('returns [] (home / no frame) for a crumb not on the path', () => {
    expect(truncatePath(['root', 'sys', 'a'], 'home')).toEqual([]);
  });
});
