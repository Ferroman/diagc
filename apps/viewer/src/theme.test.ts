// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { THEME_STORAGE_KEY } from '@diagc/renderer';
import { canSwitchTheme, nextStored, readStoredTheme, resolveTheme, writeStoredTheme, type ThemeInputs } from './theme';

const base: ThemeInputs = { exportMode: false, param: null, stored: undefined, systemDark: false };

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('resolveTheme', () => {
  it('follows the system when nothing else speaks', () => {
    expect(resolveTheme(base)).toBe('light');
    expect(resolveTheme({ ...base, systemDark: true })).toBe('dark');
  });

  it('puts the remembered choice above the system', () => {
    expect(resolveTheme({ ...base, stored: 'dark' })).toBe('dark');
    expect(resolveTheme({ ...base, stored: 'light', systemDark: true })).toBe('light');
  });

  it('puts the URL above the remembered choice', () => {
    expect(resolveTheme({ ...base, param: 'dark', stored: 'light' })).toBe('dark');
    expect(resolveTheme({ ...base, param: 'light', stored: 'dark', systemDark: true })).toBe('light');
  });

  it('ignores a theme parameter it does not know', () => {
    expect(resolveTheme({ ...base, param: 'purple', stored: 'dark' })).toBe('dark');
    expect(resolveTheme({ ...base, param: '' })).toBe('light');
  });

  it('keeps an export light above everything', () => {
    expect(resolveTheme({ exportMode: true, param: 'dark', stored: 'dark', systemDark: true })).toBe('light');
  });
});

describe('canSwitchTheme', () => {
  it('lets the reader switch on a plain page', () => {
    expect(canSwitchTheme(base)).toBe(true);
    expect(canSwitchTheme({ ...base, param: 'purple' })).toBe(true);
  });

  it('offers no switch in an export, or where the URL sets the theme', () => {
    expect(canSwitchTheme({ ...base, exportMode: true })).toBe(false);
    expect(canSwitchTheme({ ...base, param: 'dark' })).toBe(false);
  });
});

describe('nextStored', () => {
  it('stores the other theme when it differs from the system', () => {
    expect(nextStored('light', false)).toBe('dark');
    expect(nextStored('dark', true)).toBe('light');
  });

  it("stores nothing when the other theme is the system's own", () => {
    expect(nextStored('dark', false)).toBeUndefined();
    expect(nextStored('light', true)).toBeUndefined();
  });
});

describe('the remembered choice', () => {
  it('round-trips through localStorage, under the shared key', () => {
    writeStoredTheme('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(readStoredTheme()).toBe('dark');
    writeStoredTheme(undefined);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(readStoredTheme()).toBeUndefined();
  });

  it('reads nothing from a value it does not know', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'purple');
    expect(readStoredTheme()).toBeUndefined();
  });

  it('survives a store that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readStoredTheme()).toBeUndefined();
    expect(() => writeStoredTheme('dark')).not.toThrow();
    expect(() => writeStoredTheme(undefined)).not.toThrow();
  });
});
