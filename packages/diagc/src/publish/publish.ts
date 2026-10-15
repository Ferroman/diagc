import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DiagramModel, LayoutOverlay, Drawings } from '@diagc/core/internal';
import { errMessage, isDrawings, uniqueSlug } from '@diagc/core/internal';
import { classifyAssetRef, rewriteAssetRefs, safeAssetPath } from './assets';
import { buildGallery, type GalleryEntry } from './gallery';
import { discoverDiagrams } from './discover';
import { stampHtml } from './html';
import type { PictureLook } from './snapshot';

export interface PublishOptions {
  srcDir: string;
  artifactsDir: string;
  htmlDir: string;
  staticDir: string;
  shellPath: string;
  libraryDir: string;
  assetsDir: string;
  images: boolean;
  names?: string[];
  /** takes `htmlPath`'s picture into `pngPath`, of the plane and in the look `look` says */
  renderPng?: (htmlPath: string, pngPath: string, look?: PictureLook) => Promise<void>;
  /** the look every picture is taken in, in place of the page's own: `--style`, `--theme` */
  look?: Pick<PictureLook, 'style' | 'theme'>;
  /** an http(s) address for the gallery's header — never put on a diagram page */
  link?: string;
  /** where a warning goes, one line each: `console.warn` by default, so a caller with
   * streams of its own (the CLI's) passes its stderr */
  warn?: (line: string) => void;
}
export interface PublishResult {
  pages: string[];
  images: string[];
  gallery: string;
  /** the diagrams it warned it was skipping, by name */
  skipped: string[];
}

/** The model's display name from its artifact, for a diagram this run did not read. */
async function titleOf(modelPath: string): Promise<string | undefined> {
  try {
    const name = (JSON.parse(await readFile(modelPath, 'utf8')) as { name?: unknown }).name;
    return typeof name === 'string' ? name : undefined;
  } catch {
    return undefined;
  }
}

async function readMaybe(p: string): Promise<Buffer | undefined> {
  try {
    return await readFile(p);
  } catch {
    return undefined;
  }
}

/**
 * The model with every image/shape ref it can read swapped for inline data, so
 * the page stands alone. `cache` is shared across the diagrams of one run
 * (refs are content hashes, so one read serves them all); `label` names the
 * diagram in the warnings for refs it has to leave as they are.
 */
export async function inlineAssets(
  model: DiagramModel,
  opts: Pick<PublishOptions, 'libraryDir' | 'assetsDir' | 'warn'>,
  cache: Map<string, Buffer>,
  label: string,
): Promise<DiagramModel> {
  const warn = opts.warn ?? console.warn;
  // Pre-read every inlinable ref so the rewrite can stay a pure sync function.
  for (const n of model.nodes) {
    for (const ref of [n.image, n.shape]) {
      if (ref === undefined || cache.has(ref)) continue;
      const kind = classifyAssetRef(ref);
      if (kind === 'skip') continue;
      const base = kind === 'library' ? opts.libraryDir : opts.assetsDir;
      const rel =
        kind === 'library'
          ? ref.slice('/library/'.length)
          : kind === 'api-assets'
            ? ref.slice('/api/assets/'.length)
            : ref;
      const filePath = safeAssetPath(base, rel);
      if (filePath === undefined) {
        warn(`publish: refusing out-of-root asset "${ref}" for ${label}; leaving ref as-is.`);
        continue;
      }
      const bytes = await readMaybe(filePath);
      if (bytes !== undefined) cache.set(ref, bytes);
      else warn(`publish: could not read asset "${ref}" for ${label} (looked in ${filePath}); leaving ref as-is.`);
    }
  }
  return rewriteAssetRefs(model, (ref) => cache.get(ref));
}

/** One picture of a diagram: its plane (absent = the first) and what goes between
 * the diagram's name and `.png`. */
export interface PlanePicture {
  plane?: string;
  suffix: string;
}

/**
 * The pictures publish takes of a model, one per plane. The first plane's is
 * `<name>.png`, the picture docs and READMEs already link; each further plane's
 * is `<name>.<slug>.png`, its id made safe for a file name by the one slug rule
 * (`Target VPC` -> `target-vpc`; ids that slug alike get `-2`, `-3`…).
 */
export function planePictures(model: DiagramModel): PlanePicture[] {
  const taken = new Set<string>();
  const others = model.planes.slice(1).map((p) => {
    const slug = uniqueSlug(p.id, taken, 'plane');
    taken.add(slug);
    return { plane: p.id, suffix: `.${slug}` };
  });
  return [{ suffix: '' }, ...others];
}

interface PictureRun {
  render: NonNullable<PublishOptions['renderPng']>;
  look: NonNullable<PublishOptions['look']>;
  staticDir: string;
  /** every diagram discovered, by name: a plane's picture must not take one's file */
  diagrams: ReadonlySet<string>;
  warn: (line: string) => void;
}

