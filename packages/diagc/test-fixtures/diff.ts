import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { DiagramModel, Drawings, LayoutOverlay } from '@diagc/core/internal';
import { checkoutDiagrams, type CheckedOutRef } from '../src/git-ref';
import { loadDiagramSet, type DiagramSet } from '../src/diff/load';

// What the tests of diff share. It sits beside the fixtures and not in src/, which is
// what the build ships.

export function model(id: string, parts: Partial<DiagramModel>): DiagramModel {
  return { version: 1, id, name: id, nodes: [], containment: [], relations: [], layers: [], planes: [], ...parts };
}

export const v1 = model('shop', {
  nodes: [
    { id: 'web', name: 'Web', type: 'service' },
    { id: 'api', name: 'API', type: 'service' },
    { id: 'legacy', name: 'Legacy', type: 'service' },
  ],
  relations: [
    { id: 'web->api#0', from: 'web', to: 'api', kind: 'sync' },
    { id: 'web->legacy#0', from: 'web', to: 'legacy', kind: 'sync' },
  ],
});
export const v2 = model('shop', {
  nodes: [
    { id: 'web', name: 'Web', type: 'service' },
    { id: 'api', name: 'API gateway', type: 'service' },
    { id: 'db', name: 'Orders DB', type: 'database' },
  ],
  relations: [
    { id: 'web->api#0', from: 'web', to: 'api', kind: 'sync', label: 'HTTPS' },
    { id: 'api->db#0', from: 'api', to: 'db', kind: 'reads' },
  ],
});
const gone = model('gone', { nodes: [{ id: 'x', name: 'X' }] });
const fresh = model('fresh', { nodes: [{ id: 'y', name: 'Y' }] });

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args], {
    cwd,
    stdio: 'pipe',
  });

export const put = (repo: string, rel: string, data: unknown) => {
  const file = path.join(repo, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data));
};

/** A repository tagged v0 (no diagrams yet), v1 (shop, with a layout, and gone) and v2
 * (shop changed, gone deleted, fresh added in a folder), and its checkouts. */
export interface DiffRepo {
  dir: string;
  /** the diagrams at `ref`, labelled with it, from a checkout `cleanup` removes */
  setAt: (ref: string) => Promise<DiagramSet>;
  cleanup: () => Promise<void>;
}

export function diffRepo(): DiffRepo {
  const dir = mkdtempSync(path.join(tmpdir(), 'diagc-diff-repo-'));
  git(dir, 'init', '-q');
  put(dir, 'README.md', 'no diagrams yet\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'empty');
  git(dir, 'tag', 'v0');
  put(dir, '.diagrams/src/shop.diagram.json', v1);
  put(dir, '.diagrams/src/shop.layout.json', { version: 1, planes: {} });
  put(dir, '.diagrams/src/gone.diagram.json', gone);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'v1');
  git(dir, 'tag', 'v1');
  put(dir, '.diagrams/src/shop.diagram.json', v2);
  git(dir, 'rm', '-q', '.diagrams/src/gone.diagram.json');
  put(dir, '.diagrams/src/new/fresh.diagram.json', fresh);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'v2');
  git(dir, 'tag', 'v2');
  const open: CheckedOutRef[] = [];
  return {
    dir,
    setAt: async (ref) => {
      const c = await checkoutDiagrams(ref, dir);
      open.push(c);
      return loadDiagramSet(ref, c.diagramsDir);
    },
    cleanup: async () => {
      for (const c of open.splice(0)) await c.cleanup();
    },
  };
}

/** The `after` side's label: every character the overview escapes. */
export const AFTER_LABEL = 'feat/<x> & "y"';

const shopBefore = model('shop', {
  nodes: [
    { id: 'web', name: 'Web', type: 'service' },
    { id: 'api', name: 'API', type: 'service' },
    { id: 'legacy', name: 'Legacy', type: 'service' },
    { id: 'tmp', name: '' },
  ],
  relations: [
    { id: 'web->api#0', from: 'web', to: 'api', kind: 'sync' },
    { id: 'web->legacy#0', from: 'web', to: 'legacy', kind: 'sync', label: '' },
  ],
  layers: [{ id: 'old', name: 'Old' }],
  planes: [
    { id: 'main', name: 'Main' },
    { id: 'flow', name: 'Flow' },
  ],
});
const shopAfter = model('shop', {
  nodes: [
    { id: 'web', name: 'Web', type: 'webapp' },
    { id: 'api', name: 'API gateway', type: 'service', description: 'edge' },
    { id: 'db', name: 'Orders <DB>', type: 'database' },
    { id: 'note', name: '' },
  ],
  relations: [
    { id: 'web->api#0', from: 'web', to: 'api', kind: 'sync', label: 'HTTPS' },
    { id: 'api->db#0', from: 'api', to: 'db', kind: 'reads', label: 'SQL' },
  ],
  layers: [{ id: 'new', name: 'New' }],
  planes: [
    { id: 'main', name: 'Main' },
    { id: 'ops', name: 'Ops' },
  ],
});
export const SHOP_LAYOUT = { version: 1, planes: {} } as LayoutOverlay;
export const SHOP_DRAWINGS = { version: 1, planes: { main: [{ id: 's1', points: [0, 0, 10, 10] }] } } as Drawings;

/**
 * Two sides with a diagram of each status, built in memory: `broken` does not compile
 * after, `gone` is removed, `new/fresh` added, `same` unchanged, and `shop` changes in
 * every way a change list has a line for. Each side names a sidecar it left out.
 */
export function everyStatus(diagramsDir = ''): { before: DiagramSet; after: DiagramSet } {
  const same = model('same', { nodes: [{ id: 'z', name: 'Z' }] });
  return {
    before: {
      label: 'v1',
      diagramsDir,
      versions: new Map([
        ['gone', { model: model('gone', { nodes: [{ id: 'x', name: 'X' }] }) }],
        ['same', { model: same }],
        ['shop', { model: shopBefore, layout: SHOP_LAYOUT, drawings: SHOP_DRAWINGS }],
      ]),
      errors: new Map(),
      warnings: ['shop.drawings.json at v1: not a drawings overlay — compared and drawn without it'],
    },
    after: {
      label: AFTER_LABEL,
      diagramsDir,
      versions: new Map([
        ['new/fresh', { model: model('fresh', { nodes: [{ id: 'y', name: 'Y' }] }) }],
        ['same', { model: same }],
        ['shop', { model: shopAfter }],
      ]),
      errors: new Map([['broken', 'bad <json>']]),
      warnings: [`shop.layout.json at ${AFTER_LABEL}: does not parse (oops) — compared and drawn without it`],
    },
  };
}

/** `shop`'s change list in `everyStatus`. */
export const SHOP_CHANGES = [
  '+ Orders <DB> [database]',
  '+ note',
  '- Legacy [service]',
  '- tmp',
  '~ Web: type',
  '~ API -> API gateway (renamed): description',
  '+ API gateway -> Orders <DB> (reads: SQL)',
  '- Web -> Legacy (sync)',
  '~ Web -> API gateway (sync: HTTPS): label',
  '+ layer new',
  '- layer old',
  '+ plane ops',
  '- plane flow',
];
