import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { compareDiagramSets } from './compare';
import type { DiagramSet } from './load';
import { diffRepo, everyStatus, type DiffRepo } from '../../test-fixtures/diff';

let repo: DiffRepo;
beforeAll(() => {
  repo = diffRepo();
});
afterEach(() => repo.cleanup());

describe('compareDiagramSets', () => {
  it('pairs diagrams by name: changed, removed, added', async () => {
    const diffs = compareDiagramSets(await repo.setAt('v1'), await repo.setAt('v2'));
    expect(diffs.map((d) => [d.name, d.status])).toEqual([
      ['gone', 'removed'],
      ['new/fresh', 'added'],
      ['shop', 'changed'],
    ]);
    expect(diffs.find((d) => d.name === 'shop')).toMatchObject({ before: { layout: { version: 1, planes: {} } } });
  });

  it('narrows to the named diagrams', async () => {
    const diffs = compareDiagramSets(await repo.setAt('v1'), await repo.setAt('v2'), ['shop', 'nope']);
    expect(diffs.map((d) => d.name)).toEqual(['shop']);
  });

  it('reports a diagram that does not compile on one side instead of diffing it', async () => {
    const broken: DiagramSet = {
      label: 'wip',
      diagramsDir: '',
      versions: new Map(),
      errors: new Map([['shop', 'bad json']]),
      warnings: [],
    };
    const [d] = compareDiagramSets(await repo.setAt('v1'), broken, ['shop']);
    expect(d).toMatchObject({ status: 'error', error: 'does not compile at wip: bad json' });
  });

  it('gives each status what it carries', () => {
    const { before, after } = everyStatus();
    expect(compareDiagramSets(before, after).map((d) => [d.name, d.status, Object.keys(d)])).toEqual([
      ['broken', 'error', ['name', 'status', 'error']],
      ['gone', 'removed', ['name', 'status', 'before', 'diff']],
      ['new/fresh', 'added', ['name', 'status', 'after', 'diff']],
      ['same', 'unchanged', ['name', 'status', 'before', 'after', 'diff']],
      ['shop', 'changed', ['name', 'status', 'before', 'after', 'diff']],
    ]);
  });
});
