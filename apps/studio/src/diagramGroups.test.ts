import { describe, expect, it } from 'vitest';
import { groupDiagrams, groupLabel, groupOf, leafOf } from './diagramGroups';

describe('groupOf / leafOf', () => {
  it('puts a flat name in the root group', () => {
    expect(groupOf('acme')).toBe('');
    expect(leafOf('acme')).toBe('acme');
  });

  it('splits a nested name at its last slash', () => {
    expect(groupOf('docs/fishbone')).toBe('docs');
    expect(leafOf('docs/fishbone')).toBe('fishbone');
  });

  it('keeps a deep path whole as one group', () => {
    expect(groupOf('a/b/x')).toBe('a/b');
    expect(leafOf('a/b/x')).toBe('x');
  });
});

describe('groupLabel', () => {
  it('spaces out the separators so a deep group reads as a path', () => {
    expect(groupLabel('a/b')).toBe('a / b');
  });

  it('leaves a single folder alone', () => {
    expect(groupLabel('docs')).toBe('docs');
  });
});

describe('groupDiagrams', () => {
  it('lists root diagrams first, then folders alphabetically', () => {
    const groups = groupDiagrams(['team/roadmap', 'acme', 'docs/c4', 'test']);
    expect(groups).toEqual([
      { group: '', names: ['acme', 'test'] },
      { group: 'docs', names: ['docs/c4'] },
      { group: 'team', names: ['team/roadmap'] },
    ]);
  });

  it('sorts names inside a group regardless of input order', () => {
    const groups = groupDiagrams(['docs/planes', 'docs/c4', 'docs/fishbone']);
    expect(groups).toEqual([{ group: 'docs', names: ['docs/c4', 'docs/fishbone', 'docs/planes'] }]);
  });

  it('omits the root section when every diagram is in a folder', () => {
    expect(groupDiagrams(['docs/c4']).map((g) => g.group)).toEqual(['docs']);
  });

  it('treats a deep path as its own group, not a child of the shallower one', () => {
    const groups = groupDiagrams(['a/x', 'a/b/y']);
    expect(groups.map((g) => g.group)).toEqual(['a', 'a/b']);
  });

  it('filters by case-insensitive substring of the full name', () => {
    const groups = groupDiagrams(['docs/fishbone', 'docs/c4', 'fishing'], 'FISH');
    expect(groups).toEqual([
      { group: '', names: ['fishing'] },
      { group: 'docs', names: ['docs/fishbone'] },
    ]);
  });

  it('matches on the folder part, so a group name finds its members', () => {
    const groups = groupDiagrams(['docs/c4', 'acme'], 'docs');
    expect(groups).toEqual([{ group: 'docs', names: ['docs/c4'] }]);
  });

  it('requires every whitespace-separated term to match', () => {
    const groups = groupDiagrams(['docs/fishbone', 'docs/c4', 'team/fishbone'], 'docs  fish');
    expect(groups).toEqual([{ group: 'docs', names: ['docs/fishbone'] }]);
  });

  it('drops groups the query empties', () => {
    expect(groupDiagrams(['docs/c4', 'acme'], 'zzz')).toEqual([]);
  });

  it('treats a blank query as no query', () => {
    expect(groupDiagrams(['acme'], '   ')).toEqual([{ group: '', names: ['acme'] }]);
  });
});
