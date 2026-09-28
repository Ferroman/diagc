import { describe, expect, it } from 'vitest';
import { visibleColumns, withHiddenColumns } from './columns';
import type { Column } from './types';

const id: Column = { name: 'id', pk: true };
const flag: Column = { name: 'flag', type: 'text', layer: 'flags' };
const email: Column = { name: 'email' };
const audit: Column = { name: 'audited_at', layer: 'audit' };

describe('visibleColumns', () => {
  it('keeps untagged rows and rows on an active layer', () => {
    expect(visibleColumns([id, flag, email, audit], new Set(['flags']))).toEqual([id, flag, email]);
  });

  it('returns the same array when nothing is hidden', () => {
    const cols = [id, flag];
    expect(visibleColumns(cols, new Set(['flags']))).toBe(cols);
    const plain = [id, email];
    expect(visibleColumns(plain, new Set())).toBe(plain);
  });
});

describe('withHiddenColumns', () => {
  const all = [id, flag, email, audit];
  const shown = [id, email];

  it('returns the edit as is when nothing was hidden', () => {
    const edited = [id];
    expect(withHiddenColumns(all, all, edited)).toBe(edited);
  });

  it('puts hidden rows back at their original index after an in-place edit', () => {
    const renamed = { ...email, name: 'mail' };
    expect(withHiddenColumns(all, shown, [id, renamed])).toEqual([id, flag, renamed, audit]);
  });

  it('keeps hidden rows when a visible row is added or removed', () => {
    const added: Column = { name: 'new' };
    expect(withHiddenColumns(all, shown, [id, email, added])).toEqual([id, flag, email, audit, added]);
    expect(withHiddenColumns(all, shown, [id])).toEqual([id, flag, audit]);
  });
});
