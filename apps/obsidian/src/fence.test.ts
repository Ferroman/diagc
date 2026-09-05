import { describe, expect, it } from 'vitest';
import { parseFence } from './fence';

describe('parseFence', () => {
  it('parses a full fence', () => {
    expect(parseFence('name: aws\nplane: deploy\nlayers: sec, ops\nroot: vpc\nheight: 300')).toEqual({
      name: 'aws', plane: 'deploy', layers: ['sec', 'ops'], root: 'vpc', height: 300,
    });
  });
  it('requires name and defaults height', () => {
    expect(parseFence('height: 200')).toEqual({ error: "Missing 'name'" });
    expect(parseFence('name: x')).toEqual({ name: 'x', height: 480 });
  });
  it('rejects unknown keys and bad heights', () => {
    expect(parseFence('name: x\nnope: y')).toEqual({ error: "Unknown key 'nope'" });
    expect(parseFence('name: x\nheight: tall')).toEqual({ error: "Invalid height 'tall'" });
  });
  it('skips blank lines and # comments', () => {
    expect(parseFence('# a diagram\nname: x\n\n# trailing comment\nheight: 300')).toEqual({
      name: 'x', height: 300,
    });
  });
});
