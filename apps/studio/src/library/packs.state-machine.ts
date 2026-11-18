import {
  SM_BAR_TYPE,
  SM_CHOICE_TYPE,
  SM_DEEP_HISTORY_TYPE,
  SM_ENTRY_TYPE,
  SM_EXIT_TYPE,
  SM_FINAL_TYPE,
  SM_HISTORY_TYPE,
  SM_INITIAL_TYPE,
  SM_JUNCTION_TYPE,
  SM_MACHINE_TYPE,
  SM_REGION_TYPE,
  SM_ZONE_TYPE,
  SM_STATE_TYPE,
  SM_TERMINATE_TYPE,
  type BoxSize,
} from '@diagc/core/internal';
import type { Library, LibraryEntry } from './types';

const entry = (type: string, name: string, keywords: string[], size: BoxSize): LibraryEntry => ({
  id: type,
  category: 'state-machine',
  name,
  keywords: [...keywords, 'state machine', 'uml'],
  template: { type, ...size },
});

/** The UML state-machine stencils. The glyph sizes are the renderer's
 * `defaultSize`s, so a dropped pseudostate is the size it draws at anywhere
 * else; a test pins the two together. */
export const STATE_MACHINE_PACK: Library = {
  categories: [{ id: 'state-machine', name: 'UML · State machine', builtin: true }],
  entries: [
    entry(SM_MACHINE_TYPE, 'State machine', ['machine', 'frame', 'fsm'], { width: 480, height: 320 }),
    entry(SM_STATE_TYPE, 'State', ['state', 'composite'], { width: 140, height: 60 }),
    entry(SM_REGION_TYPE, 'Region', ['region', 'orthogonal', 'concurrent'], { width: 360, height: 160 }),
    entry(SM_ZONE_TYPE, 'Zone', ['zone', 'phase', 'stage', 'area'], { width: 360, height: 160 }),
    entry(SM_INITIAL_TYPE, 'Initial', ['initial', 'start', 'pseudostate'], { width: 24, height: 24 }),
    entry(SM_FINAL_TYPE, 'Final', ['final', 'end', 'stop'], { width: 24, height: 24 }),
    entry(SM_CHOICE_TYPE, 'Choice', ['choice', 'decision', 'branch', 'pseudostate'], { width: 48, height: 48 }),
    entry(SM_JUNCTION_TYPE, 'Junction', ['junction', 'merge', 'pseudostate'], { width: 14, height: 14 }),
    entry(SM_BAR_TYPE, 'Fork / join', ['fork', 'join', 'bar', 'sync', 'pseudostate'], { width: 8, height: 100 }),
    entry(SM_HISTORY_TYPE, 'History', ['history', 'shallow', 'pseudostate'], { width: 28, height: 28 }),
    entry(SM_DEEP_HISTORY_TYPE, 'Deep history', ['history', 'deep', 'pseudostate'], { width: 28, height: 28 }),
    entry(SM_ENTRY_TYPE, 'Entry point', ['entry', 'point', 'pseudostate'], { width: 16, height: 16 }),
    entry(SM_EXIT_TYPE, 'Exit point', ['exit', 'point', 'pseudostate'], { width: 16, height: 16 }),
    entry(SM_TERMINATE_TYPE, 'Terminate', ['terminate', 'kill', 'pseudostate'], { width: 20, height: 20 }),
  ],
};
