import { describe, expect, it } from 'vitest';
import { model } from '@diagramming/core';
import { loadArtifacts, type ApiDiagram } from './artifacts';

const entry = (name: string, m: unknown, editable = false): ApiDiagram =>
  ({ name, model: m as ApiDiagram['model'], issues: [], editable });

describe('loadArtifacts', () => {
  it('names, validates and returns good artifacts', () => {
    const m = model('ok');
    m.node('a', { type: 'service' });
    const arts = loadArtifacts([entry('ok', m.toJSON())]);
    expect(arts['ok']?.model?.id).toBe('ok');
    expect(arts['ok']?.issues).toEqual([]);
  });

  it('flags invalid artifacts with issues instead of a model', () => {
    const bad = {
      version: 1, id: 'bad', name: 'bad',
      nodes: [{ id: 'a', name: 'a', type: 't' }],
      containment: [], relations: [{ id: 'r', from: 'a', to: 'ghost', kind: 'k' }], layers: [], planes: [],
    };
    const arts = loadArtifacts([entry('bad', bad)]);
    expect(arts['bad']?.model).toBeUndefined();
    expect(arts['bad']?.issues.some((i) => i.code === 'dangling-endpoint')).toBe(true);
  });

  it('rejects a null model with an issue', () => {
    const arts = loadArtifacts([{ name: 'x', model: null, issues: [{ message: 'boom' }], editable: false }]);
    expect(arts['x']?.model).toBeUndefined();
    expect(arts['x']?.issues[0]?.message).toBe('boom');
  });

  it('attaches a matching layout overlay', () => {
    const m = model('ok');
    m.node('a', { type: 'service' });
    const arts = loadArtifacts([entry('ok', m.toJSON())], { ok: { version: 1, planes: {} } as never });
    expect(arts['ok']?.layout?.version).toBe(1);
  });

  it('attaches a well-formed drawings sidecar and drops a malformed one', () => {
    const m = model('ok');
    m.node('a', { type: 'service' });
    const good = { version: 1 as const, planes: { default: [{ id: 'k1', points: [1, 2] }] } };
    const arts = loadArtifacts([entry('ok', m.toJSON()), entry('bad', m.toJSON())], {}, {
      ok: good,
      bad: { version: 1, planes: { default: 'nope' } } as unknown as typeof good,
    });
    expect(arts['ok']?.drawings).toEqual(good);
    expect(arts['bad']?.drawings).toBeUndefined();
  });
});
