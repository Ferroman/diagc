import { describe, expect, it, vi } from 'vitest';
import type { DiagramModel, EditorCommand } from '@diagc/core/internal';
import type { LayoutApi } from '@diagc/renderer';
import type { EditorApi } from '../session/useEditor';
import type { LibraryEntry } from '../library/types';
import { applyLibraryEntry, placeLibraryEntry, type LibraryPlacementScope } from './libraryPlacement';

// useNodePlacement.test.ts pins these flows command by command through the
// hook (the activity and plan rules among them); these are the steps alone.

const model: DiagramModel = {
  version: 1,
  id: 'd',
  name: 'd',
  nodes: [
    { id: 'box', name: 'Box' },
    { id: 'lane', name: 'Lane', type: 'activity-lane' },
    { id: 'f', name: 'F', type: 'activity-frame' },
  ],
  containment: [{ parent: 'f', child: 'lane' }],
  relations: [],
  layers: [],
  planes: [],
};
const card = (template: LibraryEntry['template']): LibraryEntry => ({
  id: 'c',
  category: 'x',
  name: 'Card',
  keywords: [],
  template,
});

function scope(over: Partial<LibraryPlacementScope> = {}) {
  const dispatched: EditorCommand[] = [];
  const editor = {
    session: { state: { model } },
    dispatch: (c: EditorCommand) => dispatched.push(c),
  } as unknown as EditorApi;
  const layoutApi = {
    nodeBounds: (id: string) => (id === 'lane' ? { x: 100, y: 100, width: 300, height: 120 } : undefined),
  } as unknown as LayoutApi;
  const s: LibraryPlacementScope = {
    editor,
    layoutApiRef: { current: layoutApi },
    activePlane: undefined,
    activePlaneBorrowsContainment: false,
    penLayer: null,
    selection: null,
    drillRoot: undefined,
    today: '2026-01-01',
    selectNode: vi.fn(),
    requestLabelEdit: vi.fn(),
    ...over,
  };
  return { s, dispatched };
}
const positions = (cs: EditorCommand[]) => cs.filter((c) => c.type === 'set-position');

describe('placeLibraryEntry', () => {
  // breaks if a drop into a lane stops landing at the pointer, or a top-level
  // drop stops centring on it, or either lands both ways
  it('lands a drop in a lane at the pointer, and a top-level drop centred on it', () => {
    const inLane = scope();
    placeLibraryEntry(inLane.s, card({ type: 'activity-action', width: 40, height: 20 }), {
      parentId: 'lane',
      position: { x: 200, y: 150 },
    });
    expect(positions(inLane.dispatched)).toEqual([{ type: 'set-position', nodeId: 'node', x: 80, y: 40 }]);

    const top = scope();
    placeLibraryEntry(top.s, card({ width: 40, height: 20 }), { position: { x: 200, y: 150 } });
    expect(positions(top.dispatched)).toEqual([{ type: 'set-position', nodeId: 'node', x: 180, y: 140 }]);
  });

  // breaks if a click-to-place starts saving a position, or stops naming the node on the canvas
  it('leaves a clicked card to elk and names it in place', () => {
    const { s, dispatched } = scope();
    placeLibraryEntry(s, card({ type: 'service' }));
    expect(positions(dispatched)).toEqual([]);
    expect(s.selectNode).toHaveBeenCalledWith('node');
    expect(s.requestLabelEdit).toHaveBeenCalledWith('node');
  });

  // breaks if a frame card arrives without its first lane, or as two undo steps
  it('places a frame with its first lane in one batch', () => {
    const { s, dispatched } = scope();
    placeLibraryEntry(s, card({ type: 'activity-frame' }));
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0]!.type).toBe('batch');
  });
});

describe('applyLibraryEntry', () => {
  // breaks if a restyle acts with no node selected, or stops adopting the card's footprint
  it('restyles only a selected node, and adopts the card size', () => {
    const none = scope();
    applyLibraryEntry({ ...none.s, model }, card({ type: 'service', width: 10, height: 20 }));
    expect(none.dispatched).toEqual([]);
    const box = scope({ selection: { kind: 'node', id: 'box' } });
    applyLibraryEntry({ ...box.s, model }, card({ type: 'service', width: 10, height: 20 }));
    expect(box.dispatched.map((c) => c.type)).toEqual(['set-node-details', 'set-size']);
  });
});
