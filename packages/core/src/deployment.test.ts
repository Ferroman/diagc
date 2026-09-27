import { describe, expect, it } from 'vitest';
import { DEPLOY_NODE_TYPES, DEPLOY_NOTATION, DEPLOY_TYPES, DEPLOY_ZONE_TYPES, isDeployZone, isDeploymentNode } from './deployment';
import { BUILTIN_NOTATIONS } from './types';

describe('deployment vocabulary', () => {
  it('is a builtin notation', () => {
    expect(BUILTIN_NOTATIONS).toContain(DEPLOY_NOTATION);
  });

  it('keeps zones and nodes apart, all under the deploy- prefix', () => {
    expect(DEPLOY_TYPES.size).toBe(DEPLOY_ZONE_TYPES.length + DEPLOY_NODE_TYPES.length);
    for (const t of DEPLOY_TYPES) expect(t).toMatch(/^deploy-/);
  });

  it('classifies nodes by type', () => {
    expect(isDeployZone({ id: 'a', name: 'a', type: 'deploy-subnet-private' })).toBe(true);
    expect(isDeployZone({ id: 'a', name: 'a', type: 'deploy-database' })).toBe(false);
    expect(isDeploymentNode({ id: 'a', name: 'a', type: 'deploy-database' })).toBe(true);
    expect(isDeploymentNode({ id: 'a', name: 'a', type: 'c4-container' })).toBe(false);
    expect(isDeploymentNode({ id: 'a', name: 'a' })).toBe(false);
  });
});
