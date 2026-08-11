import path from 'node:path';
import type { DiagramModel, DiagramNode } from '@diagramming/core';

const MIME: Record<string, string> = {
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
};

export function dataUri(bytes: Buffer, ext: string): string {
  const mime = MIME[ext.toLowerCase()] ?? 'application/octet-stream';
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

/**
 * Classify an asset ref so publish-time code knows whether/where to read it from disk.
 * - `library`: bundled shape, lives under the library dir (`/library/<rest>`).
 * - `api-assets`: uploaded asset served via the studio API (`/api/assets/<rest>`).
 * - `bare`: uploaded asset stored as a bare content-hash filename (no leading slash,
 *   not a URL, not already a data: URI) — the studio's on-disk model shape.
 * - `skip`: anything else (external http(s) URL, data: URI, or an unrecognized
 *   absolute path) — left untouched.
 */
export type AssetRefKind = 'library' | 'api-assets' | 'bare' | 'skip';

export function classifyAssetRef(ref: string): AssetRefKind {
  if (ref.startsWith('/library/')) return 'library';
  if (ref.startsWith('/api/assets/')) return 'api-assets';
  if (!ref.startsWith('/') && !/^https?:/.test(ref) && !ref.startsWith('data:')) return 'bare';
  return 'skip';
}

/**
 * Resolve `rel` under `base`, or `undefined` if it would escape `base` via `..`
 * (path traversal). Guards the publish step so a crafted asset ref such as
 * `/library/../../etc/passwd` can never read a file outside the intended root.
 */
export function safeAssetPath(base: string, rel: string): string | undefined {
  const root = path.resolve(base);
  const resolved = path.resolve(root, rel);
  return resolved.startsWith(root + path.sep) ? resolved : undefined;
}

function inlineRef(ref: string | undefined, resolve: (ref: string) => Buffer | undefined): string | undefined {
  if (ref === undefined || classifyAssetRef(ref) === 'skip') return ref;
  const bytes = resolve(ref);
  if (bytes === undefined) return ref;
  const ext = ref.split('.').pop()?.split(/[?#]/)[0] ?? '';
  return dataUri(bytes, ext);
}

export function rewriteAssetRefs(
  model: DiagramModel,
  resolve: (ref: string) => Buffer | undefined,
): DiagramModel {
  const nodes: DiagramNode[] = model.nodes.map((n) => {
    const image = inlineRef(n.image, resolve);
    const shape = inlineRef(n.shape, resolve);
    if (image === n.image && shape === n.shape) return n;
    return { ...n, ...(image !== undefined ? { image } : {}), ...(shape !== undefined ? { shape } : {}) };
  });
  return { ...model, nodes };
}
