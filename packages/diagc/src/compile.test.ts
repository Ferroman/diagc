import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { DiagramModel, IncludeResolver } from '@diagc/core';
import { compileFile, executeDiagramTs, LoadError, positionIn } from './compile';

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

const fixtures = path.resolve(import.meta.dirname, '../test-fixtures');

describe('compileFile', () => {
  it('compiles a TS diagram to a JSON artifact', async () => {
    const out = await mkdtemp(path.join(tmpdir(), 'diagc-'));
    const artifact = await compileFile(path.join(fixtures, 'sample.diagram.ts'), out);

    expect(artifact).toBe(path.join(out, 'sample.diagram.json'));
    const json = JSON.parse(await readFile(artifact, 'utf8'));
    expect(json.version).toBe(1);
    expect(json.id).toBe('sample');
    expect(json.nodes).toHaveLength(3);
    expect(json.relations).toEqual([{ id: 'api->db#0', from: 'api', to: 'db', kind: 'reads' }]);
  });

  it('propagates validation errors from invalid diagrams', async () => {
    const out = await mkdtemp(path.join(tmpdir(), 'diagc-'));
    // Match by name, not class: the error is constructed inside jiti's transformed
    // copy of @diagc/core, so instanceof against our import would fail.
    await expect(compileFile(path.join(fixtures, 'broken.diagram.ts'), out)).rejects.toMatchObject({
      name: 'DiagramValidationError',
    });
  });

  it('compiles a fishbone with a stray cause, and warns about the stray', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'diagc-'));
    const src = path.join(dir, 'fish.diagram.json');
    const model: DiagramModel = {
      version: 1,
      id: 'fish',
      name: 'fish',
      notation: 'fishbone',
      nodes: [
        { id: 'e', name: 'Outage', type: 'fb-effect' },
        { id: 'c', name: 'Code', type: 'fb-category' },
        { id: 'loose', name: 'Loose', type: 'fb-cause' },
      ],
      containment: [],
      relations: [{ id: 'c->e#0', from: 'c', to: 'e', kind: 'cause-of' }],
      layers: [],
      planes: [],
    };
    await writeFile(src, JSON.stringify(model));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const artifact = await compileFile(src, path.join(dir, 'out'));
      expect(await exists(artifact)).toBe(true);
      expect(warn).toHaveBeenCalledWith(`${src}: 'loose' does not reach the effect`);
    } finally {
      warn.mockRestore();
    }
  });

  it('rejects a file with no default export and writes no artifact', async () => {
    const out = await mkdtemp(path.join(tmpdir(), 'diagc-'));
    await expect(compileFile(path.join(fixtures, 'no-default.diagram.ts'), out)).rejects.toThrow(
      /no default export or not a diagram model/,
    );
    expect(await exists(path.join(out, 'no-default.diagram.json'))).toBe(false);
  });

  it('validates plain-object default exports and writes no artifact when invalid', async () => {
    const out = await mkdtemp(path.join(tmpdir(), 'diagc-'));
    // Constructed in this module world (not jiti's copy), so the real class
    // matches; the test still asserts by name to stay robust either way.
    await expect(compileFile(path.join(fixtures, 'plain-invalid.diagram.ts'), out)).rejects.toMatchObject({
      name: 'DiagramValidationError',
    });
    expect(await exists(path.join(out, 'plain-invalid.diagram.json'))).toBe(false);
  });

  it('mirrors a nested source path into the artifact path under rootDir', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'diagc-root-'));
    const out = await mkdtemp(path.join(tmpdir(), 'diagc-out-'));
    await mkdir(path.join(root, 'svc'), { recursive: true });
    const source = path.join(root, 'svc', 'app.diagram.ts');
    await copyFile(path.join(fixtures, 'sample.diagram.ts'), source);

    const artifact = await compileFile(source, out, { rootDir: root });

    expect(artifact).toBe(path.join(out, 'svc', 'app.diagram.json'));
    expect(JSON.parse(await readFile(artifact, 'utf8')).id).toBe('sample');
  });
});

describe('compileFile with JSON sources', () => {
  it('validates and mirrors a .diagram.json source', async () => {
    const out = await mkdtemp(path.join(tmpdir(), 'diagc-'));
    const artifact = await compileFile(path.join(fixtures, 'plain.diagram.json'), out);
    expect(artifact).toBe(path.join(out, 'plain.diagram.json'));
    const json = JSON.parse(await readFile(artifact, 'utf8'));
    expect(json.id).toBe('plain');
    expect(json.relations).toHaveLength(1);
  });

  it('rejects an invalid JSON model', async () => {
    const out = await mkdtemp(path.join(tmpdir(), 'diagc-'));
    const bad = path.join(out, 'bad.diagram.json');
    await writeFile(
      bad,
      JSON.stringify({
        version: 1,
        id: 'x',
        name: 'x',
        nodes: [],
        containment: [],
        relations: [{ id: 'r', from: 'a', to: 'b', kind: 'k' }],
        layers: [],
        planes: [],
      }),
    );
    await expect(compileFile(bad, out)).rejects.toMatchObject({ name: 'DiagramValidationError' });
  });
});

