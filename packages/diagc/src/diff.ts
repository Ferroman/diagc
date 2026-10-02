import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import {
  diffMarks,
  diffModels,
  errMessage,
  isDrawings,
  isEmptyDiff,
  type DiagramModel,
  type Drawings,
  type LayoutOverlay,
  type ModelDiff,
} from '@diagc/core';
import { loadModel } from './compile';
import { inlineAssets } from './publish/publish';
import { stampHtml } from './publish/html';

/** One diagram as a version of the repo had it: the compiled model plus the
 * sidecars a picture of it needs. */
export interface DiagramVersion {
  model: DiagramModel;
  layout?: LayoutOverlay;
  drawings?: Drawings;
}

/** Every diagram under one `.diagrams/` directory, by name (its path under
 * `src/` without the extension — the names `publish` uses). */
export interface DiagramSet {
  /** shown in the summary and on the pictures: a ref, or "working tree" */
  label: string;
  diagramsDir: string;
  versions: Map<string, DiagramVersion>;
  /** diagrams whose source did not compile at this version, with why */
  errors: Map<string, string>;
}

export type DiagramDiffStatus = 'added' | 'removed' | 'changed' | 'unchanged' | 'error';

export interface DiagramDiff {
  name: string;
  status: DiagramDiffStatus;
  before?: DiagramVersion;
  after?: DiagramVersion;
  /** against an empty model for an added or removed diagram, so the marks
   * cover the whole picture the same way */
  diff?: ModelDiff;
  error?: string;
}

const EMPTY: DiagramModel = { version: 1, id: '', name: '', nodes: [], containment: [], relations: [], layers: [], planes: [] };

async function readJson(file: string): Promise<unknown> {
  return existsSync(file) ? (JSON.parse(await readFile(file, 'utf8')) as unknown) : undefined;
}

/** Compile every source under `diagramsDir/src` in memory — nothing is written. */
export async function loadDiagramSet(label: string, diagramsDir: string, coreEntry?: string): Promise<DiagramSet> {
  const srcDir = path.join(diagramsDir, 'src');
  const versions = new Map<string, DiagramVersion>();
  const errors = new Map<string, string>();
  const files = existsSync(srcDir) ? await fg('**/*.diagram.{ts,json}', { cwd: srcDir }) : [];
  for (const rel of files.sort()) {
    const name = rel.replace(/\.diagram\.(ts|json)$/, '');
    try {
      const model = await loadModel(path.join(srcDir, rel), { rootDir: srcDir, ...(coreEntry !== undefined ? { coreEntry } : {}) });
      const layout = (await readJson(path.join(srcDir, `${name}.layout.json`))) as LayoutOverlay | undefined;
      const drawings = await readJson(path.join(srcDir, `${name}.drawings.json`));
      versions.set(name, {
        model,
        ...(layout !== undefined ? { layout } : {}),
        ...(drawings !== undefined && isDrawings(drawings) ? { drawings } : {}),
      });
    } catch (e) {
      errors.set(name, errMessage(e));
    }
  }
  return { label, diagramsDir, versions, errors };
}

/** Pair the two sets by name. `names` narrows the result to those diagrams. */
export function compareDiagramSets(before: DiagramSet, after: DiagramSet, names: readonly string[] = []): DiagramDiff[] {
  const all = new Set([...before.versions.keys(), ...before.errors.keys(), ...after.versions.keys(), ...after.errors.keys()]);
  const wanted = names.length > 0 ? names.filter((n) => all.has(n)) : [...all].sort();
  return wanted.map((name): DiagramDiff => {
    const b = before.versions.get(name);
    const a = after.versions.get(name);
    const err = after.errors.get(name) ?? before.errors.get(name);
    if (err !== undefined) {
      const at = after.errors.has(name) ? after.label : before.label;
      return { name, status: 'error', error: `does not compile at ${at}: ${err}` };
    }
    if (b === undefined) return { name, status: 'added', after: a!, diff: diffModels(EMPTY, a!.model) };
    if (a === undefined) return { name, status: 'removed', before: b, diff: diffModels(b.model, EMPTY) };
    const diff = diffModels(b.model, a.model);
    return { name, status: isEmptyDiff(diff) ? 'unchanged' : 'changed', before: b, after: a, diff };
  });
}

function nameIn(m: DiagramModel | undefined, id: string): string {
  const n = m?.nodes.find((x) => x.id === id);
  return n === undefined || n.name === '' ? id : n.name;
}

