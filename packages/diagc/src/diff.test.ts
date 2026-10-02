import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { DiagramModel } from '@diagc/core';
import { compareDiagramSets, describeDiff, formatDiffSummary, loadDiagramSet, writeDiffPages, type DiagramSet } from './diff';
import { checkoutDiagrams, type CheckedOutRef } from './git-ref';
import { DG_DATA_SENTINEL } from './publish/html';

function model(id: string, parts: Partial<DiagramModel>): DiagramModel {
  return { version: 1, id, name: id, nodes: [], containment: [], relations: [], layers: [], planes: [], ...parts };
}

const v1 = model('shop', {
  nodes: [
    { id: 'web', name: 'Web', type: 'service' },
    { id: 'api', name: 'API', type: 'service' },
    { id: 'legacy', name: 'Legacy', type: 'service' },
  ],
  relations: [
    { id: 'web->api#0', from: 'web', to: 'api', kind: 'sync' },
    { id: 'web->legacy#0', from: 'web', to: 'legacy', kind: 'sync' },
  ],
});
const v2 = model('shop', {
  nodes: [
    { id: 'web', name: 'Web', type: 'service' },
    { id: 'api', name: 'API gateway', type: 'service' },
    { id: 'db', name: 'Orders DB', type: 'database' },
  ],
  relations: [
    { id: 'web->api#0', from: 'web', to: 'api', kind: 'sync', label: 'HTTPS' },
    { id: 'api->db#0', from: 'api', to: 'db', kind: 'reads' },
  ],
});
const gone = model('gone', { nodes: [{ id: 'x', name: 'X' }] });
const fresh = model('fresh', { nodes: [{ id: 'y', name: 'Y' }] });

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args], { cwd, stdio: 'pipe' });
const put = (repo: string, rel: string, data: unknown) => {
  const file = path.join(repo, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data));
};

// v1: shop + gone; v2: shop changed, gone deleted, fresh (in a folder) added.
let repo: string;
beforeAll(() => {
  repo = mkdtempSync(path.join(tmpdir(), 'diagc-diff-repo-'));
  git(repo, 'init', '-q');
  put(repo, 'README.md', 'no diagrams yet\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-qm', 'empty');
  git(repo, 'tag', 'v0');
  put(repo, '.diagrams/src/shop.diagram.json', v1);
  put(repo, '.diagrams/src/shop.layout.json', { version: 1, planes: {} });
  put(repo, '.diagrams/src/gone.diagram.json', gone);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-qm', 'v1');
  git(repo, 'tag', 'v1');
  put(repo, '.diagrams/src/shop.diagram.json', v2);
  git(repo, 'rm', '-q', '.diagrams/src/gone.diagram.json');
  put(repo, '.diagrams/src/new/fresh.diagram.json', fresh);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-qm', 'v2');
  git(repo, 'tag', 'v2');
});

const open: CheckedOutRef[] = [];
afterEach(async () => {
  for (const c of open.splice(0)) await c.cleanup();
});
async function setAt(ref: string, cwd = repo): Promise<DiagramSet> {
  const c = await checkoutDiagrams(ref, cwd);
  open.push(c);
  return loadDiagramSet(ref, c.diagramsDir);
}

describe('checkoutDiagrams', () => {
  it("extracts the ref's .diagrams tree and removes it on cleanup", async () => {
    const c = await checkoutDiagrams('v1', repo);
    expect(JSON.parse(readFileSync(path.join(c.diagramsDir, 'src/shop.diagram.json'), 'utf8'))).toEqual(v1);
    expect(existsSync(path.join(c.diagramsDir, 'src/new'))).toBe(false);
    await c.cleanup();
    expect(existsSync(c.diagramsDir)).toBe(false);
  });

  it('finds .diagrams relative to a subdirectory of the repository', async () => {
    const sub = path.join(repo, 'pkg');
    mkdirSync(sub, { recursive: true });
    const c = await checkoutDiagrams('v1', sub, '../.diagrams');
    open.push(c);
    expect(existsSync(path.join(c.diagramsDir, 'src/shop.diagram.json'))).toBe(true);
  });

  it('gives an empty set for a ref from before there were diagrams', async () => {
    const set = await setAt('v0');
    expect(set.versions.size).toBe(0);
  });

  it('refuses a ref that does not exist', async () => {
    await expect(checkoutDiagrams('v9', repo)).rejects.toThrow("'v9' is not a commit, tag or branch");
  });
});

describe('compareDiagramSets', () => {
  it('pairs diagrams by name: changed, removed, added', async () => {
    const diffs = compareDiagramSets(await setAt('v1'), await setAt('v2'));
    expect(diffs.map((d) => [d.name, d.status])).toEqual([
      ['gone', 'removed'],
      ['new/fresh', 'added'],
      ['shop', 'changed'],
    ]);
    expect(diffs.find((d) => d.name === 'shop')?.before?.layout).toEqual({ version: 1, planes: {} });
  });

  it('narrows to the named diagrams', async () => {
    const diffs = compareDiagramSets(await setAt('v1'), await setAt('v2'), ['shop', 'nope']);
    expect(diffs.map((d) => d.name)).toEqual(['shop']);
  });

  it("reports a diagram that does not compile on one side instead of diffing it", async () => {
    const broken: DiagramSet = { label: 'wip', diagramsDir: '', versions: new Map(), errors: new Map([['shop', 'bad json']]) };
    const [d] = compareDiagramSets(await setAt('v1'), broken, ['shop']);
    expect(d).toMatchObject({ status: 'error', error: 'does not compile at wip: bad json' });
  });
});

