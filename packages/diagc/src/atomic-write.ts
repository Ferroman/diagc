import { randomBytes } from 'node:crypto';
import { rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Write `data` to `target` atomically: stage it in a hidden temp file in the
 * same directory (same filesystem, so `rename` is atomic), then rename over
 * the target. A crash or full disk mid-write leaves the previous content
 * intact instead of a truncated file — these are committed sources, not
 * regenerable build output.
 */
export async function writeFileAtomic(target: string, data: string | Buffer): Promise<void> {
  const tmp = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${randomBytes(6).toString('hex')}.tmp`,
  );
  try {
    await writeFile(tmp, data);
    await rename(tmp, target);
  } catch (e) {
    await unlink(tmp).catch(() => {});
    throw e;
  }
}
