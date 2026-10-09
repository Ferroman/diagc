import { describe, expect, it } from 'vitest';
import { model } from '../builder/index';
import { validate } from './index';
import type { DiagramModel } from '../types';

describe('model style', () => {
  const base: DiagramModel = {
    version: 1,
    id: 'm',
    name: 'M',
    nodes: [],
    containment: [],
    relations: [],
    layers: [],
    planes: [],
  };
  it('accepts absent, known, and unknown style ids (unknown must not block saves)', () => {
    expect(validate(base)).toEqual([]);
    expect(validate({ ...base, style: 'sketch' })).toEqual([]);
    expect(validate({ ...base, style: 'some-future-preset' })).toEqual([]);
  });
  it('rejects an empty style string', () => {
    const issues = validate({ ...base, style: '' });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('invalid-style');
  });

  it('accepts a model-level notation from BUILTIN_NOTATIONS', () => {
    expect(validate({ ...base, notation: 'c4' })).toEqual([]);
  });

  it('rejects an unknown model-level notation', () => {
    const issues = validate({ ...base, notation: 'uml-4ever' } as DiagramModel);
    expect(issues).toEqual([
      { code: 'unknown-notation', message: "Diagram has unknown notation 'uml-4ever'", ref: 'm' },
    ]);
  });
});

describe('legend validation', () => {
  const base = () => {
    const m = model('d');
    m.node('a');
    return m.toJSON();
  };

  it('accepts a well-formed legend', () => {
    const json = {
      ...base(),
      legend: {
        title: 'Key',
        position: 'top-left' as const,
        show: ['kinds' as const],
        items: [{ label: 'Team A', color: '#f59e0b' }],
      },
    };
    expect(validate(json)).toEqual([]);
  });

  it('accepts an empty legend', () => {
    expect(validate({ ...base(), legend: {} })).toEqual([]);
  });

  it('accepts every derived section, marks included', () => {
    expect(validate({ ...base(), legend: { show: ['layers', 'kinds', 'types', 'marks'] } })).toEqual([]);
  });

  it('rejects an unknown section', () => {
    const issues = validate({ ...base(), legend: { show: ['colours'] } } as unknown as DiagramModel);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'invalid-legend' });
    expect(issues[0]!.message).toContain('colours');
  });

  it('rejects an unknown position', () => {
    const issues = validate({ ...base(), legend: { position: 'middle' } } as unknown as DiagramModel);
    expect(issues[0]).toMatchObject({ code: 'invalid-legend' });
  });

  it('rejects an empty title', () => {
    expect(validate({ ...base(), legend: { title: '' } })[0]).toMatchObject({ code: 'invalid-legend' });
  });

  it('rejects items that are not a list', () => {
    expect(validate({ ...base(), legend: { items: {} } } as unknown as DiagramModel)[0]).toMatchObject({
      code: 'invalid-legend',
    });
  });

  it('rejects an item without a label', () => {
    const issues = validate({ ...base(), legend: { items: [{ color: '#fff' }] } } as unknown as DiagramModel);
    expect(issues[0]).toMatchObject({ code: 'invalid-legend' });
  });

  it('rejects a non-string item colour', () => {
    const issues = validate({ ...base(), legend: { items: [{ label: 'x', color: 1 }] } } as unknown as DiagramModel);
    expect(issues[0]).toMatchObject({ code: 'invalid-legend' });
  });

  it('accepts unknown registry ids on an item', () => {
    // registry ids are free-form everywhere else in the model; they fall back silently
    const json = {
      ...base(),
      legend: {
        items: [
          { label: 'gRPC', kind: 'grpc' },
          { label: 'Thing', type: 'whatever' },
        ],
      },
    };
    expect(validate(json)).toEqual([]);
  });
});

describe('a null legend', () => {
  it('is reported as not an object instead of throwing', () => {
    const m = {
      version: 1,
      id: 'm',
      name: 'M',
      nodes: [],
      containment: [],
      relations: [],
      layers: [],
      planes: [],
      legend: null,
    };
    expect(validate(m as unknown as DiagramModel)).toEqual([
      { code: 'invalid-legend', message: 'Legend must be an object' },
    ]);
  });
});
