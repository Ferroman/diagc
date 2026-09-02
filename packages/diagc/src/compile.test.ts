import { createHash } from 'node:crypto';
import { access, copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DiagramModel, IncludeResolver } from '@diagramming/core';
import { compileFile, executeDiagramTs } from './compile';

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
    // copy of @diagramming/core, so instanceof against our import would fail.
    await expect(compileFile(path.join(fixtures, 'broken.diagram.ts'), out)).rejects.toMatchObject({
      name: 'DiagramValidationError',
    });
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
    await writeFile(bad, JSON.stringify({ version: 1, id: 'x', name: 'x', nodes: [], containment: [], relations: [{ id: 'r', from: 'a', to: 'b', kind: 'k' }], layers: [], planes: [] }));
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
      `import { model } from '@diagramming/core';\nconst m = model('exec-test');\nm.node('a');\nexport default m;\n`,
    );
    const model = await executeDiagramTs(file, coreEntry);
    expect(model.id).toBe('exec-test');
    expect(model.nodes.map((n) => n.id)).toEqual(['a']);
    expect(await exists(path.join(tmp, 'exec-test.diagram.json'))).toBe(false);
  });
});