/** Takes a diagram's pictures from its page; the files it wrote. */
async function renderPictures(name: string, model: DiagramModel, pagePath: string, run: PictureRun): Promise<string[]> {
  const written: string[] = [];
  for (const picture of planePictures(model)) {
    const file = `${name}${picture.suffix}`;
    if (picture.plane !== undefined && run.diagrams.has(file)) {
      run.warn(
        `publish: no picture of plane "${picture.plane}" of diagram "${name}": ${file}.png is diagram "${file}"'s.`,
      );
      continue;
    }
    const pngPath = path.join(run.staticDir, `${file}.png`);
    await mkdir(path.dirname(pngPath), { recursive: true });
    await run.render(pagePath, pngPath, {
      ...(picture.plane !== undefined ? { plane: picture.plane } : {}),
      ...run.look,
    });
    written.push(pngPath);
  }
  return written;
}

export async function publishDiagrams(opts: PublishOptions): Promise<PublishResult> {
  const warn = opts.warn ?? console.warn;
  const shell = await readFile(opts.shellPath, 'utf8');
  await mkdir(opts.htmlDir, { recursive: true });
  if (opts.images) await mkdir(opts.staticDir, { recursive: true });

  const cache = new Map<string, Buffer>();

  const all = await discoverDiagrams(opts.artifactsDir, opts.srcDir);
  const discovered = new Set(all.map((d) => d.name));
  let chosen = all;
  if (opts.names !== undefined && opts.names.length > 0) {
    const want = new Set(opts.names);
    chosen = all.filter((d) => want.has(d.name));
  }

  const pages: string[] = [];
  const images: string[] = [];
  const skipped: string[] = [];
  // diagram name → the model's display name, for the index cards
  const titles = new Map<string, string>();
  for (const d of chosen) {
    try {
      const modelRaw = JSON.parse(await readFile(d.modelPath, 'utf8')) as DiagramModel;
      titles.set(d.name, modelRaw.name);
      const layout =
        d.layoutPath !== undefined ? (JSON.parse(await readFile(d.layoutPath, 'utf8')) as LayoutOverlay) : undefined;
      // A hand-edited sidecar can be valid JSON and still not be a drawings
      // overlay. Publishing it would stamp shapeless data into a page that has
      // no validator of its own, so it is warned about and dropped — the page
      // still ships, just without ink. (Unparseable JSON keeps its old
      // behaviour: it throws, and the diagram is skipped below.)
      let drawings: Drawings | undefined;
      if (d.drawingsPath !== undefined) {
        const parsed = JSON.parse(await readFile(d.drawingsPath, 'utf8')) as unknown;
        if (isDrawings(parsed)) drawings = parsed;
        else
          warn(
            `publish: ignoring malformed drawings sidecar for diagram "${d.name}" (${d.drawingsPath}); the page ships without ink.`,
          );
      }

      const inlined = await inlineAssets(modelRaw, opts, cache, `diagram "${d.name}"`);
      const pagePath = path.join(opts.htmlDir, `${d.name}.html`);
      await mkdir(path.dirname(pagePath), { recursive: true });
      await writeFile(pagePath, stampHtml(shell, { model: inlined, layout, drawings }));
      pages.push(pagePath);

      if (opts.images && opts.renderPng !== undefined) {
        const run = {
          render: opts.renderPng,
          look: opts.look ?? {},
          staticDir: opts.staticDir,
          diagrams: discovered,
          warn,
        };
        images.push(...(await renderPictures(d.name, modelRaw, pagePath, run)));
      }
    } catch (e) {
      warn(`publish: skipping diagram "${d.name}": ${errMessage(e)}`);
      skipped.push(d.name);
      continue;
    }
  }

  // A diagram this run published gets a card for the page it wrote now and a thumbnail
  // for the image it rendered now: what an earlier run left must not stand in for it
  // (the Pages workflow counts thumbnails to catch a run with no usable Chrome), and a
  // diagram that failed gets no card. A run scoped by name leaves the other pages in
  // place, so the index keeps those diagrams as they are on disk. A page whose diagram
  // is not discovered (its artifact is gone) gets no card.
  const written = new Set(pages);
  const rendered = new Set(images);
  const inRun = new Set(chosen.map((d) => d.name));
  const entries: GalleryEntry[] = [];
  for (const d of all) {
    const pagePath = path.join(opts.htmlDir, `${d.name}.html`);
    const pngPath = path.join(opts.staticDir, `${d.name}.png`);
    const thisRun = inRun.has(d.name);
    if (!(thisRun ? written.has(pagePath) : existsSync(pagePath))) continue;
    entries.push({
      name: d.name,
      title: titles.get(d.name) ?? (await titleOf(d.modelPath)) ?? d.name,
      hasImage: thisRun ? rendered.has(pngPath) : existsSync(pngPath),
    });
  }
  const galleryPath = path.join(opts.htmlDir, 'index.html');
  await writeFile(galleryPath, buildGallery(entries, opts.link !== undefined ? { link: opts.link } : {}));

  return { pages, images, gallery: galleryPath, skipped };
}
