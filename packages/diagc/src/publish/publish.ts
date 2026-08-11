import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DiagramModel, LayoutOverlay } from '@diagramming/core';
import { errMessage } from '@diagramming/core';
import { classifyAssetRef, rewriteAssetRefs, safeAssetPath } from './assets';
import { buildGallery } from './gallery';
import { discoverDiagrams } from './discover';
import { stampHtml } from './html';

export interface PublishOptions {
  srcDir: string; artifactsDir: string; htmlDir: string; staticDir: string; shellPath: string;
  libraryDir: string; assetsDir: string; images: boolean; names?: string[];
  renderPng?: (htmlPath: string, pngPath: string) => Promise<void>;
}
export interface PublishResult { pages: string[]; images: string[]; gallery: string }

async function readMaybe(p: string): Promise<Buffer | undefined> {
  try { return await readFile(p); } catch { return undefined; }
}

export async function publishDiagrams(opts: PublishOptions): Promise<PublishResult> {
  const shell = await readFile(opts.shellPath, 'utf8');
  await mkdir(opts.htmlDir, { recursive: true });
  if (opts.images) await mkdir(opts.staticDir, { recursive: true });

  const cache = new Map<string, Buffer>();
  const resolveAsset = (ref: string): Buffer | undefined => cache.get(ref);

  let all = await discoverDiagrams(opts.artifactsDir, opts.srcDir);
  if (opts.names !== undefined && opts.names.length > 0) {
    const want = new Set(opts.names);
    all = all.filter((d) => want.has(d.name));
  }

  const pages: string[] = [];
  const images: string[] = [];
  for (const d of all) {
    try {
      const modelRaw = JSON.parse(await readFile(d.modelPath, 'utf8')) as DiagramModel;
      const layout = d.layoutPath !== undefined
        ? (JSON.parse(await readFile(d.layoutPath, 'utf8')) as LayoutOverlay)
        : undefined;

      // Pre-read every inlinable ref so the rewrite can stay a pure sync function.
      for (const n of modelRaw.nodes) {
        for (const ref of [n.image, n.shape]) {
          if (ref === undefined || cache.has(ref)) continue;
          const kind = classifyAssetRef(ref);
          if (kind === 'skip') continue;
          const base = kind === 'library' ? opts.libraryDir : opts.assetsDir;
          const rel = kind === 'library' ? ref.slice('/library/'.length)
            : kind === 'api-assets' ? ref.slice('/api/assets/'.length)
            : ref;
          const filePath = safeAssetPath(base, rel);
          if (filePath === undefined) {
            console.warn(`publish: refusing out-of-root asset "${ref}" for diagram "${d.name}"; leaving ref as-is.`);
            continue;
          }
          const bytes = await readMaybe(filePath);
          if (bytes !== undefined) cache.set(ref, bytes);
          else console.warn(`publish: could not read asset "${ref}" for diagram "${d.name}" (looked in ${filePath}); leaving ref as-is.`);
        }
      }

      const inlined = rewriteAssetRefs(modelRaw, resolveAsset);
      const pagePath = path.join(opts.htmlDir, `${d.name}.html`);
      await mkdir(path.dirname(pagePath), { recursive: true });
      await writeFile(pagePath, stampHtml(shell, { model: inlined, layout }));
      pages.push(pagePath);

      if (opts.images && opts.renderPng !== undefined) {
        const pngPath = path.join(opts.staticDir, `${d.name}.png`);
        await mkdir(path.dirname(pngPath), { recursive: true });
        await opts.renderPng(pagePath, pngPath);
        images.push(pngPath);
      }
    } catch (e) {
      console.warn(`publish: skipping diagram "${d.name}": ${errMessage(e)}`);
      continue;
    }
  }

  // Only diagrams whose page was actually written belong in the gallery — a
  // source that failed before its HTML wrote would otherwise get a dead link.
  const written = new Set(pages);
  const galleryPath = path.join(opts.htmlDir, 'index.html');
  await writeFile(galleryPath, buildGallery(all
    .filter((d) => written.has(path.join(opts.htmlDir, `${d.name}.html`)))
    .map((d) => ({
      name: d.name, hasImage: images.includes(path.join(opts.staticDir, `${d.name}.png`)),
    }))));

  return { pages, images, gallery: galleryPath };
}
