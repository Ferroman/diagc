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

describe('Basics pack', () => {
  const basics = BUNDLED_LIBRARY.entries.filter((e) => e.category === 'basics');

  it('offers the plain built-in stencils, first in the panel order', () => {
    expect(BUNDLED_LIBRARY.categories[0]?.id).toBe('basics');
    expect(BUNDLED_LIBRARY.categories[0]?.group).toBeUndefined(); // top-level, not nested
    const names = basics.map((e) => e.name);
    for (const n of ['Box', 'Service', 'System', 'Platform', 'Database', 'Queue', 'Infrastructure', 'Comment']) {
      expect(names, `missing basic stencil '${n}'`).toContain(n);
    }
  });

  it('uses node types the renderer styles (no silent fallback to a plain box)', () => {
    for (const e of basics) {
      if (e.template.type === undefined) continue; // 'Box' is deliberately typeless
      expect(DEFAULT_TYPE_STYLES[e.template.type], `type '${e.template.type}'`).toBeDefined();
    }
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

  it('nests every category under the C4 model group, names prefix-free', () => {
    for (const c of C4_PACK.categories) {
      expect(c.group, c.id).toBe('C4 model');
      expect(c.name, c.id).not.toContain('C4 ·');
    }
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

  it('nests every category under the AWS group, names prefix-free', () => {
    expect(AWS_PACK.categories.length).toBeGreaterThanOrEqual(20);
    for (const c of AWS_PACK.categories) {
      expect(c.group, c.id).toBe('AWS');
      expect(c.name, c.id).not.toContain('AWS ·');
    }
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

describe('AWS containers', () => {
  const byId = new Map(BUNDLED_LIBRARY.entries.map((e) => [e.id, e]));

  it('offers one-drag boundary containers with the authentic accent colors', () => {
    const want: Record<string, { type: string; color: string; image?: string }> = {
      'aws-ctr-cloud': { type: 'aws-cloud', color: '#242F3E', image: '/library/aws-groups/aws-cloud.svg' },
      'aws-ctr-account': { type: 'aws-account', color: '#E7157B', image: '/library/aws-groups/aws-account.svg' },
      'aws-ctr-region': { type: 'aws-region', color: '#00A4A6', image: '/library/aws-groups/region.svg' },
      'aws-ctr-az': { type: 'aws-az', color: '#00A4A6' },
      'aws-ctr-vpc': { type: 'aws-vpc', color: '#8C4FFF', image: '/library/aws-groups/virtual-private-cloud-vpc.svg' },
      'aws-ctr-subnet-public': { type: 'aws-subnet-public', color: '#7AA116', image: '/library/aws-groups/public-subnet.svg' },
      'aws-ctr-subnet-private': { type: 'aws-subnet-private', color: '#00A4A6', image: '/library/aws-groups/private-subnet.svg' },
      'aws-ctr-auto-scaling': { type: 'aws-auto-scaling-group', color: '#ED7100', image: '/library/aws-groups/auto-scaling-group.svg' },
      'aws-ctr-generic': { type: 'aws-group', color: '#7D8998' },
    };
    for (const [id, t] of Object.entries(want)) {
      const e = byId.get(id);
      expect(e, `missing '${id}'`).toBeDefined();
      expect(e?.category).toBe('aws-groups');
      expect(e?.template).toMatchObject(t);
    }
  });

  it('uses node types the renderer styles (no silent fallback to a plain box)', () => {
    const ctrs = BUNDLED_LIBRARY.entries.filter((e) => e.id.startsWith('aws-ctr-'));
    expect(ctrs.length).toBeGreaterThanOrEqual(9);
    for (const e of ctrs) {
      expect(DEFAULT_TYPE_STYLES[e.template.type!], `type '${e.template.type}' is not in the type registry`).toBeDefined();
    }
  });
});

describe('Tech pack', () => {
  it('carries the vendor logos no cloud icon set covers', () => {
    const tech = BUNDLED_LIBRARY.entries.filter((e) => e.category === 'tech');
    expect(tech.map((e) => e.name).sort()).toEqual([
      'Auth0', 'ClickHouse', 'Cloudflare', 'GitHub', 'GitHub Actions', 'Helm', 'Jupyter', 'Kubernetes',
      'NATS', 'New Relic', 'PostgreSQL', 'RabbitMQ', 'Redis', 'SendGrid', 'StarRocks', 'Temporal',
    ]);
    for (const e of tech) expect(e.template.image).toMatch(/^\/library\/tech\//);
  });
});

describe('Kubernetes pack', () => {
  it('carries the community resource icons for cluster interiors', () => {
    const k8s = BUNDLED_LIBRARY.entries.filter((e) => e.category === 'k8s');
    expect(k8s.map((e) => e.id).sort()).toEqual([
      'k8s-deploy', 'k8s-ing', 'k8s-node', 'k8s-pod', 'k8s-secret', 'k8s-svc',
    ]);
    for (const e of k8s) expect(e.template.image).toMatch(/^\/library\/k8s\//);
  });

  it('is findable by the words people actually type', () => {
    const kw = (id: string) => BUNDLED_LIBRARY.entries.find((e) => e.id === id)?.keywords ?? [];
    expect(kw('k8s-pod')).toContain('kubernetes');
    expect(kw('k8s-ing')).toContain('ingress');
    expect(kw('k8s-svc')).toContain('service');
  });
});

describe('Shapes pack', () => {
  it('offers the tintable silhouette marks', () => {
    const shapes = BUNDLED_LIBRARY.entries.filter((e) => e.category === 'shapes');
    expect(shapes.map((e) => e.id).sort()).toEqual(['shape-internet', 'shape-person', 'shape-users']);
    for (const e of shapes) {
      expect(e.template.shape).toMatch(/^\/library\/shapes\//);
      expect(e.template.image).toBeUndefined(); // masks, not image bodies
    }
  });
});

describe('Data pack', () => {
  it('bundles a Table entry seeded with an id pk column', () => {
    const t = BUNDLED_LIBRARY.entries.find((e) => e.id === 'data-table');
    expect(t?.template.type).toBe('db-table');
    expect(t?.template.columns).toEqual([{ name: 'id', type: 'int', pk: true }]);
  });
});

describe('Activity pack', () => {
  it('bundles the activity pack', () => {
    expect(BUNDLED_LIBRARY.categories.some((c) => c.id === 'activity')).toBe(true);
    const entries = BUNDLED_LIBRARY.entries.filter((e) => e.category === 'activity');
    expect(entries.map((e) => e.template.type)).toEqual([
      'activity-frame', 'activity-action', 'activity-decision', 'activity-bar', 'activity-start',
      'activity-end', 'activity-send', 'activity-receive', 'activity-object', 'activity-note',
    ]);
    expect(entries.find((e) => e.template.type === 'activity-bar')?.template).toMatchObject({ width: 8, height: 100 });
  });
});

describe('Second-order pack', () => {
  it('bundles the second-order pack, entries keyed by the four notation type ids', () => {
    expect(BUNDLED_LIBRARY.categories.some((c) => c.id === 'second-order')).toBe(true);
    const entries = BUNDLED_LIBRARY.entries.filter((e) => e.category === 'second-order');
    expect(entries.map((e) => e.id)).toEqual([
      'so-decision', 'so-consequence-positive', 'so-consequence-negative', 'so-consequence-neutral',
    ]);
  });
});

describe('Fishbone pack', () => {
  it('bundles the fishbone pack, entries keyed by the three notation type ids', () => {
    expect(BUNDLED_LIBRARY.categories.some((c) => c.id === 'fishbone')).toBe(true);
    const entries = BUNDLED_LIBRARY.entries.filter((e) => e.category === 'fishbone');
    expect(entries.map((e) => e.id)).toEqual(['fb-effect', 'fb-category', 'fb-cause']);
  });
});

describe('Threat model pack', () => {
  const entries = BUNDLED_LIBRARY.entries.filter((e) => e.category === 'threat-model');

  it('bundles the STRIDE data-flow stencils, entries keyed by the four notation type ids', () => {
    expect(BUNDLED_LIBRARY.categories.some((c) => c.id === 'threat-model')).toBe(true);
    expect(entries.map((e) => e.id)).toEqual(['tm-entity', 'tm-process', 'tm-store', 'tm-boundary']);
  });

  it('drops each stencil at the size its DFD shape reads at', () => {
    const size = (id: string) => {
      const t = entries.find((e) => e.id === id)?.template;
      return { width: t?.width, height: t?.height };
    };
    expect(size('tm-process')).toEqual({ width: 150, height: 90 });
    expect(size('tm-store')).toEqual({ width: 150, height: 56 });
    expect(size('tm-boundary')).toEqual({ width: 320, height: 220 });
  });

  it('uses node types the renderer styles (no silent fallback to a plain box)', () => {
    for (const e of entries) {
      expect(DEFAULT_TYPE_STYLES[e.template.type!], `type '${e.template.type}'`).toBeDefined();
    }
  });
});
