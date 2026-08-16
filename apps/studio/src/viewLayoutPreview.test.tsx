// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { model, type LayoutSettings } from '@diagramming/core';
import { mergePreview, withLayoutPreview } from './layoutPreview';

/** The exact state shape App owns, exercised without mounting the whole studio. */
function usePreview() {
  const [preview, setPreview] = useState<Record<string, LayoutSettings>>({});
  return { preview, setPreview };
}

function makeModel() {
  const m = model('v');
  m.node('a', { type: 'service' });
  return m.toJSON();
}

describe('view-mode layout preview', () => {
  it('a selection reaches the overlay handed to DiagramView, and reset undoes it', () => {
    const m = makeModel();
    const { result } = renderHook(() => usePreview());

    act(() => result.current.setPreview((p) => mergePreview(p, 'default', { algorithm: 'force' })));
    const merged = withLayoutPreview(undefined, m, undefined, result.current.preview);
    expect(merged!.settings!['default']).toEqual({ algorithm: 'force' });

    act(() => result.current.setPreview({}));
    expect(withLayoutPreview(undefined, m, undefined, result.current.preview)).toBeUndefined();
  });
});
