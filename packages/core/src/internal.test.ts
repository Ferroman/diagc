import { describe, expect, it } from 'vitest';
import * as internal from './internal';

describe('the internal entry point', () => {
  it('leaves out what only core’s own tests use', () => {
    // The entry point is for the renderer, the studio and the CLI; a test that
    // needs one of these imports it from its module.
    const testOnly = [
      'commentsOf',
      'estimateSizes',
      'CONTAINER_PADDING',
      'CONTAINER_HEADER',
      'EXTERNAL_STUB_PREFIX',
      'MAX_INCLUDE_DEPTH',
      'GIT_KINDS',
      'DEPLOY_NOTATION',
      'DEPLOY_TYPES',
      'isDeploymentNode',
      'isDeployZone',
    ];
    expect(testOnly.filter((name) => name in internal)).toEqual([]);
  });
});
