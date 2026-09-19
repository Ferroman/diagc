import type { Library, LibraryEntry } from './types';

const entry = (id: string, name: string, keywords: string[], size?: { width: number; height: number }): LibraryEntry => ({
  id,
  category: 'threat-model',
  name,
  keywords,
  template: { type: id, ...(size ?? {}) },
});

/** The STRIDE data-flow stencils. A dropped boundary is an empty box: nest
 * elements into it with the Memberships picker (drag-to-reparent is a
 * deliberate non-feature — see DEFERRALS). */
export const THREAT_MODEL_PACK: Library = {
  categories: [{ id: 'threat-model', name: 'Threat model', builtin: true }],
  entries: [
    entry('tm-entity', 'External entity', ['entity', 'actor', 'user', 'external', 'dfd', 'stride', 'threat']),
    entry('tm-process', 'Process', ['process', 'service', 'dfd', 'stride', 'threat'], { width: 150, height: 90 }),
    entry('tm-store', 'Data store', ['store', 'database', 'file', 'dfd', 'stride', 'threat'], { width: 150, height: 56 }),
    entry('tm-boundary', 'Trust boundary', ['boundary', 'trust', 'zone', 'dfd', 'stride', 'threat'], { width: 320, height: 220 }),
  ],
};
