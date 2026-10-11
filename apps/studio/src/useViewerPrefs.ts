import { useEffect, useState } from 'react';
import { applyTheme, darkTheme, lightTheme } from '@diagc/renderer';
import { usePersistedState } from './usePersistedState';

const STYLE_KEY = 'diagc.style';
// Snap-to-grid is a viewer preference (how one edits), not a property of the
// diagram, so it lives beside the style preset rather than in the sidecar.
const SNAP_KEY = 'diagc.snap';
/** the grid a snapped drag lands on, in pixels */
export const SNAP_GRID = 10;

export type Theme = 'light' | 'dark';

export interface ViewerPrefs {
  theme: Theme;
  toggleTheme: () => void;
  /** the app's style preset; a diagram's own style outranks it */
  style: string;
  setStyle: (style: string) => void;
  snap: boolean;
  toggleSnap: () => void;
}

/**
 * How this viewer likes the canvas drawn: the light or dark theme, the style
 * preset and snap-to-grid. The style and snap are remembered in localStorage;
 * the theme is not — a host seeds it (the Obsidian pane passes the vault's), and
 * a stored copy would fight that seed on the next mount.
 */
export function useViewerPrefs(initialTheme: Theme): ViewerPrefs {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [style, setStyle] = usePersistedState<string>(STYLE_KEY, 'clean', (raw) => raw);
  const [snap, setSnap] = usePersistedState<boolean>(SNAP_KEY, false, (raw) => (raw === null ? null : raw === 'true'));

  useEffect(() => {
    applyTheme(document.documentElement, theme === 'dark' ? darkTheme : lightTheme);
    document.documentElement.dataset['theme'] = theme;
  }, [theme]);

  return {
    theme,
    toggleTheme: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    style,
    setStyle,
    snap,
    toggleSnap: () => setSnap((v) => !v),
  };
}
