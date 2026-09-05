import { describe, expect, it } from 'vitest';
import { parseWikilink } from './wikilink';

describe('parseWikilink', () => {
  it('parses wikilinks and rejects non-wikilinks', () => {
    expect(parseWikilink('[[Ops Runbook]]')).toBe('Ops Runbook');
    expect(parseWikilink('[[Note|alias]]')).toBe('Note');
    expect(parseWikilink('[[Note#Section]]')).toBe('Note#Section');
    expect(parseWikilink('https://x.test')).toBeNull();
    expect(parseWikilink('[[]]')).toBeNull();
  });
});
