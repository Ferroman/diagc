import { getHost } from '../host';

export const MAX_IMAGE_EDGE = 240;

/** POST the raw file to the assets endpoint; resolves the content-hash name */
export async function uploadAsset(file: File): Promise<string> {
  const res = await getHost().apiFetch('/api/assets', {
    method: 'POST',
    headers: { 'content-type': file.type },
    body: file,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { issues?: { message: string }[] } | null;
    throw new Error(body?.issues?.[0]?.message ?? `Image upload failed (${res.status})`);
  }
  return ((await res.json()) as { name: string }).name;
}

export const MIN_IMAGE_EDGE = 40;

/** Natural dimensions with the long edge clamped into [MIN_IMAGE_EDGE, MAX_IMAGE_EDGE];
 * null when the environment can't decode the file (jsdom has no createImageBitmap;
 * Chromium can't decode SVG blobs with it) — the caller falls back to the default.
 * createImageBitmap over an Image element: no object URLs to revoke, and it fails
 * fast instead of hanging in DOMs that never fire load/error events. */
export async function readImageSize(file: File): Promise<{ w: number; h: number } | null> {
  if (typeof createImageBitmap !== 'function') return null;
  try {
    const bmp = await createImageBitmap(file);
    const size = { w: bmp.width, h: bmp.height };
    bmp.close();
    if (size.w <= 0 || size.h <= 0) return null;
    const long = Math.max(size.w, size.h);
    const scale = long > MAX_IMAGE_EDGE ? MAX_IMAGE_EDGE / long : long < MIN_IMAGE_EDGE ? MIN_IMAGE_EDGE / long : 1;
    return { w: Math.max(1, Math.round(size.w * scale)), h: Math.max(1, Math.round(size.h * scale)) };
  } catch {
    return null;
  }
}
