import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { diffOutDir, parseRange, publishDirs } from './cli';

describe('publish directories', () => {
  it('compiles into the default artifacts directory without --out', () => {
    expect(publishDirs({ out: '.diagrams/.artifacts' })).toEqual({
      srcDir: '.diagrams/src',
      artifactsDir: '.diagrams/.artifacts',
      htmlDir: '.diagrams/html',
      staticDir: '.diagrams/static',
      assetsDir: path.join('.diagrams/src', 'assets'),
    });
  });

  it('compiles into --out and reads the pages from there, leaving the pages and images where they were', () => {
    expect(publishDirs({ out: 'build/artifacts' })).toMatchObject({
      artifactsDir: 'build/artifacts',
      htmlDir: '.diagrams/html',
      staticDir: '.diagrams/static',
    });
  });
});

describe('diff arguments', () => {
  it('reads A..B as a range and a lone ref as against the working tree', () => {
    expect(parseRange('v1.0..v2.0')).toEqual({ from: 'v1.0', to: 'v2.0' });
    expect(parseRange('HEAD~3')).toEqual({ from: 'HEAD~3' });
    expect(() => parseRange('v1..')).toThrow('is not a range');
    expect(() => parseRange('v1...v2')).toThrow('is not a range');
  });

  it('names the output directory after the range', () => {
    expect(diffOutDir('v1.0', 'feature/x')).toBe('.diagrams/diff/v1.0..feature-x');
    expect(diffOutDir('HEAD~3', undefined)).toBe('.diagrams/diff/HEAD-3..working-tree');
  });
});
