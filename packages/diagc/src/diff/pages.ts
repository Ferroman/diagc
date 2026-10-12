import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { diffMarks } from '@diagc/core/internal';
import { inlineAssets } from '../publish/publish';
import { stampHtml } from '../publish/html';
import type { DiagramDiff, UncomparedDiagram } from './compare';
import type { DiagramSet } from './load';
import { indexHtml } from './overview';
import { summaryMarkdown } from './summary';

export interface DiffPagesOptions {
  outDir: string;
  shellPath: string;
  libraryDir: string;
  before: DiagramSet;
  after: DiagramSet;
  renderPng?: (htmlPath: string, pngPath: string) => Promise<void>;
  /** where `summary.md`'s images will be served from, `{path}` standing for
   * each PNG's path under `outDir` — for a summary posted somewhere else (a PR
   * comment), where the relative links would not resolve */
  imageUrl?: string;
}

export interface DiffPagesResult {
  pages: string[];
  images: string[];
  index: string;
  summary: string;
}

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
  const shown = diffs.filter(
    (d): d is Exclude<DiagramDiff, UncomparedDiagram> =>
      d.status === 'added' || d.status === 'removed' || d.status === 'changed',
  );
  const files = new Map<string, { before?: string; after?: string; png: boolean }>();

  for (const d of shown) {
    const entry: { before?: string; after?: string; png: boolean } = { png: opts.renderPng !== undefined };
    const versions = { before: 'before' in d ? d.before : undefined, after: 'after' in d ? d.after : undefined };
    for (const side of ['before', 'after'] as const) {
      const v = versions[side];
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
          diff: { marks: diffMarks(d.diff, side) },
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

  const index = path.join(opts.outDir, 'index.html');
  await writeFile(index, indexHtml(diffs, files, opts.before, opts.after));
  const summary = path.join(opts.outDir, 'summary.md');
  await writeFile(
    summary,
    summaryMarkdown({ diffs, files, before: opts.before, after: opts.after, imageUrl: opts.imageUrl }),
  );
  return { pages, images, index, summary };
}
