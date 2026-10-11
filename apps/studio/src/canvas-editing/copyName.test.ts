import { describe, expect, it } from 'vitest';
import { nextCopyName } from './copyName';

describe('nextCopyName', () => {
  it('appends -copy when the name is free', () => {
    expect(nextCopyName('docs-pipeline', new Set(['docs-pipeline']))).toBe('docs-pipeline-copy');
  });

  it('numbers the copy when -copy is taken', () => {
    expect(nextCopyName('docs-pipeline', new Set(['docs-pipeline', 'docs-pipeline-copy']))).toBe(
      'docs-pipeline-copy-2',
    );
  });

  it('skips every taken number in order', () => {
    const taken = new Set(['sketch', 'sketch-copy', 'sketch-copy-2', 'sketch-copy-3']);
    expect(nextCopyName('sketch', taken)).toBe('sketch-copy-4');
  });

  it('bumps the number instead of stacking suffixes on a copy of a copy', () => {
    expect(nextCopyName('sketch-copy', new Set(['sketch', 'sketch-copy']))).toBe('sketch-copy-2');
  });

  it('bumps from a numbered copy without re-suffixing', () => {
    const taken = new Set(['sketch', 'sketch-copy', 'sketch-copy-2']);
    expect(nextCopyName('sketch-copy-2', taken)).toBe('sketch-copy-3');
  });

  it('keeps a nested name in its folder', () => {
    expect(nextCopyName('docs/pipeline', new Set(['docs/pipeline']))).toBe('docs/pipeline-copy');
  });

  it('leaves a name that merely contains "copy" alone', () => {
    // `-copy` is only a suffix marker; a name that ends in a word like
    // "hardcopy" is not a copy of anything and keeps its whole root.
    expect(nextCopyName('hardcopy', new Set(['hardcopy']))).toBe('hardcopy-copy');
  });
});