describe('describeDiff / formatDiffSummary', () => {
  it('lists the changes by name, renames as old -> new', async () => {
    const diffs = compareDiagramSets(await setAt('v1'), await setAt('v2'));
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
    const diffs = compareDiagramSets(await setAt('v2'), await setAt('v2'));
    expect(formatDiffSummary(diffs, 'v2', 'v2')).toMatch(/no diagram changed \(2 compared\)$/);
  });
});

describe('writeDiffPages', () => {
  it('writes a marked page (and image) per side, the side-by-side index and the ADR summary', async () => {
    const before = await setAt('v1');
    const after = await setAt('v2');
    const diffs = compareDiagramSets(before, after);
    const out = mkdtempSync(path.join(tmpdir(), 'diagc-diff-out-'));
    const shellPath = path.join(out, 'shell.html');
    writeFileSync(shellPath, `<!doctype html><script id="dg-data" type="application/json">${DG_DATA_SENTINEL}</script>`);
    const rendered: string[] = [];
    const res = await writeDiffPages(diffs, {
      outDir: path.join(out, 'diff'),
      shellPath,
      libraryDir: out,
      before,
      after,
      renderPng: async (html, png) => {
        rendered.push(path.relative(out, html));
        writeFileSync(png, '');
      },
    });
    expect(res.pages.map((p) => path.relative(out, p)).sort()).toEqual([
      'diff/gone.before.html',
      'diff/new/fresh.after.html',
      'diff/shop.after.html',
      'diff/shop.before.html',
    ]);
    expect(rendered.sort()).toEqual(res.pages.map((p) => path.relative(out, p)).sort());

    const stamped = (rel: string) => {
      const html = readFileSync(path.join(out, 'diff', rel), 'utf8');
      return JSON.parse(html.slice(html.indexOf('>', html.indexOf('id="dg-data"')) + 1, html.lastIndexOf('</script>'))) as {
        diff: { marks: unknown };
        layout?: unknown;
      };
    };
    expect(stamped('shop.before.html').diff.marks).toEqual({
      nodes: { api: 'changed', legacy: 'removed' },
      relations: { 'web->api#0': 'changed', 'web->legacy#0': 'removed' },
    });
    expect(stamped('shop.after.html').diff.marks).toEqual({
      nodes: { api: 'changed', db: 'added' },
      relations: { 'web->api#0': 'changed', 'api->db#0': 'added' },
    });
    expect(stamped('shop.before.html').layout).toEqual({ version: 1, planes: {} });

    const index = readFileSync(res.index, 'utf8');
    expect(index).toContain('<iframe src="shop.before.html?export=1"');
    expect(index).toContain('<iframe src="new/fresh.after.html?export=1"');
    expect(index).toContain('<li class="add">+ Orders DB [database]</li>');
    const summary = readFileSync(res.summary, 'utf8');
    expect(summary).toContain('| ![before](shop.before.png) | ![after](shop.after.png) |');
    expect(summary).toContain('| ![before](gone.before.png) | — |');
    expect(summary).toContain('- `~` API -> API gateway (renamed)');
  });

  it('points the summary images at --image-url when given', async () => {
    const before = await setAt('v1');
    const after = await setAt('v2');
    const out = mkdtempSync(path.join(tmpdir(), 'diagc-diff-out-'));
    const shellPath = path.join(out, 'shell.html');
    writeFileSync(shellPath, DG_DATA_SENTINEL);
    const res = await writeDiffPages(compareDiagramSets(before, after, ['shop']), {
      outDir: out,
      shellPath,
      libraryDir: out,
      before,
      after,
      renderPng: async (_html, png) => writeFileSync(png, ''),
      imageUrl: 'https://host/pr-7/{path}?raw=true',
    });
    expect(readFileSync(res.summary, 'utf8')).toContain(
      '| ![before](https://host/pr-7/shop.before.png?raw=true) | ![after](https://host/pr-7/shop.after.png?raw=true) |',
    );
  });

  it('links the pages instead of images when no PNGs were rendered', async () => {
    const before = await setAt('v1');
    const after = await setAt('v2');
    const out = mkdtempSync(path.join(tmpdir(), 'diagc-diff-out-'));
    const shellPath = path.join(out, 'shell.html');
    writeFileSync(shellPath, DG_DATA_SENTINEL);
    const res = await writeDiffPages(compareDiagramSets(before, after, ['shop']), { outDir: out, shellPath, libraryDir: out, before, after });
    expect(res.images).toEqual([]);
    expect(readFileSync(res.summary, 'utf8')).toContain('| [before](shop.before.html) | [after](shop.after.html) |');
  });
});
