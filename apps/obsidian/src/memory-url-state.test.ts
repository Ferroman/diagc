import { describe, expect, it } from 'vitest';
import { memoryUrlState } from './memory-url-state';

describe('memoryUrlState', () => {
  it('stores hashes and notifies subscribers only on navigate', () => {
    const s = memoryUrlState();
    const seen: string[] = [];
    s.subscribe(() => seen.push(s.get()));
    s.set('#/a', false); // studio's own write: no notification
    expect(s.get()).toBe('#/a');
    s.navigate('#/b'); // external navigation: notify
    expect(seen).toEqual(['#/b']);
  });

  it('lets an unsubscribed callback stop receiving notifications', () => {
    const s = memoryUrlState();
    const seen: string[] = [];
    const unsubscribe = s.subscribe(() => seen.push(s.get()));
    unsubscribe();
    s.navigate('#/c');
    expect(seen).toEqual([]);
  });
});
