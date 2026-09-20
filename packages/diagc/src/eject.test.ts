import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ejectSource, type DiagramModel } from '@diagc/core';
import { diffPaths, ejectDiagram } from './eject';

const coreEntry = fileURLToPath(new URL('../../core/src/index.ts', import.meta.url));

let tmp: string;
let diagramsDir: string;
let artifactsDir: string;

beforeEach(async () => {
  tmp = await mkdtemp(path.join(os.tmpdir(), 'diagc-eject-'));
  diagramsDir = path.join(tmp, 'diagrams');
  artifactsDir = path.join(tmp, 'artifacts');
  await mkdir(diagramsDir, { recursive: true });
});

afterEach(async () => {
  await rm(tmp, { recursive: true, force: true });
});

const MODEL: DiagramModel = {
  version: 1,
  id: 'shop',
  name: 'Web shop',
  nodes: [
    { id: 'user', name: 'Customer', type: 'c4-person' },
    { id: 'db', name: 'Orders DB', type: 'c4-container-db', technology: 'PostgreSQL' },
  ],
  containment: [],
  relations: [{ id: 'user->db#0', from: 'user', to: 'db', kind: 'sync', label: 'reads' }],
  layers: [],
  planes: [],
};

describe('ejectDiagram', () => {
  it('ejects a JSON diagram: TS written, JSON gone, artifact recompiled, sidecars untouched', async () => {
    await writeFile(path.join(diagramsDir, 'shop.diagram.json'), JSON.stringify(MODEL, null, 2));
    await writeFile(path.join(diagramsDir, 'shop.layout.json'), JSON.stringify({ version: 1, planes: {} }));

    const res = await ejectDiagram(diagramsDir, artifactsDir, 'shop', { coreEntry });

    expect(res.tsPath).toBe(path.join(diagramsDir, 'shop.diagram.ts'));
    await expect(readFile(path.join(diagramsDir, 'shop.diagram.json'), 'utf8')).rejects.toThrow();
    const ts = await readFile(res.tsPath, 'utf8');
    expect(ts).toContain("import { model } from '@diagc/core';");
    const artifact = JSON.parse(await readFile(path.join(artifactsDir, 'shop.diagram.json'), 'utf8'));
    expect(artifact).toEqual(MODEL);
    // sidecar survived
    await expect(readFile(path.join(diagramsDir, 'shop.layout.json'), 'utf8')).resolves.toBeTruthy();
  });

  it('refuses an unknown name', async () => {
    await expect(ejectDiagram(diagramsDir, artifactsDir, 'missing', { coreEntry })).rejects.toMatchObject({
      code: 'not-found',
    });
  });

  it('refuses a TS-owned diagram', async () => {
    await writeFile(path.join(diagramsDir, 'shop.diagram.ts'), 'export default {} as never;\n');
    await expect(ejectDiagram(diagramsDir, artifactsDir, 'shop', { coreEntry })).rejects.toMatchObject({
      code: 'already-ts',
    });
  });

  it('refuses invalid JSON and leaves it in place', async () => {
    const bad = {
      version: 1,
      id: 'bad',
      name: 'bad',
      nodes: [
        { id: 'a', name: 'a', type: 't' },
        { id: 'a', name: 'a2', type: 't' },
      ],
      containment: [],
      relations: [],
      layers: [],
      planes: [],
    };
    await writeFile(path.join(diagramsDir, 'bad.diagram.json'), JSON.stringify(bad, null, 2));

    await expect(ejectDiagram(diagramsDir, artifactsDir, 'bad', { coreEntry })).rejects.toMatchObject({
      code: 'invalid',
    });
    await expect(readFile(path.join(diagramsDir, 'bad.diagram.json'), 'utf8')).resolves.toBeTruthy();
  });

  it('a verify mismatch changes nothing', async () => {
    await writeFile(path.join(diagramsDir, 'shop.diagram.json'), JSON.stringify(MODEL, null, 2));
    const evil = (m: DiagramModel) => ejectSource({ ...m, name: `${m.name}!` });

    await expect(ejectDiagram(diagramsDir, artifactsDir, 'shop', { coreEntry, emit: evil })).rejects.toMatchObject({
      code: 'mismatch',
    });
    await expect(readFile(path.join(diagramsDir, 'shop.diagram.json'), 'utf8')).resolves.toBeTruthy();
    await expect(readFile(path.join(diagramsDir, 'shop.diagram.ts'), 'utf8')).rejects.toThrow();
  });

  it('a generated source that fails to execute is a mismatch and changes nothing', async () => {
    await writeFile(path.join(diagramsDir, 'shop.diagram.json'), JSON.stringify(MODEL, null, 2));

    await expect(
      ejectDiagram(diagramsDir, artifactsDir, 'shop', { coreEntry, emit: () => 'throw new Error("boom");' }),
    ).rejects.toMatchObject({ code: 'mismatch' });
    await expect(readFile(path.join(diagramsDir, 'shop.diagram.json'), 'utf8')).resolves.toBeTruthy();
    await expect(readFile(path.join(diagramsDir, 'shop.diagram.ts'), 'utf8')).rejects.toThrow();
  });

  it('an emitter that throws is a classified invalid refusal, not a bare crash, and changes nothing', async () => {
    await writeFile(path.join(diagramsDir, 'shop.diagram.json'), JSON.stringify(MODEL, null, 2));
    const boom = (): string => {
      throw new Error('ejectSource: cannot emit a undefined literal');
    };

    await expect(ejectDiagram(diagramsDir, artifactsDir, 'shop', { coreEntry, emit: boom })).rejects.toMatchObject({
      code: 'invalid',
      message: expect.stringContaining("cannot eject 'shop': ejectSource: cannot emit a undefined literal"),
    });
    await expect(readFile(path.join(diagramsDir, 'shop.diagram.json'), 'utf8')).resolves.toBeTruthy();
    await expect(readFile(path.join(diagramsDir, 'shop.diagram.ts'), 'utf8')).rejects.toThrow();
  });
});

