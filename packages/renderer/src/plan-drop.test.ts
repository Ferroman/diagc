import { describe, expect, it } from 'vitest';
import { dropTargetAt, type DropRect } from './plan-drop';

const NONE: ReadonlySet<string> = new Set();

describe('dropTargetAt', () => {
  // child sits fully inside parent's rect — the geometry a nested zone and
  // its containing zone actually have.
  const parent: DropRect = { id: 'parent', x: 0, y: 0, w: 200, h: 200 };
  const child: DropRect = { id: 'child', x: 20, y: 20, w: 50, h: 50 };

  it('a point inside both a parent and a nested child rect resolves to the child (smaller area)', () => {
    expect(dropTargetAt({ x: 30, y: 30 }, [parent, child], NONE)).toBe('child');
    // order in the rects array must not matter
    expect(dropTargetAt({ x: 30, y: 30 }, [child, parent], NONE)).toBe('child');
  });

  it('a point inside only the parent resolves to the parent', () => {
    expect(dropTargetAt({ x: 150, y: 150 }, [parent, child], NONE)).toBe('parent');
  });

  it('an excluded id is never returned even though its rect contains the point', () => {
    // excluding the child falls back to its (still-containing) parent
    expect(dropTargetAt({ x: 30, y: 30 }, [parent, child], new Set(['child']))).toBe('parent');
    // excluding both leaves nothing
    expect(dropTargetAt({ x: 30, y: 30 }, [parent, child], new Set(['parent', 'child']))).toBeUndefined();
  });

  it('no containing rect returns undefined', () => {
    expect(dropTargetAt({ x: 500, y: 500 }, [parent, child], NONE)).toBeUndefined();
  });
});
