import type { Library, LibraryEntry } from './types';

// UML activity stencil. Lanes and regions are STRUCTURAL — they are created
// from the ActivityPanel (which parents them correctly in one batch), never
// dropped loose from the palette.
const entry = (
  id: string,
  name: string,
  keywords: string[],
  size?: { width: number; height: number },
): LibraryEntry => ({
  id,
  category: 'activity',
  name,
  keywords,
  template: { type: id, ...(size !== undefined ? size : {}) },
});

export const ACTIVITY_PACK: Library = {
  categories: [{ id: 'activity', name: 'UML · Activity', builtin: true }],
  entries: [
    entry('activity-frame', 'Activity frame', ['uml', 'activity', 'swimlane', 'frame']),
    entry('activity-action', 'Action', ['uml', 'activity', 'action', 'step', 'task']),
    entry('activity-decision', 'Decision', ['uml', 'decision', 'merge', 'diamond', 'branch'], { width: 48, height: 48 }),
    entry('activity-bar', 'Fork/join bar', ['uml', 'fork', 'join', 'synchronise', 'parallel'], { width: 8, height: 100 }),
    entry('activity-start', 'Start', ['uml', 'initial', 'start'], { width: 24, height: 24 }),
    entry('activity-end', 'End', ['uml', 'final', 'end'], { width: 28, height: 28 }),
    entry('activity-send', 'Send signal', ['uml', 'send', 'signal', 'event'], { width: 140, height: 44 }),
    entry('activity-receive', 'Receive signal', ['uml', 'receive', 'signal', 'event'], { width: 140, height: 44 }),
    entry('activity-object', 'Object', ['uml', 'object', 'artifact', 'data']),
    entry('activity-note', 'Note', ['uml', 'note', 'comment', 'annotation'], { width: 140, height: 64 }),
  ],
};