// One small, valid model per feature family, each ejected and compared against
// the recompiled artifact. Shapes are copied from packages/core/src/validate.test.ts's
// passing git-graph and activity cases so validation is not the thing under test.
const GIT_MODEL: DiagramModel = {
  version: 1,
  id: 'git-sample',
  name: 'Git sample',
  nodes: [
    { id: 'master', name: 'Master', type: 'branch' },
    { id: 'nightly', name: 'Nightly', type: 'branch' },
    { id: 'team', name: 'Team', type: 'branch' },
    { id: 'm1', name: '', type: 'commit' },
    { id: 'm2', name: '', type: 'commit' },
    { id: 'n1', name: '', type: 'commit' },
    { id: 'n2', name: '', type: 'commit' },
    { id: 't1', name: '', type: 'commit' },
  ],
  containment: [
    { parent: 'master', child: 'm1' },
    { parent: 'master', child: 'm2' },
    { parent: 'nightly', child: 'n1' },
    { parent: 'nightly', child: 'n2' },
    { parent: 'team', child: 't1' },
  ],
  relations: [
    { id: 'a', from: 'm1', to: 'm2', kind: 'commit' },
    { id: 'b', from: 'm1', to: 'n1', kind: 'branch' },
    { id: 'c', from: 'n1', to: 'n2', kind: 'commit' },
    { id: 'd', from: 'n1', to: 't1', kind: 'branch' },
    { id: 'e', from: 't1', to: 'n2', kind: 'merge' },
  ],
  layers: [],
  planes: [{ id: 'git', name: 'Git', notation: 'git-graph' }],
};