/** The change list for one diagram, one line each, `+`/`-`/`~` first. */
export function describeDiff(d: DiagramDiff): string[] {
  if (d.diff === undefined) return [];
  if (d.status === 'added') return [`+ new diagram: ${d.after!.model.name} (${d.diff.nodes.added.length} nodes, ${d.diff.relations.added.length} relations)`];
  if (d.status === 'removed') return [`- diagram removed: ${d.before!.model.name}`];
  const before = d.before?.model;
  const after = d.after?.model;
  const rel = (m: DiagramModel | undefined, r: { from: string; to: string; kind: string; label?: string }) =>
    `${nameIn(m, r.from)} -> ${nameIn(m, r.to)} (${r.kind}${r.label !== undefined && r.label !== '' ? `: ${r.label}` : ''})`;
  const x = d.diff;
  return [
    ...x.nodes.added.map((n) => `+ ${n.name !== '' ? n.name : n.id}${n.type !== undefined ? ` [${n.type}]` : ''}`),
    ...x.nodes.removed.map((n) => `- ${n.name !== '' ? n.name : n.id}${n.type !== undefined ? ` [${n.type}]` : ''}`),
    ...x.nodes.changed.map((n) => {
      // A rename reads better as the two names than as the word "name".
      const was = nameIn(before, n.id);
      const now = nameIn(after, n.id);
      const rest = n.fields.filter((f) => f !== 'name');
      const head = n.fields.includes('name') ? `${was} -> ${now} (renamed)` : now;
      return `~ ${head}${rest.length > 0 ? `: ${rest.join(', ')}` : ''}`;
    }),
    ...x.relations.added.map((r) => `+ ${rel(after, r)}`),
    ...x.relations.removed.map((r) => `- ${rel(before, r)}`),
    ...x.relations.changed.map((r) => {
      const now = after?.relations.find((y) => y.id === r.after);
      return `~ ${now !== undefined ? rel(after, now) : r.after}: ${r.fields.join(', ')}`;
    }),
    ...x.layers.added.map((id) => `+ layer ${id}`),
    ...x.layers.removed.map((id) => `- layer ${id}`),
    ...x.planes.added.map((id) => `+ plane ${id}`),
    ...x.planes.removed.map((id) => `- plane ${id}`),
  ];
}

export function formatDiffSummary(diffs: readonly DiagramDiff[], from: string, to: string): string {
  const lines = [`diagc diff ${from} -> ${to}`];
  for (const d of diffs) {
    if (d.status === 'unchanged') continue;
    if (d.status === 'error') {
      lines.push(`! ${d.name}: ${d.error}`);
      continue;
    }
    lines.push(`${d.name}:`);
    for (const l of describeDiff(d)) lines.push(`  ${l}`);
  }
  const changed = diffs.filter((d) => d.status !== 'unchanged' && d.status !== 'error').length;
  const same = diffs.filter((d) => d.status === 'unchanged').length;
  lines.push(changed === 0 ? `no diagram changed (${same} compared)` : `${changed} diagram(s) changed, ${same} unchanged`);
  return lines.join('\n');
}

export interface DiffPagesOptions {
  outDir: string;
  shellPath: string;
  libraryDir: string;
  before: DiagramSet;
  after: DiagramSet;
  renderPng?: (htmlPath: string, pngPath: string) => Promise<void>;
}