it('composes includes at compile time: one shared keyed node, both services attached', async () => {
  const out = await mkdtemp(path.join(tmpdir(), 'diagc-'));
  const artifact = await compileFile(path.join(fixtures, 'umbrella.diagram.json'), out);
  const json = JSON.parse(await readFile(artifact, 'utf8'));
  const dbs = json.nodes.filter((n: { key?: string }) => n.key === 'appuser-db');
  expect(dbs).toHaveLength(1);
  expect(dbs[0].id).toBe('appuser-db');
  expect(json.containment).toContainEqual({ parent: 'perm', child: 'appuser-db' });
  expect(json.containment).toContainEqual({ parent: 'comm', child: 'appuser-db' });
  expect(json.relations).toContainEqual({ id: 'perm/svc->db#0', from: 'perm/svc', to: 'appuser-db', kind: 'reads' });
  expect(json.relations).toContainEqual({ id: 'comm/svc->db#0', from: 'comm/svc', to: 'appuser-db', kind: 'writes' });
});

it('fails the compile on include cycles with the chain in the message', async () => {
  const out = await mkdtemp(path.join(tmpdir(), 'diagc-'));
  await expect(compileFile(path.join(fixtures, 'cycle-a.diagram.json'), out)).rejects.toThrowError(/cycle/i);
});

it('fails the compile when a namespaced include id collides with an umbrella-declared node', async () => {
  const out = await mkdtemp(path.join(tmpdir(), 'diagc-'));
  await expect(compileFile(path.join(fixtures, 'umbrella-collision.diagram.json'), out)).rejects.toMatchObject({
    name: 'DiagramValidationError',
    message: expect.stringContaining('perm/svc'),
  });
});

it('compileFile composes through an injected resolver', async () => {
  const out = await mkdtemp(path.join(tmpdir(), 'diagc-'));
  const src = await mkdtemp(path.join(tmpdir(), 'diagc-src-'));
  const umbrella: DiagramModel = {
    version: 1,
    id: 'umbrella',
    name: 'Umbrella',
    nodes: [{ id: 'child', name: 'Child', type: 'system', include: './child.diagram.json' }],
    containment: [],
    relations: [],
    layers: [],
    planes: [],
  };
  const umbrellaFile = path.join(src, 'umbrella.diagram.json');
  await writeFile(umbrellaFile, JSON.stringify(umbrella, null, 2));

  const childModel: DiagramModel = {
    version: 1,
    id: 'child',
    name: 'Child',
    nodes: [{ id: 'inner', name: 'Inner', type: 'service' }],
    containment: [],
    relations: [],
    layers: [],
    planes: [],
  };
  let calls = 0;
  const stub: IncludeResolver = async (spec, fromRef) => {
    calls++;
    return { model: childModel, ref: `${fromRef}::${spec}` };
  };

  // The stubbed child never touches disk — a real filesystem resolve of
  // './child.diagram.json' would ENOENT, so a passing artifact proves the
  // injected resolver was used instead of the real one.
  const artifact = await compileFile(umbrellaFile, out, { resolver: stub });
  expect(calls).toBe(1);
  const json = JSON.parse(await readFile(artifact, 'utf8'));
  expect(json.nodes).toContainEqual(expect.objectContaining({ id: 'child/inner' }));
});

describe('compileFile default resolver', () => {
  const umbrellaWith = (include: string): DiagramModel => ({
    version: 1,
    id: 'umbrella',
    name: 'Umbrella',
    nodes: [{ id: 'child', name: 'Child', type: 'system', include }],
    containment: [],
    relations: [],
    layers: [],
    planes: [],
  });

  it('defaults to locked snapshots under rootDir: an unsnapshotted remote include fails instead of fetching', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'diagc-locked-'));
    const src = path.join(root, 'src');
    await mkdir(src, { recursive: true });
    const file = path.join(src, 'umbrella.diagram.json');
    await writeFile(file, JSON.stringify(umbrellaWith('https://example.invalid/child.diagram.json')));
    await expect(compileFile(file, path.join(root, 'out'), { rootDir: src })).rejects.toThrow(/not snapshotted/);
  });

  it('resolves a vendored remote include offline through the default locked resolver', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'diagc-locked-'));
    const src = path.join(root, 'src');
    await mkdir(src, { recursive: true });
    const url = 'https://example.invalid/child.diagram.json';
    const file = path.join(src, 'umbrella.diagram.json');
    await writeFile(file, JSON.stringify(umbrellaWith(url)));

    const childModel: DiagramModel = {
      version: 1,
      id: 'child',
      name: 'Child',
      nodes: [{ id: 'inner', name: 'Inner', type: 'service' }],
      containment: [],
      relations: [],
      layers: [],
      planes: [],
    };
    const text = `${JSON.stringify(childModel, null, 2)}\n`;
    const hash = createHash('sha256').update(text).digest('hex');
    await mkdir(path.join(root, 'includes'), { recursive: true });
    await writeFile(path.join(root, 'includes', 'child.diagram.json'), text);
    await writeFile(
      path.join(root, 'includes.lock.json'),
      JSON.stringify({ version: 1, includes: { [url]: { file: 'includes/child.diagram.json', sha256: hash } } }),
    );

    const artifact = await compileFile(file, path.join(root, 'out'), { rootDir: src });
    const json = JSON.parse(await readFile(artifact, 'utf8'));
    expect(json.nodes).toContainEqual(expect.objectContaining({ id: 'child/inner' }));
  });
});