const ACTIVITY_MODEL: DiagramModel = {
  version: 1,
  id: 'checkout',
  name: 'Checkout',
  nodes: [
    { id: 'frame', name: 'Checkout', type: 'activity-frame' },
    { id: 'lane', name: 'Customer', type: 'activity-lane' },
    { id: 'start', name: '', type: 'activity-start' },
    { id: 'submit', name: 'Submit order', type: 'activity-action' },
    { id: 'valid', name: 'Valid?', type: 'activity-decision' },
  ],
  containment: [
    { parent: 'frame', child: 'lane' },
    { parent: 'lane', child: 'start' },
    { parent: 'lane', child: 'submit' },
    { parent: 'lane', child: 'valid' },
  ],
  relations: [
    { id: 'start->submit#0', from: 'start', to: 'submit', kind: 'control' },
    { id: 'submit->valid#0', from: 'submit', to: 'valid', kind: 'control' },
  ],
  layers: [],
  planes: [],
};

const ER_MODEL: DiagramModel = {
  version: 1,
  id: 'shop-er',
  name: 'Shop ER',
  nodes: [
    {
      id: 'users',
      name: 'users',
      type: 'db-table',
      columns: [
        { name: 'id', type: 'uuid', pk: true },
        { name: 'email', type: 'text' },
      ],
    },
    {
      id: 'orders',
      name: 'orders',
      type: 'db-table',
      columns: [
        { name: 'id', type: 'uuid', pk: true },
        { name: 'user_id', type: 'uuid', fk: true },
      ],
    },
  ],
  containment: [],
  relations: [{ id: 'orders->users#0', from: 'orders', to: 'users', kind: 'fk', fromColumn: 'user_id', toColumn: 'id' }],
  layers: [],
  planes: [],
};

const RICH_MODEL: DiagramModel = {
  version: 1,
  id: 'rich-sample',
  name: 'Rich sample',
  nodes: [
    {
      id: 'n',
      name: 'ab',
      rich: [
        { text: 'a', bold: true },
        { text: 'b' },
      ],
      textAlign: 'center',
      fontScale: 'lg',
    },
  ],
  containment: [],
  relations: [],
  layers: [],
  planes: [],
};

const MULTI_LABEL_MODEL: DiagramModel = {
  version: 1,
  id: 'edge-labels',
  name: 'Edge labels',
  nodes: [
    { id: 'a', name: 'a', type: 'service' },
    { id: 'b', name: 'b', type: 'service' },
  ],
  containment: [],
  relations: [
    {
      id: 'a->b#0',
      from: 'a',
      to: 'b',
      kind: 'calls',
      labels: [
        { id: 'l1', text: 'request', t: 0.25, side: 'top' },
        { id: 'l2', text: 'response', t: 0.75, side: 'bottom' },
      ],
    },
  ],
  layers: [],
  planes: [],
};

const PLANES_MODEL: DiagramModel = {
  version: 1,
  id: 'planes-sample',
  name: 'Planes sample',
  nodes: [
    { id: 'svc', name: 'Service', type: 'service' },
    { id: 'db', name: 'DB', type: 'service' },
    { id: 'shared', name: 'Shared', type: 'service' },
    { id: 'shared2', name: 'Shared 2', type: 'service' },
  ],
  containment: [{ parent: 'svc', child: 'db', plane: 'infra' }],
  relations: [],
  layers: [],
  planes: [
    { id: 'infra', name: 'Infra' },
    { id: 'flow', name: 'Flow', containmentOf: 'infra', notation: 'c4', hides: ['shared'], hidesTree: ['shared2'] },
  ],
};

const MODEL_LEVEL_MODEL: DiagramModel = {
  version: 1,
  id: 'model-level',
  name: 'Model level',
  nodes: [{ id: 'svc', name: 'Service', type: 'service' }],
  containment: [],
  relations: [],
  layers: [{ id: 'important', name: 'Important', tint: '#f00' }],
  planes: [],
  legend: {
    title: 'Legend',
    position: 'top-left',
    show: ['layers', 'kinds'],
    items: [{ label: 'gRPC', kind: 'grpc', color: '#0a0' }],
  },
  typeColors: { service: '#336', '*': '#999' },
  layerRules: [{ kind: 'calls', layer: 'important' }],
  notation: 'c4',
  style: 'sketch',
};

