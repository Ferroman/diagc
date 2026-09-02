import { describe, expect, it } from 'vitest';
import { composeIncludes, IncludeError, MAX_INCLUDE_DEPTH, type IncludeResolver } from './compose';
import { validate } from './validate';
import type { DiagramModel } from './types';

const doc = (id: string, partial: Partial<DiagramModel>): DiagramModel => ({
  version: 1, id, name: id, nodes: [], containment: [], relations: [], layers: [], planes: [], ...partial,
});

const memory = (docs: Record<string, DiagramModel>): IncludeResolver => async (spec, fromRef) => {
  const ref = spec.startsWith('mem:') ? spec : `mem:${spec}`;
  const model = docs[ref.slice(4)];
  if (model === undefined) throw new Error(`not found: ${spec} (from ${fromRef})`);
  return { model: structuredClone(model), ref };
};

describe('composeIncludes: expansion', () => {
  const permission = doc('permission', {
    nodes: [
      { id: 'svc', name: 'Permission svc', type: 'service' },
      { id: 'db', name: 'Perm DB', type: 'database' },
    ],
    containment: [{ parent: 'svc', child: 'db' }],
    relations: [{ id: 'svc->db#0', from: 'svc', to: 'db', kind: 'reads' }],
  });

  it('namespaces included content under the include node', async () => {
    const umbrella = doc('arch', {
      nodes: [{ id: 'perm', name: 'Permission', type: 'system', include: 'permission' }],
    });
    const { model: m, warnings } = await composeIncludes(umbrella, 'mem:arch', memory({ permission }));
    expect(warnings).toEqual([]);
    const ids = m.nodes.map((n) => n.id);
    expect(ids).toEqual(['perm', 'perm/svc', 'perm/db']);
    // top-level included node becomes a child of the include node; nesting preserved
    expect(m.containment).toContainEqual({ parent: 'perm', child: 'perm/svc' });
    expect(m.containment).toContainEqual({ parent: 'perm/svc', child: 'perm/db' });
    expect(m.relations).toContainEqual({ id: 'perm/svc->db#0', from: 'perm/svc', to: 'perm/db', kind: 'reads' });
    // include provenance does NOT survive: composed artifacts must themselves be
    // includable, so re-including a published composed artifact must not re-expand it
    expect(m.nodes[0]?.include).toBeUndefined();
    expect(validate(m)).toEqual([]);
  });

  it('imports layers namespaced with rewritten relation references, and drops planes', async () => {
    const svc = doc('svc', {
      nodes: [{ id: 'a', name: 'a', type: 'service' }, { id: 'b', name: 'b', type: 'service' }],
      layers: [{ id: 'flow', name: 'Flow', tint: '#0ea5e9' }],
      planes: [{ id: 'arch', name: 'Arch' }, { id: 'infra', name: 'Infra' }],
      containment: [
        { parent: 'a', child: 'b' },              // default plane (untagged)
        { parent: 'b', child: 'a', plane: 'infra' }, // non-default: must NOT be imported
      ],
      relations: [{ id: 'a->b#0', from: 'a', to: 'b', kind: 'flow', layer: 'flow' }],
    });
    const umbrella = doc('arch', { nodes: [{ id: 's', name: 'Svc', type: 'system', include: 'svc' }] });
    const { model: m } = await composeIncludes(umbrella, 'mem:arch', memory({ svc }));
    expect(m.layers).toEqual([{ id: 's/flow', name: 'Svc/Flow', tint: '#0ea5e9' }]);
    expect(m.relations[0]).toMatchObject({ layer: 's/flow' });
    expect(m.planes).toEqual([]); // umbrella had none; include's are dropped
    expect(m.containment).toContainEqual({ parent: 's/a', child: 's/b' });
    expect(m.containment.some((e) => e.parent === 's/b' && e.child === 's/a')).toBe(false);
    expect(validate(m)).toEqual([]);
  });

  it('unifies an included layer with a same-id host layer and remaps node/relation layer refs', async () => {
    const svc = doc('svc', {
      nodes: [
        { id: 'a', name: 'a', type: 'service' },
        { id: 'obs', name: 'obs', type: 'infra', layer: 'monitoring' },
      ],
      layers: [
        { id: 'monitoring', name: 'Monitoring', tint: '#90a4ae' },
        { id: 'flow', name: 'Flow' },
      ],
      relations: [
        { id: 'a->obs#0', from: 'a', to: 'obs', kind: 'telemetry', layer: 'monitoring' },
        { id: 'a->a#0', from: 'a', to: 'a', kind: 'loop', layer: 'flow' },
      ],
    });
    const umbrella = doc('arch', {
      nodes: [{ id: 's', name: 'Svc', type: 'system', include: 'svc' }],
      layers: [{ id: 'monitoring', name: 'Monitoring / telemetry', tint: '#000000' }],
    });
    const { model: m } = await composeIncludes(umbrella, 'mem:arch', memory({ svc }));
    // host layer kept as-is, no duplicate; unmatched layer still namespaced
    expect(m.layers).toEqual([
      { id: 'monitoring', name: 'Monitoring / telemetry', tint: '#000000' },
      { id: 's/flow', name: 'Svc/Flow' },
    ]);
    expect(m.relations.find((r) => r.id === 's/a->obs#0')).toMatchObject({ layer: 'monitoring' });
    expect(m.relations.find((r) => r.id === 's/a->a#0')).toMatchObject({ layer: 's/flow' });
    expect(m.nodes.find((n) => n.id === 's/obs')).toMatchObject({ layer: 'monitoring' });
    expect(validate(m)).toEqual([]);
  });

  it('namespaces node layer refs when the host does not declare the layer', async () => {
    const svc = doc('svc', {
      nodes: [{ id: 'obs', name: 'obs', type: 'infra', layer: 'monitoring' }],
      layers: [{ id: 'monitoring', name: 'Monitoring' }],
    });
    const umbrella = doc('arch', { nodes: [{ id: 's', name: 'Svc', type: 'system', include: 'svc' }] });
    const { model: m } = await composeIncludes(umbrella, 'mem:arch', memory({ svc }));
    expect(m.nodes.find((n) => n.id === 's/obs')).toMatchObject({ layer: 's/monitoring' });
    expect(validate(m)).toEqual([]);
  });

  it('expands includes-of-includes depth-first', async () => {
    const inner = doc('inner', { nodes: [{ id: 'x', name: 'x', type: 'service' }] });
    const outer = doc('outer', { nodes: [{ id: 'sub', name: 'Sub', type: 'system', include: 'inner' }] });
    const umbrella = doc('arch', { nodes: [{ id: 'o', name: 'O', type: 'system', include: 'outer' }] });
    const { model: m } = await composeIncludes(umbrella, 'mem:arch', memory({ inner, outer }));
    expect(m.nodes.map((n) => n.id)).toEqual(['o', 'o/sub', 'o/sub/x']);
    expect(m.containment).toContainEqual({ parent: 'o/sub', child: 'o/sub/x' });
  });

  it('fails loudly on resolver errors, invalid included models, cycles, and depth', async () => {
    const umbrella = doc('arch', { nodes: [{ id: 'p', name: 'p', type: 'system', include: 'missing' }] });
    await expect(composeIncludes(umbrella, 'mem:arch', memory({}))).rejects.toThrowError(IncludeError);

    const invalid = doc('bad', { relations: [{ id: 'r', from: 'ghost', to: 'ghost2', kind: 'k' }] });
    const u2 = doc('arch', { nodes: [{ id: 'p', name: 'p', type: 'system', include: 'bad' }] });
    await expect(composeIncludes(u2, 'mem:arch', memory({ bad: invalid }))).rejects.toThrowError(/bad/);

    const selfDoc = doc('self', { nodes: [{ id: 'me', name: 'me', type: 'system', include: 'self' }] });
    const u3 = doc('arch', { nodes: [{ id: 's', name: 's', type: 'system', include: 'self' }] });
    await expect(composeIncludes(u3, 'mem:arch', memory({ self: selfDoc }))).rejects.toThrowError(/cycle/i);

    // a chain longer than MAX_INCLUDE_DEPTH
    const docs: Record<string, DiagramModel> = {};
    for (let i = 0; i <= MAX_INCLUDE_DEPTH + 1; i++) {
      docs[`d${i}`] = doc(`d${i}`, {
        nodes: [{ id: 'n', name: 'n', type: 'system', ...(i <= MAX_INCLUDE_DEPTH ? { include: `d${i + 1}` } : {}) }],
      });
    }
    const u4 = doc('arch', { nodes: [{ id: 'd', name: 'd', type: 'system', include: 'd0' }] });
    await expect(composeIncludes(u4, 'mem:arch', memory(docs))).rejects.toThrowError(/depth/i);
  });

  it('returns the model untouched when nothing declares an include', async () => {
    const plain = doc('plain', { nodes: [{ id: 'a', name: 'a', type: 't' }] });
    const { model: m, warnings } = await composeIncludes(plain, 'mem:plain', memory({}));
    expect(m).toEqual(plain);
    expect(warnings).toEqual([]);
  });
});

