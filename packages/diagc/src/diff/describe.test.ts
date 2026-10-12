import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { compareDiagramSets, type ComparedDiagram } from './compare';
import { describeDiff, formatDiffJson, formatDiffSummary } from './describe';
import { AFTER_LABEL, diffRepo, everyStatus, SHOP_CHANGES, type DiffRepo } from '../../test-fixtures/diff';

let repo: DiffRepo;
beforeAll(() => {
  repo = diffRepo();
});
afterEach(() => repo.cleanup());

describe('describeDiff / formatDiffSummary', () => {
  it('lists the changes by name, renames as old -> new', async () => {
    const diffs = compareDiagramSets(await repo.setAt('v1'), await repo.setAt('v2'));
    expect(describeDiff(diffs.find((d) => d.name === 'shop')!)).toEqual([
      '+ Orders DB [database]',
      '- Legacy [service]',
      '~ API -> API gateway (renamed)',
      '+ API gateway -> Orders DB (reads)',
      '- Web -> Legacy (sync)',
      '~ Web -> API gateway (sync: HTTPS): label',
    ]);
    const text = formatDiffSummary(diffs, 'v1', 'v2');
    expect(text).toContain('diagc diff v1 -> v2');
    expect(text).toContain('new/fresh:\n  + new diagram: fresh (1 nodes, 0 relations)');
    expect(text).toContain('gone:\n  - diagram removed: gone');
    expect(text.split('\n').at(-1)).toBe('3 diagram(s) changed, 0 unchanged');
  });

  it('says when nothing changed', async () => {
    const diffs = compareDiagramSets(await repo.setAt('v2'), await repo.setAt('v2'));
    expect(formatDiffSummary(diffs, 'v2', 'v2')).toMatch(/no diagram changed \(2 compared\)$/);
  });

  it('describes each diagram, and the text lists all but the unchanged', () => {
    const { before, after } = everyStatus();
    const diffs = compareDiagramSets(before, after);
    expect(diffs.map((d) => [d.name, describeDiff(d)])).toEqual([
      ['broken', []],
      ['gone', ['- diagram removed: gone']],
      ['new/fresh', ['+ new diagram: fresh (1 nodes, 0 relations)']],
      ['same', []],
      ['shop', SHOP_CHANGES],
    ]);
    expect(formatDiffSummary(diffs, 'v1', AFTER_LABEL)).toBe(
      [
        'diagc diff v1 -> feat/<x> & "y"',
        '! broken: does not compile at feat/<x> & "y": bad <json>',
        'gone:',
        '  - diagram removed: gone',
        'new/fresh:',
        '  + new diagram: fresh (1 nodes, 0 relations)',
        'shop:',
        ...SHOP_CHANGES.map((l) => `  ${l}`),
        '3 diagram(s) changed, 1 unchanged',
      ].join('\n'),
    );
  });

  it('prints each diagram as JSON: its status, and its changes or why it was not compared', () => {
    const { before, after } = everyStatus();
    const diffs = compareDiagramSets(before, after);
    const text = formatDiffJson(diffs, 'v1', AFTER_LABEL);
    const json = JSON.parse(text) as { from: string; to: string; diagrams: Record<string, unknown>[] };
    expect(text).toBe(JSON.stringify(json, null, 2));
    expect(Object.keys(json)).toEqual(['from', 'to', 'diagrams']);
    expect([json.from, json.to]).toEqual(['v1', AFTER_LABEL]);
    expect(json.diagrams.map((d) => [d.name, d.status, Object.keys(d)])).toEqual([
      ['broken', 'error', ['name', 'status', 'error']],
      ['gone', 'removed', ['name', 'status', 'diff']],
      ['new/fresh', 'added', ['name', 'status', 'diff']],
      ['same', 'unchanged', ['name', 'status', 'diff']],
      ['shop', 'changed', ['name', 'status', 'diff']],
    ]);
    expect(json.diagrams[0]!.error).toBe('does not compile at feat/<x> & "y": bad <json>');
    const shop = diffs[4] as ComparedDiagram;
    expect(json.diagrams[4]!.diff).toEqual(JSON.parse(JSON.stringify(shop.diff)));
  });
});
