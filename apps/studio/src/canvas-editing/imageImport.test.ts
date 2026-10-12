import { describe, expect, it, vi } from 'vitest';
import { applyCommand, emptyDrawings, emptyLayout, type DiagramModel, type EditorCommand } from '@diagc/core/internal';
import type { EditorApi } from '../session/useEditor';
import { importImages, type ImageImportScope } from './imageImport';

// The upload names the asset after the file and refuses one called bad.png;
// the size is fixed. useNodePlacement.test.ts pins the commands in full.
vi.mock('./images', () => ({
  uploadAsset: async (file: File) => {
    if (file.name === 'bad.png') throw new Error('too big');
    return `asset-${file.name}`;
  },
  readImageSize: async () => ({ w: 120, h: 80 }),
}));

const model: DiagramModel = {
  version: 1,
  id: 'd',
  name: 'd',
  nodes: [],
  containment: [],
  relations: [],
  layers: [],
  planes: [{ id: 'p', name: 'P' }],
};

function scope(m: DiagramModel | undefined) {
  const dispatched: EditorCommand[] = [];
  let state = m === undefined ? undefined : { model: m, layout: emptyLayout(), drawings: emptyDrawings() };
  const editor = {
    peek: () => (state === undefined ? null : { state }),
    dispatch: (c: EditorCommand) => {
      dispatched.push(c);
      if (state !== undefined) state = applyCommand(state, c).state;
    },
  } as unknown as EditorApi;
  const s: ImageImportScope = {
    editor,
    activePlane: 'p',
    activePlaneBorrowsContainment: false,
    penLayer: null,
    selectNode: vi.fn(),
    reportIssues: vi.fn(),
  };
  return { s, dispatched };
}
const file = (name: string) => new File(['x'], name, { type: 'image/png' });

describe('importImages', () => {
  // breaks if a file reads the render-bound model instead of peek() (two
  // files would share an id), or an image stops being selected
  it('adds each file as its own image node, reading the model each one left', async () => {
    const { s, dispatched } = scope(model);
    await importImages(s, [file('a.png'), file('a.png')]);
    const ids = dispatched.flatMap((c) => (c.type === 'add-node' ? [c.node.id] : []));
    expect(ids).toEqual(['image', 'image-2']);
    expect(s.selectNode).toHaveBeenCalledTimes(2);
  });

  // breaks if a failed upload stops the rest, or is reported per file
  it('carries on past a failed file and reports the failures once', async () => {
    const { s, dispatched } = scope(model);
    await importImages(s, [file('bad.png'), file('a.png'), file('bad.png')]);
    expect(dispatched.filter((c) => c.type === 'add-node')).toHaveLength(1);
    expect(s.reportIssues).toHaveBeenCalledTimes(1);
    expect(s.reportIssues).toHaveBeenCalledWith([{ message: 'too big' }, { message: 'too big' }]);
  });

  // breaks if an import with no session open dispatches, or reports nothing went wrong as a failure
  it('adds nothing once the session is gone', async () => {
    const { s, dispatched } = scope(undefined);
    await importImages(s, [file('a.png')]);
    expect(dispatched).toEqual([]);
    expect(s.reportIssues).not.toHaveBeenCalled();
  });
});
