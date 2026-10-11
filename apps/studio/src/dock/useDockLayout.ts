import { useState, type Dispatch, type SetStateAction } from 'react';
import { usePersistedState } from '../usePersistedState';
import { EMPTY_LIBRARY_VIEW, type LibraryView } from '../library/LibraryPanel';
import type { InspectorTab } from '../inspector/InspectorTabs';
import { clampDockWidth } from './dockWidth';

// The right details dock defaults open, but a collapse is remembered so it stays
// out of the way across reloads once dismissed.
const RIGHT_DOCK_KEY = 'diagc.rightDock';
const LEFT_DOCK_KEY = 'diagc.leftDock';
const LEFT_WIDTH_KEY = 'diagc.leftDockWidth';
const RIGHT_WIDTH_KEY = 'diagc.rightDockWidth';
export const DOCK_MAX = 560;
export const LEFT_MIN = 220;
export const RIGHT_MIN = 240;
const LEFT_DEFAULT = 300;
const RIGHT_DEFAULT = 320;

// The dock widths persist clamped; a garbage/non-numeric stored value falls back
// to the default (readDockWidth semantics), so the persisted reader returns null
// for such values and usePersistedState applies its fallback.
const readClampedWidth = (raw: string | null, min: number, max: number): number | null => {
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? clampDockWidth(n, min, max) : null;
};

// The dock collapse states persist with an on-disk format that predates
// usePersistedState ('collapsed'/'expanded'), so both reader and serializer use it.
const readCollapsed = (raw: string | null) => raw === 'collapsed';
const writeCollapsed = (v: boolean) => (v ? 'collapsed' : 'expanded');

export interface DockLayout {
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  toggleLeft: () => void;
  toggleRight: () => void;
  leftWidth: number;
  rightWidth: number;
  setLeftWidth: (px: number) => void;
  setRightWidth: (px: number) => void;
  /** the left dock's inspector tab while editing */
  leftTab: InspectorTab;
  selectTab: (tab: InspectorTab) => void;
  /** a tab nobody can see is no answer to "show me Properties": this opens the dock too */
  showInspectorTab: (tab: InspectorTab) => void;
  /** The Library tab's search and open sections, here rather than in the panel:
   * the inspector mounts only its active tab, so panel-local state would reset
   * on every trip to Properties and back. */
  libraryView: [LibraryView, Dispatch<SetStateAction<LibraryView>>];
}

/** The two side docks: whether each is folded, how wide it is (both remembered
 * across reloads) and which inspector tab the left one shows. */
export function useDockLayout(): DockLayout {
  const [leftTab, setLeftTab] = useState<InspectorTab>('properties');
  const libraryView = useState(EMPTY_LIBRARY_VIEW);
  const [leftCollapsed, setLeftCollapsed] = usePersistedState<boolean>(
    LEFT_DOCK_KEY,
    false,
    readCollapsed,
    writeCollapsed,
  );
  const [rightCollapsed, setRightCollapsed] = usePersistedState<boolean>(
    RIGHT_DOCK_KEY,
    false,
    readCollapsed,
    writeCollapsed,
  );
  const [leftWidth, setLeftWidth] = usePersistedState<number>(LEFT_WIDTH_KEY, LEFT_DEFAULT, (raw) =>
    readClampedWidth(raw, LEFT_MIN, DOCK_MAX),
  );
  const [rightWidth, setRightWidth] = usePersistedState<number>(RIGHT_WIDTH_KEY, RIGHT_DEFAULT, (raw) =>
    readClampedWidth(raw, RIGHT_MIN, DOCK_MAX),
  );

  return {
    leftCollapsed,
    rightCollapsed,
    toggleLeft: () => setLeftCollapsed((v) => !v),
    toggleRight: () => setRightCollapsed((v) => !v),
    leftWidth,
    rightWidth,
    setLeftWidth,
    setRightWidth,
    leftTab,
    selectTab: setLeftTab,
    showInspectorTab: (tab) => {
      setLeftTab(tab);
      setLeftCollapsed(false);
    },
    libraryView,
  };
}
