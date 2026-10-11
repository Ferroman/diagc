// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useDraftField } from './useDraftField';

function setup(stored: string | undefined, whenMissing?: 'clear' | 'keep') {
  let renders = 0;
  const hook = renderHook(
    ({ value }: { value: string | undefined }) => {
      renders++;
      return useDraftField(value, whenMissing);
    },
    { initialProps: { value: stored } },
  );
  return {
    draft: () => hook.result.current[0],
    type: (text: string) => act(() => hook.result.current[1](text)),
    // renders since the last call
    store: (value: string | undefined) => {
      renders = 0;
      hook.rerender({ value });
      return renders;
    },
  };
}

describe('useDraftField', () => {
  // breaks if the draft is seeded from anything but the stored value, '' for absent
  it('starts at the stored value, or empty when there is none', () => {
    expect(setup('stored').draft()).toBe('stored');
    expect(setup(undefined).draft()).toBe('');
  });

  // breaks if a re-render that keeps the stored value refreshes the draft
  it('keeps what is typed while the stored value stays', () => {
    const field = setup('stored');
    field.type('typed');
    expect(field.store('stored')).toBe(1);
    expect(field.draft()).toBe('typed');
  });

  // breaks if a new stored value no longer replaces the draft, or replaces it
  // during render instead of in an effect after it (one render fewer)
  it('takes a new stored value in the render after the one that brought it', () => {
    const field = setup('stored');
    field.type('typed');
    expect(field.store('undone')).toBe(2);
    expect(field.draft()).toBe('undone');
  });

  // breaks if the refresh keys on the shown value ('' for absent)
  it('counts absent to empty as a change', () => {
    const field = setup(undefined);
    field.type('typed');
    field.store('');
    expect(field.draft()).toBe('');
  });

  // breaks if an absent value stops clearing an optional field
  it('clears the draft when the stored value goes away', () => {
    const field = setup('stored');
    expect(field.store(undefined)).toBe(2);
    expect(field.draft()).toBe('');
  });

  // breaks if `keep` clears (or re-renders) while the value is absent, or
  // stops following the value when it comes back
  it('with keep, leaves the draft alone while the value is absent', () => {
    const field = setup('stored', 'keep');
    field.type('typed');
    expect(field.store(undefined)).toBe(1);
    expect(field.draft()).toBe('typed');
    field.store('back');
    expect(field.draft()).toBe('back');
  });
});
