import { useCallback, useEffect, useState } from 'react';
import { THEME_STORAGE_KEY } from '@diagc/renderer';

export type Theme = 'light' | 'dark';

const isTheme = (v: unknown): v is Theme => v === 'light' || v === 'dark';

export interface ThemeInputs {
  /** `?export`: the PNG render, and the frames of the diff overview */
  exportMode: boolean;
  /** `?theme=` as written, valid or not */
  param: string | null;
  /** the reader's remembered choice */
  stored: Theme | undefined;
  systemDark: boolean;
}

/**
 * Which theme a published page shows. First match wins: an export is light (a committed
 * picture must not depend on who rendered it); then the URL, for a page embedded on
 * another host; then the remembered choice; then the system.
 */
export function resolveTheme({ exportMode, param, stored, systemDark }: ThemeInputs): Theme {
  if (exportMode) return 'light';
  if (isTheme(param)) return param;
  return stored ?? (systemDark ? 'dark' : 'light');
}

/** Whether the reader may switch. Not in an export, and not where the URL sets the theme:
 * there the embedding page owns it, and a switch would fight the next reload. */
export function canSwitchTheme({ exportMode, param }: Pick<ThemeInputs, 'exportMode' | 'param'>): boolean {
  return !exportMode && !isTheme(param);
}

/**
 * What a click on the switch leaves remembered. The click goes to the other theme; when
 * that is the system's own, nothing is kept, so the page is back to following the system.
 * That is how a two-state button gets by without a third "system" state.
 */
export function nextStored(current: Theme, systemDark: boolean): Theme | undefined {
  const next: Theme = current === 'dark' ? 'light' : 'dark';
  return next === (systemDark ? 'dark' : 'light') ? undefined : next;
}

// A store can throw on any access: a page framed with storage blocked, some file:// setups.
export function readStoredTheme(): Theme | undefined {
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(v) ? v : undefined;
  } catch {
    return undefined;
  }
}

export function writeStoredTheme(theme: Theme | undefined): void {
  try {
    if (theme === undefined) window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The choice then lives in this page's state only.
  }
}

const DARK_QUERY = '(prefers-color-scheme: dark)';
// jsdom, and a very old browser, have no matchMedia: that reads as a light system.
const darkQuery = (): MediaQueryList | undefined =>
  typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : undefined;

/**
 * The page's theme, kept current: it follows the system while nothing is remembered, and
 * follows the remembered choice when another tab — or the page this one is framed in —
 * changes it. `toggle` is absent where the reader may not switch.
 */
export function useTheme(exportMode: boolean): { theme: Theme; toggle?: () => void } {
  const [param] = useState(() => new URLSearchParams(window.location.search).get('theme'));
  const [stored, setStored] = useState<Theme | undefined>(readStoredTheme);
  const [systemDark, setSystemDark] = useState(() => darkQuery()?.matches ?? false);

  useEffect(() => {
    const mq = darkQuery();
    if (mq === undefined) return;
    const onChange = (e: MediaQueryListEvent): void => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    // `key` is null when the whole store was cleared.
    const onStorage = (e: StorageEvent): void => {
      if (e.key === null || e.key === THEME_STORAGE_KEY) setStored(readStoredTheme());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const theme = resolveTheme({ exportMode, param, stored, systemDark });
  const toggle = useCallback(() => {
    const next = nextStored(theme, systemDark);
    writeStoredTheme(next);
    setStored(next);
  }, [theme, systemDark]);
  return canSwitchTheme({ exportMode, param }) ? { theme, toggle } : { theme };
}