describe('composeIncludes: includePlane', () => {
  const child = doc('child', {
    nodes: [
      { id: 'a', name: 'a', type: 'x' },
      { id: 'b', name: 'b', type: 'x' },
      { id: 'c', name: 'c', type: 'x' },
    ],
    planes: [{ id: 'main', name: 'Main' }, { id: 'alt', name: 'Alt' }],
    containment: [
      { parent: 'a', child: 'b' },                 // untagged -> default plane 'main'
      { parent: 'a', child: 'c', plane: 'alt' },
    ],
  });

  it("includePlane grafts the named plane's structure", async () => {
    const host = doc('host', {
      nodes: [{ id: 'u', name: 'U', type: 'system', include: 'child', includePlane: 'alt' }],
    });
    const { model: m } = await composeIncludes(host, 'mem:host', memory({ child }));
    // only the alt-plane rows come along
    expect(m.containment).toContainEqual({ parent: 'u/a', child: 'u/c' });
    // 'a' has no parent in the alt plane, so it hangs directly under the include node too
    expect(m.containment).toContainEqual({ parent: 'u', child: 'u/a' });
    // 'b' only appears as a child in the main plane, so in alt it's parentless -> hangs under u
    expect(m.containment).toContainEqual({ parent: 'u', child: 'u/b' });
    expect(m.containment).toHaveLength(3);
    expect(validate(m)).toEqual([]);
  });

  it("includePlane naming the default plane matches today's behavior", async () => {
    const omitted = doc('host', { nodes: [{ id: 'u', name: 'U', type: 'system', include: 'child' }] });
    const named = doc('host', {
      nodes: [{ id: 'u', name: 'U', type: 'system', include: 'child', includePlane: 'main' }],
    });
    const { model: m1 } = await composeIncludes(omitted, 'mem:host', memory({ child }));
    const { model: m2 } = await composeIncludes(named, 'mem:host', memory({ child }));
    expect(m2).toEqual(m1);
  });

  it('an unknown includePlane fails the compose', async () => {
    const host = doc('host', {
      nodes: [{ id: 'u', name: 'U', type: 'system', include: 'child', includePlane: 'nope' }],
    });
    await expect(composeIncludes(host, 'mem:host', memory({ child }))).rejects.toThrow(/plane 'nope' not found/);
  });

  it('a selected plane borrowing containmentOf resolves to the borrowed structure', async () => {
    const borrowing = doc('borrowing', {
      nodes: [
        { id: 'a', name: 'a', type: 'x' },
        { id: 'b', name: 'b', type: 'x' },
      ],
      planes: [{ id: 'main', name: 'Main' }, { id: 'alt2', name: 'Alt2', containmentOf: 'main' }],
      containment: [{ parent: 'a', child: 'b' }], // untagged -> default plane 'main'
    });
    const host = doc('host', {
      nodes: [{ id: 'u', name: 'U', type: 'system', include: 'borrowing', includePlane: 'alt2' }],
    });
    const { model: m } = await composeIncludes(host, 'mem:host', memory({ borrowing }));
    expect(m.containment).toContainEqual({ parent: 'u/a', child: 'u/b' });
    expect(m.containment).toContainEqual({ parent: 'u', child: 'u/a' });
    expect(validate(m)).toEqual([]);
  });

  it('stripIncludes drops includePlane and includePlanes with include', async () => {
    const simple = doc('simple', { nodes: [{ id: 'a', name: 'a' }], planes: [{ id: 'main', name: 'Main' }] });
    const host = doc('host', {
      nodes: [{ id: 'u', name: 'U', type: 'system', include: 'simple', includePlane: 'main', includePlanes: true }],
    });
    const { model: m } = await composeIncludes(host, 'mem:host', memory({ simple }));
    const u = m.nodes.find((n) => n.id === 'u');
    expect(u).toBeDefined();
    expect(u?.include).toBeUndefined();
    expect(u?.includePlane).toBeUndefined();
    expect(u?.includePlanes).toBeUndefined();
    expect(validate(m)).toEqual([]);
  });
});

