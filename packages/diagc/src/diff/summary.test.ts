import { describe, expect, it } from 'vitest';
import { compareDiagramSets } from './compare';
import { summaryMarkdown } from './summary';
import { everyStatus } from '../../test-fixtures/diff';

const { before, after } = everyStatus();
const diffs = compareDiagramSets(before, after);
const pages = (png: boolean) =>
  new Map([
    ['gone', { before: 'gone.before', png }],
    ['new/fresh', { after: 'new/fresh.after', png }],
    ['shop', { before: 'shop.before', after: 'shop.after', png }],
  ]);

describe('summaryMarkdown', () => {
  it('shows each side as its image, and a side the diagram does not have as a dash', () => {
    const md = summaryMarkdown({ diffs, files: pages(true), before, after });
    expect(md).toContain('| Before (v1) | After (feat/<x> & "y") |\n| --- | --- |\n');
    expect(md).toContain('| ![before](shop.before.png) | ![after](shop.after.png) |');
    expect(md).toContain('| ![before](gone.before.png) | — |');
    expect(md).toContain('| — | ![after](new/fresh.after.png) |');
  });

  it('points the images at the image URL when given', () => {
    const md = summaryMarkdown({
      diffs,
      files: pages(true),
      before,
      after,
      imageUrl: 'https://host/pr-7/{path}?raw=true',
    });
    expect(md).toContain(
      '| ![before](https://host/pr-7/shop.before.png?raw=true) | ![after](https://host/pr-7/shop.after.png?raw=true) |',
    );
  });

  it('links the pages instead when no images were rendered', () => {
    const md = summaryMarkdown({ diffs, files: pages(false), before, after, imageUrl: 'https://host/{path}' });
    expect(md).toContain('| [before](shop.before.html) | [after](shop.after.html) |');
  });

  it('lists the changes with their sign as code', () => {
    const md = summaryMarkdown({ diffs, files: pages(true), before, after });
    expect(md).toContain('## shop\n');
    expect(md).toContain(
      '- `~` API -> API gateway (renamed): description\n- `+` API gateway -> Orders <DB> (reads: SQL)',
    );
  });

  it('says why a diagram was not compared, quotes each sidecar left out, and leaves out the unchanged', () => {
    const md = summaryMarkdown({ diffs, files: pages(true), before, after });
    expect(md).toContain('## broken\n\nNot compared: does not compile at feat/<x> & "y": bad <json>\n');
    expect(md).toMatch(/^> shop\.drawings\.json at v1: not a drawings overlay — compared and drawn without it$/m);
    expect(md).toMatch(/^> shop\.layout\.json at feat\/<x> & "y": does not parse \(oops\)/m);
    expect(md).not.toContain('## same');
  });

  it('says so when nothing changed', () => {
    const md = summaryMarkdown({ diffs: compareDiagramSets(before, after, ['same']), files: new Map(), before, after });
    expect(md).toMatch(/\n\nNo diagram changed\.\n$/);
  });
});
