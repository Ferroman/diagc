import { describe, expect, it, vi } from 'vitest';
import { readOnlyMenuItems } from './readOnlyMenuItems';

describe('readOnlyMenuItems', () => {
  it('offers Open source and Copy to editable diagram, in that order, naming the copy key', () => {
    const duplicateDiagram = vi.fn(async () => {});
    const openSource = vi.fn();
    const items = readOnlyMenuItems({
      source: 'shop.diagram.ts',
      actions: { duplicateDiagram },
      openSource,
      hint: (id) => ` [${id}]`,
    });
    expect(items.map((i) => [i.id, i.label])).toEqual([
      ['open-source', 'Open source'],
      ['copy', 'Copy to editable diagram'],
    ]);
    expect(items.map((i) => i.title)).toEqual([
      'Open shop.diagram.ts, the TypeScript this diagram is compiled from',
      'Copy this diagram — layout and all — to a new editable one and open it [diagram.duplicate]',
    ]);
    for (const item of items) item.onSelect();
    expect(openSource).toHaveBeenCalledTimes(1);
    expect(duplicateDiagram).toHaveBeenCalledTimes(1);
  });

  it('offers only the copy when the source is not known', () => {
    const items = readOnlyMenuItems({
      source: undefined,
      actions: { duplicateDiagram: vi.fn(async () => {}) },
      openSource: vi.fn(),
      hint: () => '',
    });
    expect(items.map((i) => i.id)).toEqual(['copy']);
  });
});
