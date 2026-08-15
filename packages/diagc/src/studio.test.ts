import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { openCommand, studioEnv } from './studio';

describe('studioEnv', () => {
  it('points DIAGRAMS_DIR/ARTIFACTS_DIR at the target repo and enables open', () => {
    const env = studioEnv('/work/some-repo');
    expect(env.DIAGRAMS_DIR).toBe(path.join('/work/some-repo', '.diagrams', 'src'));
    expect(env.ARTIFACTS_DIR).toBe(path.join('/work/some-repo', '.diagrams', '.artifacts'));
    expect(env.DIAGRAMS_CWD).toBe('/work/some-repo');
    expect(env.DIAGRAMS_OPEN).toBe('1');
  });
});

describe('openCommand', () => {
  it('uses the platform opener', () => {
    expect(openCommand('darwin')).toEqual({ cmd: 'open', args: [] });
    expect(openCommand('linux')).toEqual({ cmd: 'xdg-open', args: [] });
    // `start` treats a bare first argument as the window title, so it needs an
    // empty one before the URL.
    expect(openCommand('win32')).toEqual({ cmd: 'cmd', args: ['/c', 'start', ''] });
  });
});