describe('composeIncludes: key unification', () => {
  const service = (svcName: string): DiagramModel =>
    doc(svcName, {
      nodes: [
        { id: 'svc', name: `${svcName} svc`, type: 'service' },
        { id: 'db', name: 'Users', type: 'database', key: 'appuser-db' },
      ],
      relations: [{ id: 'svc->db#0', from: 'svc', to: 'db', kind: 'reads' }],
    });

  it('merges keyed nodes from several includes into one multi-parented node', async () => {
    const umbrella = doc('arch', {
      nodes: [
        { id: 'perm', name: 'Permission', type: 'system', include: 'permission' },
        { id: 'comm', name: 'Communication', type: 'system', include: 'communication' },
      ],
    });
    const { model: m, warnings } = await composeIncludes(
      umbrella, 'mem:arch', memory({ permission: service('permission'), communication: service('communication') }),
    );
    expect(warnings).toEqual([]);
    const dbs = m.nodes.filter((n) => n.key === 'appuser-db');
    expect(dbs).toHaveLength(1);
    expect(dbs[0]?.id).toBe('appuser-db');          // composed id = the key
    expect(dbs[0]?.name).toBe('Users');             // first include wins display
    // multi-parent: sits under both include containers
    expect(m.containment).toContainEqual({ parent: 'perm', child: 'appuser-db' });
    expect(m.containment).toContainEqual({ parent: 'comm', child: 'appuser-db' });
    // both services' relations point at the one node
    expect(m.relations).toContainEqual({ id: 'perm/svc->db#0', from: 'perm/svc', to: 'appuser-db', kind: 'reads' });
    expect(m.relations).toContainEqual({ id: 'comm/svc->db#0', from: 'comm/svc', to: 'appuser-db', kind: 'reads' });
    expect(validate(m)).toEqual([]);
  });

  it('merges the keyed node when two include nodes point at the same document', async () => {
    const umbrella = doc('arch', {
      nodes: [
        { id: 'a', name: 'A', type: 'system', include: 'permission' },
        { id: 'b', name: 'B', type: 'system', include: 'permission' },
      ],
    });
    const { model: m, warnings } = await composeIncludes(umbrella, 'mem:arch', memory({ permission: service('permission') }));
    expect(warnings).toEqual([]);
    const dbs = m.nodes.filter((n) => n.key === 'appuser-db');
    expect(dbs).toHaveLength(1);
    expect(dbs[0]?.id).toBe('appuser-db');
    // both containers parent the single merged node
    expect(m.containment).toContainEqual({ parent: 'a', child: 'appuser-db' });
    expect(m.containment).toContainEqual({ parent: 'b', child: 'appuser-db' });
    expect(validate(m)).toEqual([]);
  });

  it('lets an umbrella-authored keyed node claim display attributes and re-ids it to the key', async () => {
    const umbrella = doc('arch', {
      nodes: [
        { id: 'users-db', name: 'THE user db', type: 'database', key: 'appuser-db', color: '#e05d5d' },
        { id: 'perm', name: 'Permission', type: 'system', include: 'permission' },
      ],
      relations: [{ id: 'perm->users-db#0', from: 'perm', to: 'users-db', kind: 'owns' }],
    });
    const { model: m } = await composeIncludes(umbrella, 'mem:arch', memory({ permission: service('permission') }));
    const merged = m.nodes.find((n) => n.key === 'appuser-db');
    expect(merged).toMatchObject({ id: 'appuser-db', name: 'THE user db', color: '#e05d5d' });
    // the umbrella's own relation to its original id was rewritten
    expect(m.relations).toContainEqual({ id: 'perm->users-db#0', from: 'perm', to: 'appuser-db', kind: 'owns' });
    expect(m.nodes.some((n) => n.id === 'users-db')).toBe(false);
    expect(validate(m)).toEqual([]);
  });

  it('warns on type disagreement and errors on key/id collision', async () => {
    const odd = doc('odd', {
      nodes: [{ id: 'db', name: 'db', type: 'cache', key: 'appuser-db' }],
    });
    const u = doc('arch', {
      nodes: [
        { id: 'perm', name: 'P', type: 'system', include: 'permission' },
        { id: 'o', name: 'O', type: 'system', include: 'odd' },
      ],
    });
    const { warnings } = await composeIncludes(u, 'mem:arch', memory({ permission: service('permission'), odd }));
    expect(warnings.join(' ')).toMatch(/appuser-db.*type/);

    // a typeless member reads as "no type", never the literal "undefined"
    const bare = doc('bare', { nodes: [{ id: 'db', name: 'db', key: 'appuser-db' }] });
    const u2 = doc('arch', {
      nodes: [
        { id: 'perm', name: 'P', type: 'system', include: 'permission' },
        { id: 'b', name: 'B', type: 'system', include: 'bare' },
      ],
    });
    const { warnings: w2 } = await composeIncludes(u2, 'mem:arch', memory({ permission: service('permission'), bare }));
    expect(w2.join(' ')).toContain('no type');
    expect(w2.join(' ')).not.toContain('undefined');

    const clash = doc('arch', {
      nodes: [
        { id: 'appuser-db', name: 'unrelated', type: 'service' }, // unkeyed, occupies the key's id
        { id: 'perm', name: 'P', type: 'system', include: 'permission' },
      ],
    });
    await expect(
      composeIncludes(clash, 'mem:arch', memory({ permission: service('permission') })),
    ).rejects.toThrowError(/appuser-db/);
  });
});