export interface DiffPagesResult {
  pages: string[];
  images: string[];
  index: string;
  summary: string;
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * A page per side of every diagram that changed — the same single-file viewer
 * `publish` writes, with the changes outlined — plus a PNG of each when
 * `renderPng` is given, an `index.html` showing the two sides next to each
 * other, and a `summary.md` laid out to paste into an ADR.
 */
export async function writeDiffPages(diffs: readonly DiagramDiff[], opts: DiffPagesOptions): Promise<DiffPagesResult> {
  const shell = await readFile(opts.shellPath, 'utf8');
  await mkdir(opts.outDir, { recursive: true });
  const caches = { before: new Map<string, Buffer>(), after: new Map<string, Buffer>() };
  const pages: string[] = [];
  const images: string[] = [];
  const shown = diffs.filter((d) => d.status === 'added' || d.status === 'removed' || d.status === 'changed');
  const files = new Map<string, { before?: string; after?: string; png: boolean }>();

  for (const d of shown) {
    const entry: { before?: string; after?: string; png: boolean } = { png: opts.renderPng !== undefined };
    for (const side of ['before', 'after'] as const) {
      const v = d[side];
      if (v === undefined) continue;
      const set = opts[side];
      const model = await inlineAssets(
        v.model,
        { libraryDir: opts.libraryDir, assetsDir: path.join(set.diagramsDir, 'src', 'assets') },
        caches[side],
        `diagram "${d.name}" at ${set.label}`,
      );
      const rel = `${d.name}.${side}`;
      const pagePath = path.join(opts.outDir, `${rel}.html`);
      await mkdir(path.dirname(pagePath), { recursive: true });
      await writeFile(
        pagePath,
        stampHtml(shell, {
          model,
          ...(v.layout !== undefined ? { layout: v.layout } : {}),
          ...(v.drawings !== undefined ? { drawings: v.drawings } : {}),
          diff: { marks: diffMarks(d.diff!, side) },
        }),
      );
      pages.push(pagePath);
      entry[side] = rel;
      if (opts.renderPng !== undefined) {
        const pngPath = path.join(opts.outDir, `${rel}.png`);
        await opts.renderPng(pagePath, pngPath);
        images.push(pngPath);
      }
    }
    files.set(d.name, entry);
  }

  const from = opts.before.label;
  const to = opts.after.label;
  const index = path.join(opts.outDir, 'index.html');
  await writeFile(index, indexHtml(shown, files, from, to));
  const summary = path.join(opts.outDir, 'summary.md');
  await writeFile(summary, summaryMarkdown(diffs, files, from, to));
  return { pages, images, index, summary };
}

// The frames load each page unfolded (`?export=1`, the PNG's own mode): side by
// side, the whole picture is the point. The headings link the interactive pages.
function indexHtml(shown: readonly DiagramDiff[], files: Map<string, { before?: string; after?: string }>, from: string, to: string): string {
  const side = (rel: string | undefined, label: string) =>
    rel === undefined
      ? `<div class="side empty"><h3>${escapeHtml(label)}</h3><p>not present</p></div>`
      : `<div class="side"><h3><a href="${escapeHtml(rel)}.html">${escapeHtml(label)}</a></h3><iframe src="${escapeHtml(rel)}.html?export=1" title="${escapeHtml(label)}"></iframe></div>`;
  const sections = shown.map((d) => {
    const f = files.get(d.name) ?? {};
    const list = describeDiff(d).map((l) => `<li class="${l[0] === '+' ? 'add' : l[0] === '-' ? 'del' : 'chg'}">${escapeHtml(l)}</li>`).join('');
    return `<section><h2>${escapeHtml(d.name)}</h2><ul>${list}</ul><div class="pair">${side(f.before, `Before · ${from}`)}${side(f.after, `After · ${to}`)}</div></section>`;
  });
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Diagram diff ${escapeHtml(from)} → ${escapeHtml(to)}</title>
<style>
  body { font: 14px/1.45 system-ui, sans-serif; margin: 0 auto; padding: 16px 24px 48px; max-width: 1800px; color: #1f2328; background: #fff; }
  h1 { font-size: 20px; } h2 { font-size: 16px; margin: 32px 0 6px; } h3 { font-size: 13px; margin: 0 0 6px; color: #57606a; }
  ul { margin: 0 0 12px; padding-left: 18px; font-family: ui-monospace, monospace; font-size: 12.5px; }
  li.add { color: #16a34a; } li.del { color: #dc2626; } li.chg { color: #b45309; }
  .key span { display: inline-block; margin-right: 14px; } .key i { display: inline-block; width: 12px; height: 12px; border: 3px solid; border-radius: 3px; vertical-align: -2px; margin-right: 4px; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .side iframe { width: 100%; height: 70vh; border: 1px solid #d0d7de; border-radius: 6px; }
  .side.empty p { height: 70vh; margin: 0; display: grid; place-items: center; border: 1px dashed #d0d7de; border-radius: 6px; color: #8c959f; }
  @media (max-width: 900px) { .pair { grid-template-columns: 1fr; } }
</style></head><body>
<h1>Diagram diff · ${escapeHtml(from)} → ${escapeHtml(to)}</h1>
<p class="key"><span><i style="border-color:#16a34a"></i>added</span><span><i style="border-color:#dc2626;border-style:dashed"></i>removed</span><span><i style="border-color:#d97706"></i>changed</span><span><i style="border-color:#d97706;border-style:dashed"></i>holds a change (folded box, on the linked pages)</span></p>
${sections.length > 0 ? sections.join('\n') : '<p>No diagram changed.</p>'}
</body></html>
`;
}

function summaryMarkdown(diffs: readonly DiagramDiff[], files: Map<string, { before?: string; after?: string; png: boolean }>, from: string, to: string): string {
  const out = [`# Diagram changes: ${from} → ${to}`, ''];
  const shown = diffs.filter((d) => d.status !== 'unchanged');
  if (shown.length === 0) out.push('No diagram changed.', '');
  for (const d of shown) {
    out.push(`## ${d.name}`, '');
    if (d.status === 'error') {
      out.push(`Not compared: ${d.error}`, '');
      continue;
    }
    const f = files.get(d.name);
    const cell = (rel: string | undefined, label: string) =>
      rel === undefined ? '—' : f?.png === true ? `![${label}](${rel}.png)` : `[${label}](${rel}.html)`;
    out.push(`| Before (${from}) | After (${to}) |`, '| --- | --- |', `| ${cell(f?.before, 'before')} | ${cell(f?.after, 'after')} |`, '');
    for (const l of describeDiff(d)) out.push(`- \`${l[0]}\` ${l.slice(2)}`);
    out.push('');
  }
  return out.join('\n');
}
