import { useMemo, useRef, useState, type RefObject } from 'react';
import { usePersistedState } from '../usePersistedState';
import { isMac } from './chord';
import { HOTKEYS_KEY, parseOverrides, resolveKeymap, type Keymap, type Overrides } from './keymap';

export interface HotkeyPrefs {
  /** the bindings the user changed; everything else keeps its default */
  overrides: Overrides;
  setOverrides: (overrides: Overrides) => void;
  /** the defaults with the overrides applied */
  keymap: Keymap;
  mac: boolean;
  /** the shortcuts dialog is open */
  dialogOpen: boolean;
  openDialog: () => void;
  /** close the dialog and hand focus back to the button that opened it */
  closeDialog: () => void;
  /** the topbar's ⚙ button */
  gearRef: RefObject<HTMLButtonElement | null>;
}

/**
 * The keyboard shortcuts as this viewer has bound them, and the dialog that
 * rebinds them. Viewer state like the theme: only what the user changed is
 * stored, so a default added later still reaches them (see keymap).
 */
export function useHotkeyPrefs(): HotkeyPrefs {
  const [overrides, setOverrides] = usePersistedState<Overrides>(HOTKEYS_KEY, {}, parseOverrides, JSON.stringify);
  const keymap = useMemo(() => resolveKeymap(overrides), [overrides]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const mac = useMemo(isMac, []);
  const gearRef = useRef<HTMLButtonElement>(null);

  return {
    overrides,
    setOverrides,
    keymap,
    mac,
    dialogOpen,
    openDialog: () => setDialogOpen(true),
    closeDialog: () => {
      setDialogOpen(false);
      gearRef.current?.focus(); // back where the keyboard user came from
    },
    gearRef,
  };
}