describe('composeIncludes: transitive composition', () => {
  it('lets a composed artifact be included again, still merging its keyed node with the outer umbrella', async () => {
    const permission = doc('permission', {
      nodes: [
        { id: 'svc', name: 'Permission svc', type: 'service' },
        { id: 'db', name: 'Users', type: 'database', key: 'appuser-db' },
      ],
      relations: [{ id: 'svc->db#0', from: 'svc', to: 'db', kind: 'reads' }],
    });
    const innerUmbrella = doc('svc-umbrella', {
      nodes: [{ id: 'perm', name: 'Permission', type: 'system', include: 'permission' }],
    });
    // compose once, as if publishing a service's own compiled artifact
    const { model: composed1 } = await composeIncludes(innerUmbrella, 'mem:svc-umbrella', memory({ permission }));
    expect(validate(composed1)).toEqual([]);
    expect(composed1.nodes.every((n) => n.include === undefined)).toBe(true);

    // now include that composed artifact from a second, outer umbrella, which also
    // declares its own node under the same key
    const outerUmbrella = doc('arch', {
      nodes: [
        { id: 'users-db', name: 'THE user db', type: 'database', key: 'appuser-db' },
        { id: 'svc', name: 'Services', type: 'system', include: 'svc-umbrella' },
      ],
    });
    const { model: composed2, warnings } = await composeIncludes(
      outerUmbrella, 'mem:arch', memory({ 'svc-umbrella': composed1 }),
    );
    expect(warnings).toEqual([]);
    // grafts cleanly: no duplicate ids from re-expanding the already-composed artifact
    expect(validate(composed2)).toEqual([]);
    // the key declared inside the inner composition still merges with the outer umbrella's node
    const merged = composed2.nodes.filter((n) => n.key === 'appuser-db');
    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe('appuser-db');
    expect(merged[0]?.name).toBe('THE user db'); // umbrella-authored node wins display
    expect(composed2.containment).toContainEqual({ parent: 'svc/perm', child: 'appuser-db' });
  });
});

