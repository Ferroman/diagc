import { describe, expect, it } from 'vitest';
import { formatHash, parseHash } from './urlState';

describe('urlState', () => {
  it('round-trips a diagram and drill path', () => {
    expect(parseHash(formatHash('platform-c4', ['platform', 'core']))).toEqual({
      diagram: 'platform-c4',
      path: ['platform', 'core'],
    });
  });

  it('round-trips special characters per segment', () => {
    const diagram = 'my diagram #1';
    const path = ['a/b', 'ünïcode', '100%'];
    expect(parseHash(formatHash(diagram, path))).toEqual({ diagram, path });
  });

  it('formats an empty path as #/<diagram>', () => {
    expect(formatHash('d', [])).toBe('#/d');
    expect(parseHash('#/d')).toEqual({ diagram: 'd', path: [] });
  });

  it('tolerates trailing and doubled slashes', () => {
    expect(parseHash('#/d/')).toEqual({ diagram: 'd', path: [] });
    expect(parseHash('#/d//x')).toEqual({ diagram: 'd', path: ['x'] });
  });

  it('returns null for empty or malformed hashes', () => {
    for (const h of ['', '#', '#/', '#x', '#/%GG', 'no-hash', '#//path']) {
      expect(parseHash(h)).toBeNull();
    }
  });
});
