import { describe, expect, it } from 'vitest';
import * as diff from './index';

describe('the diff entry', () => {
  it('exports what the CLI runs a diff with', () => {
    expect(Object.keys(diff).sort()).toEqual([
      'compareDiagramSets',
      'describeDiff',
      'formatDiffJson',
      'formatDiffSummary',
      'loadDiagramSet',
      'writeDiffPages',
    ]);
  });
});
