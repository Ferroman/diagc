import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { studioEnv } from './studio';

describe('studioEnv', () => {
  it('points DIAGRAMS_DIR/ARTIFACTS_DIR at the target repo and enables open', () => {
    const env = studioEnv('/work/some-repo');
    expect(env.DIAGRAMS_DIR).toBe(path.join('/work/some-repo', '.diagrams', 'src'));
    expect(env.ARTIFACTS_DIR).toBe(path.join('/work/some-repo', '.diagrams', '.artifacts'));
    expect(env.DIAGRAMS_CWD).toBe('/work/some-repo');
    expect(env.DIAGRAMS_OPEN).toBe('1');
  });
});
