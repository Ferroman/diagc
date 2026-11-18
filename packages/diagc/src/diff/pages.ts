import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { combineDiff, diffMarks, diffMarksByPlane, type DiagramModel, type DiffStatus } from '@diagc/core/internal';
import { inlineAssets, planePictures } from '../publish/publish';
import { stampHtml } from '../publish/html';
import type { ComparedDiagram, DiagramDiff, UncomparedDiagram } from './compare';
import type { DiagramSet } from './load';
import { indexHtml } from './overview';
import { summaryMarkdown } from './summary';

export interface DiffPagesOptions {
  outDir: string;
  shellPath: string;
  libraryDir: string;
  before: DiagramSet;
  after: DiagramSet;
  renderPng?: (htmlPath: string, pngPath: string, look?: { plane?: string }) => Promise<void>;
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

/** One picture of a combined page: the plane it shows, and its file without the extension. */
export interface CombinedPicture {
  /** the plane's name; absent for a model without planes */
  plane?: string;
  rel: string;
}

/** The files written for one diagram, as paths under the output directory without
 * the extension. */
export interface DiagramFiles {
  before?: string;
  after?: string;
  /** both versions in one picture; only a diagram both sides have gets one */
  combined?: string;
  /** the ids the combined page gives the removed relations, in the diff's order */
  removedIds?: string[];
  /** the combined page's pictures, one per plane that shows a change */
  pictures?: CombinedPicture[];
  png: boolean;
}

/** How each plane itself changed, for the combined page's plane chips. */
function planeStatuses(d: ComparedDiagram): Record<string, DiffStatus> {
  const { added, removed, changed } = d.diff.planes;
  return Object.fromEntries([
    ...changed.map((c) => [c.id, 'changed'] as const),
    ...added.map((id) => [id, 'added'] as const),
    ...removed.map((id) => [id, 'removed'] as const),
  ]);
}

/** The pictures to take of a combined model: each plane that shows a change, named
 * as `publish` names a plane's picture. A plane that shows exactly the changes an
 * earlier one does gets none: planes over one structure repeat its changes, and a
 * summary of eight near-identical pictures hides the two that differ. */
function combinedPictures(
  name: string,
  model: DiagramModel,
  marks: Parameters<typeof diffMarksByPlane>[1],
): (CombinedPicture & { id?: string })[] {
  const shown = diffMarksByPlane(model, marks);
  const changes = (id: string) => [...(shown.get(id)?.nodes ?? []), '', ...(shown.get(id)?.relations ?? [])];
  if (model.planes.length === 0) return changes('').length > 1 ? [{ rel: `${name}.diff` }] : [];
  const seen = new Set<string>();
  return planePictures(model).flatMap((picture, i) => {
    const plane = model.planes[i]!;
    const key = changes(plane.id).join('\u0000');
    if (changes(plane.id).length === 1 || seen.has(key)) return [];
    seen.add(key);
    return [{ id: plane.id, plane: plane.name, rel: `${name}.diff${picture.suffix}` }];
  });
}

/**
 * A page per side of every diagram that changed — the same single-file viewer
 * `publish` writes, with the changes outlined — plus a PNG of each when
 * `renderPng` is given. A diagram both sides have also gets a combined page,
 * `<name>.diff.html`: both versions in one picture, with a PNG per plane that
 * shows a change. Then an `index.html` over all of it, and a `summary.md` laid
 * out to paste into an ADR.
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
  const files = new Map<string, DiagramFiles>();

  for (const d of shown) {
    const entry: DiagramFiles = { png: opts.renderPng !== undefined };
    const versions = { before: 'before' in d ? d.before : undefined, after: 'after' in d ? d.after : undefined };
    const inlined: { before?: DiagramModel; after?: DiagramModel } = {};
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
      inlined[side] = model;
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
    if (d.status === 'changed' && inlined.before !== undefined && inlined.after !== undefined) {
      const combined = combineDiff(inlined.before, inlined.after, d.diff);
      const rel = `${d.name}.diff`;
      const pagePath = path.join(opts.outDir, `${rel}.html`);
      await writeFile(
        pagePath,
        stampHtml(shell, {
          model: combined.model,
          ...(d.after.layout !== undefined ? { layout: d.after.layout } : {}),
          ...(d.after.drawings !== undefined ? { drawings: d.after.drawings } : {}),
          diff: { marks: combined.marks, combined: { planes: planeStatuses(d) } },
        }),
      );
      pages.push(pagePath);
      entry.combined = rel;
      entry.removedIds = combined.model.relations.slice(inlined.after.relations.length).map((r) => r.id);
      if (opts.renderPng !== undefined) {
        entry.pictures = [];
        for (const { id, ...picture } of combinedPictures(d.name, combined.model, combined.marks)) {
          const pngPath = path.join(opts.outDir, `${picture.rel}.png`);
          await opts.renderPng(pagePath, pngPath, id !== undefined ? { plane: id } : {});
          images.push(pngPath);
          entry.pictures.push(picture);
        }
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
