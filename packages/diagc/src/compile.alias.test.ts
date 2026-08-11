import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { compileFile } from './compile';

const coreEntry = fileURLToPath(new URL('../../core/src/index.ts', import.meta.url));
let tmp: string;
beforeEach(async () => { tmp = await mkdtemp(path.join(os.tmpdir(), 'diagc-alias-')); });
afterEach(async () => { await rm(tmp, { recursive: true, force: true }); });

describe('compileFile with coreEntry alias', () => {
  it('compiles a .diagram.ts that imports @diagramming/core from outside the monorepo', async () => {
    // Verifies consumer-located .diagram.ts compiles; coreEntry alias is exercised as a safeguard (also succeeds without it).
    const src = path.join(tmp, 'x.diagram.ts');
    await writeFile(
      src,
      `import { model } from '@diagramming/core';\n` +
        `const m = model('x');\n` +
        `m.node('a', { type: 'service' });\n` +
        `export default m;\n`,
    );
    const out = path.join(tmp, 'out');
    await mkdir(out, { recursive: true });
    const artifact = await compileFile(src, out, { coreEntry });
    const json = JSON.parse(await readFile(artifact, 'utf8')) as { version: number; nodes: { id: string }[] };
    expect(json.version).toBe(1);
    expect(json.nodes.some((n) => n.id === 'a')).toBe(true);
  });
});
