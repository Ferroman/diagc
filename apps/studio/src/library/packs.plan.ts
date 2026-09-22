import type { Library, LibraryEntry } from './types';

const entry = (id: string, type: string, name: string, keywords: string[]): LibraryEntry => ({
  id,
  category: 'plan',
  name,
  keywords,
  template: { type },
});

/** Plan (schedule) stencils. A zone carries no size: the plan layout sizes it
 * from its dates, and dropping one seeds two weeks at the pointer's date. */
export const PLAN_PACK: Library = {
  categories: [{ id: 'plan', name: 'Plan', builtin: true }],
  entries: [
    entry('plan-zone', 'plan-zone', 'Zone', ['zone', 'phase', 'bar', 'gantt', 'schedule', 'plan', 'task']),
    entry('plan-event', 'plan-event', 'Event', ['event', 'milestone', 'date', 'diamond', 'plan']),
    entry('plan-person', 'person', 'Person', ['person', 'owner', 'executor', 'checker', 'role', 'plan']),
  ],
};
