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

describe('urlState — the team view', () => {
  it('a hash round-trips grouping and hidden ids', () => {
    const view = { grouped: true, hidden: ['t/1', '__unassigned__', 'a,b'] };
    const hash = formatHash('plan', ['zone'], view);
    expect(hash).toContain('?group=1&hide=');
    expect(parseHash(hash)).toEqual({ diagram: 'plan', path: ['zone'], ...view });
  });

  it('writes nothing for the default view', () => {
    expect(formatHash('plan', ['z'], { grouped: false, hidden: [] })).toBe('#/plan/z');
  });

  it('an old hash without them still parses', () => {
    expect(parseHash('#/plan/zone')).toEqual({ diagram: 'plan', path: ['zone'] });
  });

  it('hide alone still parses', () => {
    expect(parseHash('#/plan?hide=a')).toEqual({ diagram: 'plan', path: [], hidden: ['a'] });
  });
});
