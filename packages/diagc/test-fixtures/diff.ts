import type { DiagramModel, Drawings, LayoutOverlay } from '@diagc/core/internal';
import type { DiagramSet } from '../src/diff';

// What the tests of diff share. It sits beside the fixtures and not in src/, which is
// what the build ships.

export function model(id: string, parts: Partial<DiagramModel>): DiagramModel {
  return { version: 1, id, name: id, nodes: [], containment: [], relations: [], layers: [], planes: [], ...parts };
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
