import { createHash } from 'node:crypto';
import { access, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { IMAGE_REF } from '@diagc/core/internal';
import { writeFileAtomic } from '../atomic-write';
import { refuse, type HandlerResult } from './result';

// Keys here must stay in sync with IMAGE_REF's extension group (@diagc/core) —
// an extension accepted by the regex but missing here would 404 on read.
const ASSET_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/svg+xml': 'svg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
const ASSET_TYPE: Record<string, string> = Object.fromEntries(Object.entries(ASSET_EXT).map(([t, e]) => [e, t]));
export const MAX_ASSET_BYTES = 5 * 1024 * 1024;

/** store image bytes under their content hash; identical drops dedupe to one file */
export async function saveAsset(diagramsDir: string, contentType: string, bytes: Buffer): Promise<HandlerResult> {
  const ext = ASSET_EXT[contentType.split(';')[0]?.trim() ?? ''];
  if (ext === undefined) {
    return refuse(400, `Unsupported image type '${contentType}'`);
  }
  if (bytes.length === 0 || bytes.length > MAX_ASSET_BYTES) {
    return refuse(400, `Image must be 1 byte to ${MAX_ASSET_BYTES / 1024 / 1024} MB`);
  }
  const name = `${createHash('sha256').update(bytes).digest('hex').slice(0, 12)}.${ext}`;
  const target = path.join(diagramsDir, 'assets', name);
  await mkdir(path.dirname(target), { recursive: true });
  try {
    await access(target); // already stored — content hash guarantees same bytes
  } catch {
    await writeFileAtomic(target, bytes);
  }
  return { status: 200, body: { name } };
}

export async function readAsset(
  diagramsDir: string,
  name: string,
): Promise<HandlerResult & { bytes?: Buffer; contentType?: string }> {
  if (!IMAGE_REF.test(name)) return refuse(400, `Unsafe asset name '${name}'`);
  try {
    const bytes = await readFile(path.join(diagramsDir, 'assets', name));
    const ext = name.split('.').at(-1) ?? '';
    return {
      status: 200,
      body: null,
      bytes,
      contentType: ASSET_TYPE[ext === 'jpeg' ? 'jpg' : ext] ?? 'application/octet-stream',
    };
  } catch {
    return refuse(404, `No asset '${name}'`);
  }
}
