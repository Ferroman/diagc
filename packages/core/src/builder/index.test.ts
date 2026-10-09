import { describe, expect, it, vi } from 'vitest';

// The notation and activity builders extend NodeRef and import ModelBuilder as a type
// only. Were node-ref.ts to import a value from model-builder.ts, an importer that
// reached node-ref.ts first would run `class … extends NodeRef` before NodeRef
// exists, and the package would fail as it loads. So each module must load on its
// own, from an empty module registry.
const MODULES: Record<string, () => Promise<Record<string, unknown>>> = {
  'builder/node-ref': () => import('./node-ref'),
  'builder/model-builder': () => import('./model-builder'),
  'builder/index': () => import('./index'),
  'activity/builder': () => import('../activity/builder'),
  'notations/git-graph/builder': () => import('../notations/git-graph/builder'),
  'notations/second-order/builder': () => import('../notations/second-order/builder'),
  'notations/fishbone/builder': () => import('../notations/fishbone/builder'),
  'notations/threat-model/builder': () => import('../notations/threat-model/builder'),
  'notations/plan/builder': () => import('../notations/plan/builder'),
};

describe('the builder modules', () => {
  it.each(Object.keys(MODULES))('%s loads on its own', async (name) => {
    vi.resetModules();
    const exports = await MODULES[name]!();
    expect(Object.values(exports).length).toBeGreaterThan(0);
    for (const value of Object.values(exports)) expect(value).toBeDefined();
  });
});
