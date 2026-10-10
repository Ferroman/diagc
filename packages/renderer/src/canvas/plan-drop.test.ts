import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import { dropExclusions, dropTargetAt, type DropRect } from './plan-drop';

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

describe('dropExclusions', () => {
  // zone a holds task, which holds sub, which holds leaf; zone b is unrelated
  const node = (id: string, parentId?: string): Node => ({ id, position: { x: 0, y: 0 }, data: {}, parentId });
  const nodes = [node('a'), node('task', 'a'), node('sub', 'task'), node('leaf', 'sub'), node('b'), node('other', 'a')];

  it('excludes the dragged box, its parent and every descendant, but not a sibling', () => {
    expect([...dropExclusions(nodes, 'task', [])].sort()).toEqual(['a', 'leaf', 'sub', 'task']);
  });

  it('adds what the notation says the box is related to already', () => {
    expect(dropExclusions(nodes, 'task', ['b']).has('b')).toBe(true);
  });

  it('excludes only itself for a top-level box with no children', () => {
    expect([...dropExclusions(nodes, 'b', [])]).toEqual(['b']);
  });
});
