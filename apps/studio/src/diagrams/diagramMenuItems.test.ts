import { describe, expect, it, vi } from 'vitest';
import { diagramMenuItems, type DiagramMenuContext } from './diagramMenuItems';

const context = (over: Partial<DiagramMenuContext> = {}): DiagramMenuContext => ({
  owned: true,
  hasModel: true,
  hint: (id) => ` [${id}]`,
  actions: {
    renameDiagram: vi.fn(async () => {}),
    duplicateDiagram: vi.fn(async () => {}),
    ejectDiagram: vi.fn(async () => {}),
  },
  exportPng: vi.fn(),
  exportPage: vi.fn(),
  ...over,
});

describe('diagramMenuItems', () => {
  it('lists Rename, the two exports, Duplicate and Eject for an owned diagram on screen', () => {
    // Breaks if the menu reorders, or a row loses its condition.
    expect(diagramMenuItems(context()).map((i) => i.id)).toEqual([
      'rename',
      'export-png',
      'export-page',
      'duplicate',
      'eject',
    ]);
  });

  it('offers a diagram compiled from TypeScript only the exports and Duplicate', () => {
    // Breaks if Rename or Eject are offered on a diagram with no source here.
    expect(diagramMenuItems(context({ owned: false })).map((i) => i.id)).toEqual([
      'export-png',
      'export-page',
      'duplicate',
    ]);
    expect(diagramMenuItems(context({ hasModel: false })).map((i) => i.id)).toEqual(['rename', 'eject']);
  });

  it("names each row's key in its title, and runs its action", () => {
    // Breaks if a title stops naming the key the action has now, or a row runs another's action.
    const c = context();
    const items = diagramMenuItems(c);
    expect(items.map((i) => i.title)).toEqual([
      'Rename this diagram [diagram.rename]',
      'Save the canvas as drawn — folds, layers, theme and drawings — as a PNG image',
      'Save a web page anyone can open in a browser, all in one file: the diagram to explore, with a light/dark switch and a style picker. Made from what is saved — positions not yet saved are left out',
      'Copy this diagram — layout and all — to a new editable one and open it [diagram.duplicate]',
      'Promote this diagram to a TypeScript source — it becomes read-only here [diagram.eject]',
    ]);
    for (const item of items) item.onSelect();
    expect(c.actions.renameDiagram).toHaveBeenCalledTimes(1);
    expect(c.exportPng).toHaveBeenCalledTimes(1);
    expect(c.exportPage).toHaveBeenCalledTimes(1);
    expect(c.actions.duplicateDiagram).toHaveBeenCalledTimes(1);
    expect(c.actions.ejectDiagram).toHaveBeenCalledTimes(1);
  });
});