describe('composeIncludes: legend', () => {
  const child = doc('child', {
    nodes: [{ id: 'c1', name: 'C1' }],
    legend: { title: 'Child key' },
  });

  it('keeps the root legend and drops an included one', async () => {
    const umbrella = doc('arch', {
      nodes: [{ id: 'wrap', name: 'Wrap', include: 'child' }],
      legend: { title: 'Host key' },
    });
    const { model: m } = await composeIncludes(umbrella, 'mem:arch', memory({ child }));
    expect(m.legend).toEqual({ title: 'Host key' });
  });

  it('leaves a legend-less root legend-less', async () => {
    const umbrella = doc('arch', { nodes: [{ id: 'wrap', name: 'Wrap', include: 'child' }] });
    const { model: m } = await composeIncludes(umbrella, 'mem:arch', memory({ child }));
    expect(m.legend).toBeUndefined();
  });
});

describe('typeColors on graft', () => {
  it('keeps the host convention and drops the child one', async () => {
    const child = doc('child', {
      nodes: [{ id: 'c', key: 'c', name: 'c', type: 'c4-person' }],
      typeColors: { 'c4-person': '#ff0000' },
    });
    const host = doc('host', {
      nodes: [{ id: 'wrap', name: 'wrap', include: 'child' }],
      typeColors: { '*': '#1565c0' },
    });
    const { model: m } = await composeIncludes(host, 'mem:host', memory({ child }));
    expect(m.typeColors).toEqual({ '*': '#1565c0' });
    expect(m.nodes.some((n) => n.name === 'c')).toBe(true);
  });

  it('keeps the host layerRules and drops the child ones', async () => {
    const child = doc('child', {
      nodes: [{ id: 'c', key: 'c', name: 'c' }],
      layers: [{ id: 'x', name: 'X' }],
      layerRules: [{ kind: 'sql', layer: 'x' }],
    });
    const host = doc('host', {
      nodes: [{ id: 'wrap', name: 'wrap', include: 'child' }],
      layers: [{ id: 'http', name: 'HTTP' }],
      layerRules: [{ color: '#ef6c00', layer: 'http' }],
    });
    const { model: m } = await composeIncludes(host, 'mem:host', memory({ child }));
    expect(m.layerRules).toEqual([{ color: '#ef6c00', layer: 'http' }]);
  });

  it('keeps the host notation and drops the child one', async () => {
    const child = doc('child', {
      nodes: [{ id: 'c', key: 'c', name: 'c' }],
      notation: 'git-graph',
    });
    const host = doc('host', {
      nodes: [{ id: 'wrap', name: 'wrap', include: 'child' }],
      notation: 'c4',
    });
    const { model: m } = await composeIncludes(host, 'mem:host', memory({ child }));
    expect(m.notation).toBe('c4');
  });
});
