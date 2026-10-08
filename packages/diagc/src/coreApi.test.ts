import { describe, expect, it } from 'vitest';

describe('@diagc/core entry points, as another package resolves them', () => {
  it('resolves @diagc/core/internal to the full internal API', async () => {
    const internal = await import('@diagc/core/internal');
    expect(typeof internal.applyCommand).toBe('function');
    expect(typeof internal.compileView).toBe('function');
    expect(typeof internal.model).toBe('function');
  });

  it('resolves @diagc/core to an entry with the builder', async () => {
    const core = await import('@diagc/core');
    expect(typeof core.model).toBe('function');
  });
});