const FEATURE_FAMILIES: { name: string; model: DiagramModel }[] = [
  { name: 'git', model: GIT_MODEL },
  { name: 'activity', model: ACTIVITY_MODEL },
  { name: 'er', model: ER_MODEL },
  { name: 'rich-text', model: RICH_MODEL },
  { name: 'multi-label-edge', model: MULTI_LABEL_MODEL },
  { name: 'planes', model: PLANES_MODEL },
  { name: 'model-level', model: MODEL_LEVEL_MODEL },
];

describe('round-trips every model feature', () => {
  for (const { name, model } of FEATURE_FAMILIES) {
    it(`round-trips the ${name} family`, async () => {
      await writeFile(path.join(diagramsDir, `${name}.diagram.json`), JSON.stringify(model, null, 2));

      const res = await ejectDiagram(diagramsDir, artifactsDir, name, { coreEntry });

      expect(res.tsPath).toBe(path.join(diagramsDir, `${name}.diagram.ts`));
      const artifact = JSON.parse(await readFile(path.join(artifactsDir, `${name}.diagram.json`), 'utf8'));
      expect(artifact).toEqual(model);
    });
  }
});

// include/includePlane/includePlanes round-trip differently from the families
// above: eject's final recompile composes includes, so the artifact holds the
// GRAFTED result, not the pre-compose model. The child source has to exist on
// disk beside the umbrella (compileFile resolves it against the real
// filesystem) and declare the plane `includePlane` names, or the graft errors.
const INCLUDE_MODEL: DiagramModel = {
  version: 1,
  id: 'include-sample',
  name: 'Include sample',
  nodes: [
    {
      id: 'child',
      name: 'Child',
      type: 'system',
      include: './child.diagram.json',
      includePlane: 'ops',
      includePlanes: true,
    },
  ],
  containment: [],
  relations: [],
  layers: [],
  planes: [],
};

const INCLUDE_CHILD_MODEL: DiagramModel = {
  version: 1,
  id: 'child',
  name: 'Child',
  nodes: [{ id: 'inner', name: 'Inner', type: 'service' }],
  containment: [],
  relations: [],
  layers: [],
  planes: [{ id: 'ops', name: 'Ops' }],
};

describe('eject with an include node', () => {
  it('writes the include opts to TS and composes the graft into the recompiled artifact', async () => {
    await writeFile(path.join(diagramsDir, 'include-sample.diagram.json'), JSON.stringify(INCLUDE_MODEL, null, 2));
    await writeFile(path.join(diagramsDir, 'child.diagram.json'), JSON.stringify(INCLUDE_CHILD_MODEL, null, 2));

    const res = await ejectDiagram(diagramsDir, artifactsDir, 'include-sample', { coreEntry });

    expect(res.tsPath).toBe(path.join(diagramsDir, 'include-sample.diagram.ts'));
    const ts = await readFile(res.tsPath, 'utf8');
    expect(ts).toContain("include: './child.diagram.json'");
    expect(ts).toContain("includePlane: 'ops'");
    expect(ts).toContain('includePlanes: true');

    const artifact = JSON.parse(await readFile(path.join(artifactsDir, 'include-sample.diagram.json'), 'utf8'));
    expect(artifact.nodes).toContainEqual(expect.objectContaining({ id: 'child/inner' }));
    // include opts are compose-time-only and stripped from the composed output
    const host = artifact.nodes.find((n: { id: string }) => n.id === 'child');
    expect(host.include).toBeUndefined();
  });
});

describe('diffPaths', () => {
  it('reports a differing top-level scalar', () => {
    expect(diffPaths({ a: 1, b: 2 }, { a: 1, b: 3 })).toEqual(['b']);
  });

  it('reports a differing nested field with a dotted path', () => {
    expect(diffPaths({ a: { b: { c: 1 } } }, { a: { b: { c: 2 } } })).toEqual(['a.b.c']);
  });

  it('stops at the limit', () => {
    const a = { p: 1, q: 1, r: 1, s: 1 };
    const b = { p: 2, q: 2, r: 2, s: 2 };
    expect(diffPaths(a, b, 2)).toHaveLength(2);
  });
});
