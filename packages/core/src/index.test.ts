import { describe, expect, it } from 'vitest';
import { CORE_VERSION } from './index';

describe('workspace smoke', () => {
  it('runs tests against core package source', () => {
    expect(CORE_VERSION).toBe(1);
  });
});
