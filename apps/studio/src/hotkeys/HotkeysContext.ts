import { createContext, useContext } from 'react';
import type { ActionId } from './actions';
import { formatChord } from './chord';
import { resolveKeymap, type Keymap } from './keymap';

export interface HotkeysContextValue {
  keymap: Keymap;
  mac: boolean;
}

// The default is the DEFAULT keymap, not an empty one: a component rendered on
// its own (a unit test, a storybook) still says "Draw freehand (P)".
export const HotkeysContext = createContext<HotkeysContextValue>({ keymap: resolveKeymap({}), mac: false });

/** an action's first key as the user reads it — 'P' — or '' when it has none */
export const keyName = (keymap: Keymap, id: ActionId, mac: boolean): string => {
  const chord = keymap[id][0];
  return chord === undefined ? '' : formatChord(chord, mac);
};

/** the same, ready to append to a button's title: ' (P)' or '' */
export const keyHint = (keymap: Keymap, id: ActionId, mac: boolean): string => {
  const name = keyName(keymap, id, mac);
  return name === '' ? '' : ` (${name})`;
};

/** Titles used to spell their key out by hand; a rebindable key would make that a lie. */
export function useKeyHint(): (id: ActionId) => string {
  const { keymap, mac } = useContext(HotkeysContext);
  return (id) => keyHint(keymap, id, mac);
}
