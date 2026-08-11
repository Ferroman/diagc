import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LIBRARY_IMAGE_REF } from '@diagramming/core';
import { DEFAULT_TYPE_STYLES } from '@diagramming/renderer';
import { AWS_PACK } from './packs.aws';
import { C4_PACK } from './packs.c4';
import { BUNDLED_LIBRARY } from './packs';

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public');
const refs = (): string[] =>
  BUNDLED_LIBRARY.entries.flatMap((e) => [e.template.image, e.template.shape].filter((r) => r !== undefined));

describe('BUNDLED_LIBRARY', () => {
  it('bundles the C4, Tech and AWS packs, all builtin', () => {
    const ids = BUNDLED_LIBRARY.categories.map((c) => c.id);
    expect(ids).toContain('c4');
    expect(ids).toContain('tech');
    expect(ids).toContain('aws-compute');
    expect(ids).toContain('aws-groups');
    expect(BUNDLED_LIBRARY.categories.every((c) => c.builtin === true)).toBe(true);
  });

  it('every entry references a known category and has a template', () => {
    const cats = new Set(BUNDLED_LIBRARY.categories.map((c) => c.id));
    for (const e of BUNDLED_LIBRARY.entries) {
      expect(cats.has(e.category), `entry '${e.id}' has unknown category '${e.category}'`).toBe(true);
      expect(e.template).toBeDefined();
    }
  });

  it('every category has at least one entry', () => {
    const used = new Set(BUNDLED_LIBRARY.entries.map((e) => e.category));
    const empty = BUNDLED_LIBRARY.categories.filter((c) => !used.has(c.id)).map((c) => c.id);
    expect(empty).toEqual([]);
  });

  it('all entry ids are unique', () => {
    const ids = BUNDLED_LIBRARY.entries.map((e) => e.id);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes).toEqual([]);
  });

  it('every image and shape ref is a valid /library ref', () => {
    for (const ref of refs()) expect(ref).toMatch(LIBRARY_IMAGE_REF);
  });

  it('every image and shape ref resolves to a committed asset', () => {
    const missing = [...new Set(refs())].filter((ref) => !existsSync(path.join(PUBLIC_DIR, ref)));
    expect(missing).toEqual([]);
  });
});

describe('C4 pack', () => {
  const byId = new Map(C4_PACK.entries.map((e) => [e.id, e]));

  it('covers every C4 diagram level', () => {
    expect(C4_PACK.categories.map((c) => c.id)).toEqual([
      'c4',
      'c4-containers',
      'c4-components',
      'c4-deployment',
      'c4-code',
    ]);
  });

  it('carries the core element of each level', () => {
    for (const id of ['c4-person', 'c4-system', 'c4-container', 'c4-component', 'c4-deployment-node', 'c4-class']) {
      expect(byId.get(id), `missing '${id}'`).toBeDefined();
    }
  });

  it('pairs each element with an external twin', () => {
    for (const id of ['c4-person', 'c4-system', 'c4-container', 'c4-component']) {
      expect(byId.get(`${id}-external`), `missing '${id}-external'`).toBeDefined();
    }
  });

  it('renders both people as the person silhouette and nothing else as a shape', () => {
    const people = ['c4-person', 'c4-person-external'];
    for (const id of people) expect(byId.get(id)?.template.shape).toBe('/library/shapes/person.svg');
    const others = C4_PACK.entries.filter((e) => !people.includes(e.id));
    expect(others.every((e) => e.template.shape === undefined)).toBe(true);
    expect(C4_PACK.entries.every((e) => e.template.image === undefined)).toBe(true);
  });

  it('uses a node type the renderer styles (no silent fallback to a plain box)', () => {
    for (const e of C4_PACK.entries) {
      expect(e.template.type, `entry '${e.id}' has no type`).toBeDefined();
      expect(DEFAULT_TYPE_STYLES[e.template.type!], `type '${e.template.type}' is not in the type registry`).toBeDefined();
    }
  });
});

describe('AWS pack', () => {
  it('covers the whole official icon set', () => {
    const svc = AWS_PACK.entries.filter((e) => e.template.image?.startsWith('/library/aws/') === true);
    const res = AWS_PACK.entries.filter((e) => e.template.image?.startsWith('/library/aws-resources/') === true);
    const grp = AWS_PACK.entries.filter((e) => e.template.image?.startsWith('/library/aws-groups/') === true);
    expect(svc.length).toBeGreaterThanOrEqual(300);
    expect(res.length).toBeGreaterThanOrEqual(400);
    expect(grp.length).toBeGreaterThanOrEqual(15);
  });

  it('splits services across the AWS service categories', () => {
    const cats = new Set(AWS_PACK.entries.map((e) => e.category));
    expect(cats.size).toBeGreaterThanOrEqual(20);
    for (const c of cats) expect(c.startsWith('aws-')).toBe(true);
  });

  it('is findable by the abbreviations people actually type', () => {
    const kw = (id: string) => AWS_PACK.entries.find((e) => e.id === id)?.keywords ?? [];
    expect(kw('amazon-simple-storage-service')).toContain('s3');
    expect(kw('amazon-simple-queue-service')).toContain('sqs');
    expect(kw('amazon-elastic-kubernetes-service')).toContain('eks');
    expect(kw('aws-identity-and-access-management')).toContain('iam');
  });

  it('keeps the legacy placeholder file names resolvable for older diagrams', () => {
    for (const legacy of ['lambda', 's3', 'sns', 'dynamodb', 'api-gateway', 'cloudwatch']) {
      expect(existsSync(path.join(PUBLIC_DIR, 'library', 'aws', `${legacy}.svg`)), legacy).toBe(true);
    }
  });
});

describe('Tech pack', () => {
  it('carries the vendor logos no cloud icon set covers', () => {
    const tech = BUNDLED_LIBRARY.entries.filter((e) => e.category === 'tech');
    expect(tech.map((e) => e.name).sort()).toEqual(['NATS', 'StarRocks', 'Temporal']);
    for (const e of tech) expect(e.template.image).toMatch(/^\/library\/tech\//);
  });
});

describe('Data pack', () => {
  it('bundles a Table entry seeded with an id pk column', () => {
    const t = BUNDLED_LIBRARY.entries.find((e) => e.id === 'data-table');
    expect(t?.template.type).toBe('db-table');
    expect(t?.template.columns).toEqual([{ name: 'id', type: 'int', pk: true }]);
  });
});
