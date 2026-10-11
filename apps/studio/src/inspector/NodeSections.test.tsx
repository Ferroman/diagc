// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Point } from '@diagc/core/internal';
import { useMetadataDraft, usePositionDraft } from './NodeSections';

// The sections themselves are covered through NodePanel.test.tsx, the panel
// that holds their drafts; these are the two hooks it calls for them.

describe('usePositionDraft', () => {
  const setup = (saved: Point | undefined) =>
    renderHook(({ at }: { at: Point | undefined }) => usePositionDraft(at), { initialProps: { at: saved } });

  // breaks if the inputs stop starting at the saved position, or show one
  // while there is none
  it('starts at the saved position, or empty without one', () => {
    expect(setup({ x: 1, y: 2 }).result.current.x[0]).toBe('1');
    expect(setup(undefined).result.current.y[0]).toBe('');
  });

  // breaks if a re-render with the same coordinates (a new object) re-seeds,
  // or a moved position does not
  it('keeps what is typed until a coordinate changes', () => {
    const hook = setup({ x: 1, y: 2 });
    act(() => hook.result.current.x[1]('50'));
    hook.rerender({ at: { x: 1, y: 2 } });
    expect(hook.result.current.x[0]).toBe('50');
    hook.rerender({ at: { x: 1, y: 3 } });
    expect([hook.result.current.x[0], hook.result.current.y[0]]).toEqual(['1', '3']);
  });
});

describe('useMetadataDraft', () => {
  const setup = (metadata: Record<string, unknown> | undefined) =>
    renderHook(({ m }: { m: Record<string, unknown> | undefined }) => useMetadataDraft(m), {
      initialProps: { m: metadata },
    });

  // breaks if rows stop carrying their original key, or values stop being
  // read as strings
  it('seeds one row per entry, values as text, each remembering its key', () => {
    const hook = setup({ owner: 'ops', tier: 1 });
    expect(hook.result.current.rows.map(({ key, value, originalKey }) => [key, value, originalKey])).toEqual([
      ['owner', 'ops', 'owner'],
      ['tier', '1', 'tier'],
    ]);
  });

  // breaks if the rows re-seed while the metadata object stays the same, or
  // keep a stale edit when it is replaced
  it('re-seeds the rows when the metadata object changes, not otherwise', () => {
    const metadata = { owner: 'ops' };
    const hook = setup(metadata);
    act(() => hook.result.current.setRows((rows) => rows.map((r) => ({ ...r, value: 'typed' }))));
    hook.rerender({ m: metadata });
    expect(hook.result.current.rows[0]!.value).toBe('typed');
    hook.rerender({ m: { owner: 'dev' } });
    expect(hook.result.current.rows[0]!.value).toBe('dev');
  });

  // breaks if a row id is ever handed out twice, which would collide React keys
  it('never hands out a row id twice', () => {
    const hook = setup({ a: '1', b: '2' });
    const seen = new Set(hook.result.current.rows.map((r) => r.id));
    for (let i = 0; i < 3; i++) {
      const id = hook.result.current.nextRowId();
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
  });
});
