import { describe, expect, expectTypeOf, it } from 'vitest';
import type { DiagramModel } from '@diagc/core/internal';
import { isSafeName, readAsset, type DiagramEntry, type HandlerResult } from './handlers';
import * as handlers from './handlers';

describe('the handlers module', () => {
  it('rejects unsafe names', () => {
    expect(isSafeName('my-diagram')).toBe(true);
    expect(isSafeName('team-a/app')).toBe(true);
    expect(isSafeName('../escape')).toBe(false);
    expect(isSafeName('UPPER')).toBe(false);
    expect(isSafeName('a..b')).toBe(false);
    expect(isSafeName('/abs')).toBe(false);
  });

  it('exports the handlers the hosts call, the name rule and the asset limit, and nothing else', () => {
    expect(Object.keys(handlers).sort()).toEqual([
      'MAX_ASSET_BYTES',
      'ejectDiagramSource',
      'exportPage',
      'isSafeName',
      'listDiagramModels',
      'listDrawings',
      'listLayouts',
      'readAsset',
      'readComposedDiagram',
      'readDiagram',
      'readLibrary',
      'renameDiagram',
      'saveAsset',
      'saveDiagram',
      'saveDrawings',
      'saveLayout',
      'saveLibrary',
      'walkDiagramJson',
      'walkFiles',
    ]);
    expect(handlers.MAX_ASSET_BYTES).toBe(5 * 1024 * 1024);
  });

  it('exports the result and the list entry as types', () => {
    expectTypeOf<HandlerResult>().toEqualTypeOf<{ status: number; body: unknown }>();
    expectTypeOf<DiagramEntry>().toEqualTypeOf<{
      name: string;
      model: DiagramModel | null;
      issues: { message: string }[];
      editable: boolean;
    }>();
    expectTypeOf(readAsset).returns.resolves.toEqualTypeOf<HandlerResult & { bytes?: Buffer; contentType?: string }>();
  });
});
