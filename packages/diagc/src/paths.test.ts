import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { projectPaths, RELATIVE_PATHS } from './paths';

describe('projectPaths', () => {
  it('puts every place under the .diagrams folder at the root', () => {
    expect(projectPaths('/work/repo')).toEqual({
      diagramsDir: '/work/repo/.diagrams',
      srcDir: '/work/repo/.diagrams/src',
      artifactsDir: '/work/repo/.diagrams/.artifacts',
      htmlDir: '/work/repo/.diagrams/html',
      staticDir: '/work/repo/.diagrams/static',
      assetsDir: '/work/repo/.diagrams/src/assets',
      diffDir: '/work/repo/.diagrams/diff',
      includesDir: '/work/repo/.diagrams/includes',
      lockFile: '/work/repo/.diagrams/includes.lock.json',
    });
  });

  it('joins a relative root as a path: the empty string and `.` are the current directory, `..` its parent', () => {
    expect(projectPaths('')).toEqual(projectPaths('.'));
    expect(projectPaths('.')).toMatchObject({ diagramsDir: '.diagrams', srcDir: '.diagrams/src' });
    expect(projectPaths('..')).toMatchObject({
      diagramsDir: '../.diagrams',
      lockFile: '../.diagrams/includes.lock.json',
    });
    expect(projectPaths('repo/')).toMatchObject({ srcDir: 'repo/.diagrams/src' });
    expect(projectPaths('./repo/../other')).toMatchObject({ htmlDir: 'other/.diagrams/html' });
  });

  it('joins with the platform separator', () => {
    expect(projectPaths('repo').assetsDir).toBe(path.join('repo', '.diagrams', 'src', 'assets'));
  });
});

describe('RELATIVE_PATHS', () => {
  it('names each place from the root, with `/` whatever the platform', () => {
    expect(RELATIVE_PATHS).toEqual({
      diagramsDir: '.diagrams',
      srcDir: '.diagrams/src',
      artifactsDir: '.diagrams/.artifacts',
      htmlDir: '.diagrams/html',
      staticDir: '.diagrams/static',
      assetsDir: '.diagrams/src/assets',
      diffDir: '.diagrams/diff',
      includesDir: '.diagrams/includes',
      lockFile: '.diagrams/includes.lock.json',
    });
  });
});