describe('executeDiagramTs', () => {
  it('executeDiagramTs returns the built model without writing artifacts', async () => {
    const coreEntry = fileURLToPath(new URL('../../core/src/index.ts', import.meta.url));
    const tmp = await mkdtemp(path.join(tmpdir(), 'diagc-exec-'));
    const file = path.join(tmp, 'exec-test.diagram.ts');
    await writeFile(
      file,
      `import { model } from '@diagc/core';\nconst m = model('exec-test');\nm.node('a');\nexport default m;\n`,
    );
    const model = await executeDiagramTs(file, coreEntry);
    expect(model.id).toBe('exec-test');
    expect(model.nodes.map((n) => n.id)).toEqual(['a']);
    expect(await exists(path.join(tmp, 'exec-test.diagram.json'))).toBe(false);
  });
});

describe('LoadError', () => {
  async function throwing(name: string, body: string): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), 'diagc-load-'));
    const file = path.join(dir, name);
    await writeFile(file, `import { model } from '@diagc/core';\nconst m = model('x');\n${body}\nexport default m;\n`);
    return file;
  }

  it('places a typo at the line and column of the first frame inside the file', async () => {
    const file = await throwing('typo.diagram.ts', "m.nod('a', { type: 'service' });");
    const err = await executeDiagramTs(file).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LoadError);
    const le = err as LoadError;
    expect(le.file).toBe(file);
    expect(le.reason).toBe('m.nod is not a function');
    expect(le.line).toBe(3);
    expect(typeof le.column).toBe('number');
    expect(le.message).toBe(`${file}:3:${le.column}: m.nod is not a function`);
  });

  it('places a refusal thrown by the builder at the call in the file, not inside core', async () => {
    const file = await throwing('twice.diagram.ts', "m.fishbone('f', 'Effect');\nm.fishbone('g', 'Again');");
    const err = (await executeDiagramTs(file).catch((e: unknown) => e)) as LoadError;
    expect(err).toBeInstanceOf(LoadError);
    expect(err.reason).toBe('fishbone() already declared');
    expect(err.line).toBe(4);
  });

  it('keeps a syntax error as it is, with no position', async () => {
    const file = await throwing('broken.diagram.ts', 'const = ;');
    const err = (await executeDiagramTs(file).catch((e: unknown) => e)) as LoadError;
    expect(err).toBeInstanceOf(LoadError);
    expect(err.line).toBeUndefined();
    expect(err.column).toBeUndefined();
    expect(err.message).toBe(err.reason);
    expect(err.reason).not.toBe('');
  });

  it('leaves a validation error alone, so lint still reads its issues', async () => {
    const file = await throwing(
      'dup.diagram.ts',
      "m.node('a', { type: 'service' });\nm.node('a', { type: 'service' });",
    );
    const err = (await executeDiagramTs(file).catch((e: unknown) => e)) as Error;
    expect(err).not.toBeInstanceOf(LoadError);
    expect(err.name).toBe('DiagramValidationError');
  });
});

describe('positionIn', () => {
  it('reads the first frame that is inside the file', () => {
    const stack = [
      'TypeError: x',
      '    at ModelBuilder.fishbone (/repo/packages/core/src/builder.ts:972:10)',
      '    at /work/twice.diagram.ts:4:3',
      '    at /work/twice.diagram.ts:9:1',
    ].join('\n');
    expect(positionIn(stack, '/work/twice.diagram.ts')).toEqual({ line: 4, column: 3 });
  });

  it('matches the basename only after a path separator, in either style', () => {
    expect(positionIn('    at Object.<anonymous> (C:\\work\\a.diagram.ts:2:7)', 'a.diagram.ts')).toEqual({
      line: 2,
      column: 7,
    });
    expect(positionIn('    at /work/not-a.diagram.ts:2:7', 'a.diagram.ts')).toBeUndefined();
  });

  it('ignores a position that is in the message rather than in a frame', () => {
    const stack =
      'Error: Transform failed with 1 error:\n/work/b.diagram.ts:3:7: ERROR: Unexpected "="\n    at failureErrorWithLog (/repo/node_modules/esbuild/lib/main.js:1748:15)';
    expect(positionIn(stack, '/work/b.diagram.ts')).toBeUndefined();
  });

  it('is undefined for no stack', () => {
    expect(positionIn(undefined, 'a.diagram.ts')).toBeUndefined();
  });
});
