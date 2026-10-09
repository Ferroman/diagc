import { describe, expect, it } from 'vitest';
import { validate } from '../../validate/index';
import type { DiagramModel } from '../../types';

function emptyModel(): DiagramModel {
  return { version: 1, id: 'm', name: 'm', nodes: [], containment: [], relations: [], layers: [], planes: [] };
}

describe('threat-model notation', () => {
  it('forbids a data flow on a boundary, only where the notation is active', () => {
    const m: DiagramModel = {
      ...emptyModel(),
      notation: 'threat-model',
      nodes: [
        { id: 'web', name: 'W', type: 'tm-process' },
        { id: 'dmz', name: 'D', type: 'tm-boundary' },
      ],
      relations: [{ id: 'r', from: 'web', to: 'dmz', kind: 'data-flow' }],
    };
    expect(validate(m).map((i) => [i.code, i.ref])).toEqual([['tm-flow-boundary', 'r']]);
    expect(validate({ ...m, notation: undefined })).toEqual([]);
    expect(validate({ ...m, relations: [{ ...m.relations[0]!, kind: 'reads' }] })).toEqual([]);
  });
  it('accepts an empty threat-model diagram', () => {
    expect(validate({ ...emptyModel(), notation: 'threat-model' })).toEqual([]);
  });
});
