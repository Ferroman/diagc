import { describe, expect, it } from 'vitest';
import { diagramWarnings, validate } from '../../validate/index';
import type { ContainmentEdge, DiagramModel, DiagramNode, DiagramRelation } from '../../types';

describe('fishbone conventions', () => {
  const fb = (
    nodes: DiagramNode[],
    relations: DiagramRelation[],
    containment: ContainmentEdge[] = [],
  ): DiagramModel => ({
    version: 1,
    id: 'm',
    name: 'm',
    notation: 'fishbone',
    nodes,
    containment,
    relations,
    layers: [],
    planes: [],
  });
  const n = (id: string, type?: string): DiagramNode => ({ id, name: id, ...(type !== undefined ? { type } : {}) });
  const r = (from: string, to: string, kind = 'cause-of'): DiagramRelation => ({
    id: `${from}->${to}`,
    from,
    to,
    kind,
  });
  const codes = (m: DiagramModel) =>
    validate(m)
      .filter((i) => i.code.startsWith('fb-'))
      .map((i) => [i.code, i.ref]);
  const warned = (m: DiagramModel) => diagramWarnings(m).map((i) => [i.code, i.ref]);

  it('accepts an empty fishbone diagram and a well-formed fish', () => {
    expect(codes(fb([], []))).toEqual([]);
    expect(codes(fb([n('note')], []))).toEqual([]);
    const m = fb(
      [n('e', 'fb-effect'), n('c', 'fb-category'), n('a', 'fb-cause'), n('a1', 'fb-cause')],
      [r('c', 'e'), r('a', 'c'), r('a1', 'a')],
    );
    expect(codes(m)).toEqual([]);
  });

  it('wants exactly one effect once there are fishbone nodes', () => {
    expect(codes(fb([n('c', 'fb-category')], []))).toEqual([['fb-no-effect', 'm']]);
    expect(warned(fb([n('c', 'fb-category')], []))).toEqual([['fb-unattached', 'c']]);
    expect(codes(fb([n('e', 'fb-effect'), n('e2', 'fb-effect')], []))).toEqual([['fb-many-effects', 'e2']]);
  });

  it('names the wrong parent, the fourth level, and what never reaches the effect — one issue per node', () => {
    const m = fb(
      [
        n('e', 'fb-effect'),
        n('c', 'fb-category'),
        n('a', 'fb-cause'),
        n('a1', 'fb-cause'),
        n('a11', 'fb-cause'),
        n('cc', 'fb-category'),
        n('direct', 'fb-cause'),
        n('under-cc', 'fb-cause'),
        n('x', 'fb-cause'),
        n('y', 'fb-cause'),
      ],
      [
        r('c', 'e'),
        r('a', 'c'),
        r('a1', 'a'),
        r('a11', 'a1'),
        r('cc', 'c'),
        r('direct', 'e'),
        r('under-cc', 'cc'),
        r('x', 'y'),
        r('y', 'x'),
        r('e', 'x'),
      ],
    );
    expect(codes(m)).toEqual([
      ['fb-misplaced', 'e'],
      ['fb-too-deep', 'a11'],
      ['fb-misplaced', 'cc'],
      ['fb-misplaced', 'direct'],
    ]);
    expect(warned(m)).toEqual([
      ['fb-unattached', 'under-cc'],
      ['fb-unattached', 'x'],
      ['fb-unattached', 'y'],
    ]);
  });

  // A cause dropped from the library reaches no bone until it is connected. The
  // renderer parks it in the stray row; blocking the save on it made the
  // diagram unsavable mid-edit.
  it('lets a stray cause through validation and warns about it instead', () => {
    const m = fb([n('e', 'fb-effect'), n('c', 'fb-category'), n('loose', 'fb-cause')], [r('c', 'e')]);
    expect(validate(m)).toEqual([]);
    expect(diagramWarnings(m)).toEqual([
      { code: 'fb-unattached', message: "'loose' does not reach the effect", ref: 'loose' },
    ]);
  });

  it('warns about nothing on a well-formed fish or off the notation', () => {
    expect(warned(fb([n('e', 'fb-effect'), n('c', 'fb-category')], [r('c', 'e')]))).toEqual([]);
    expect(warned({ ...fb([n('c', 'fb-category')], []), notation: undefined })).toEqual([]);
  });

  it('rejects a fishbone node inside a container', () => {
    const m = fb([n('e', 'fb-effect'), n('c', 'fb-category'), n('g')], [r('c', 'e')], [{ parent: 'g', child: 'c' }]);
    expect(codes(m)).toEqual([['fb-contained', 'c']]);
  });

  it('only runs where the fishbone notation is active', () => {
    const m = { ...fb([n('c', 'fb-category')], []), notation: undefined };
    expect(codes(m)).toEqual([]);
  });
});
