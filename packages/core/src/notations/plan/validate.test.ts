import { describe, expect, it } from 'vitest';
import { model } from '../../builder';
import { DiagramValidationError, validate } from '../../validate/index';
import type { DiagramModel, DiagramNode } from '../../types';

describe('plan', () => {
  const planModel = (
    nodes: DiagramNode[],
    containment: { parent: string; child: string }[] = [],
    relations: DiagramModel['relations'] = [],
  ): DiagramModel => ({
    version: 1,
    id: 'p',
    name: 'p',
    notation: 'plan',
    layers: [],
    planes: [],
    nodes,
    containment,
    relations,
  });
  const zone = (id: string, start?: string, end?: string): DiagramNode => ({
    id,
    name: id,
    type: 'plan-zone',
    metadata: { ...(start !== undefined ? { start } : {}), ...(end !== undefined ? { end } : {}) },
  });
  const event = (id: string, at?: string): DiagramNode => ({
    id,
    name: id,
    type: 'plan-event',
    metadata: at !== undefined ? { at } : {},
  });
  const codes = (m: DiagramModel) => validate(m).map((i) => [i.code, i.ref]);

  it('accepts a well-formed plan', () => {
    const m = planModel(
      [
        zone('q', '2026-01-05', '2026-03-27'),
        zone('d', '2026-01-05', '2026-01-30'),
        event('e', '2026-02-02'),
        { id: 'p', name: 'P', type: 'person' },
      ],
      [
        { parent: 'q', child: 'd' },
        { parent: 'q', child: 'e' },
      ],
      [{ id: 'r', from: 'p', to: 'q', kind: 'owns' }],
    );
    expect(validate(m)).toEqual([]);
  });
  it('plan-date: a date that is not a real YYYY-MM-DD, on any notation', () => {
    const m = planModel([zone('q', '2026-02-30', '2026-03-27'), event('e', 'soon')]);
    expect(codes(m)).toEqual([
      ['plan-date', 'q'],
      ['plan-date', 'e'],
    ]);
    expect(codes({ ...m, notation: undefined })).toEqual([
      ['plan-date', 'q'],
      ['plan-date', 'e'],
    ]);
  });
  it('plan-missing: a zone without start or end, an event without at', () => {
    expect(codes(planModel([zone('q', '2026-01-05'), zone('r', undefined, '2026-01-05'), event('e')]))).toEqual([
      ['plan-missing', 'q'],
      ['plan-missing', 'r'],
      ['plan-missing', 'e'],
    ]);
  });
  it('plan-span: end before start', () => {
    expect(codes(planModel([zone('q', '2026-03-27', '2026-01-05')]))).toEqual([['plan-span', 'q']]);
  });
  it("plan-nested: a contained zone or event outside its zone's span, on the plan plane", () => {
    const m = planModel(
      [zone('q', '2026-01-05', '2026-01-30'), zone('late', '2026-01-20', '2026-02-10'), event('e', '2026-01-01')],
      [
        { parent: 'q', child: 'late' },
        { parent: 'q', child: 'e' },
      ],
    );
    expect(codes(m)).toEqual([
      ['plan-nested', 'late'],
      ['plan-nested', 'e'],
    ]);
  });
  it("plan-nested reads the plan PLANE's containment when the notation is on a plane", () => {
    const m = model('two');
    m.plane('arch').plane('plan', { notation: 'plan' });
    const q = m.node('q', { type: 'plan-zone', plane: 'plan', metadata: { start: '2026-01-05', end: '2026-01-30' } });
    const late = m.node('late', {
      type: 'plan-zone',
      plane: 'plan',
      metadata: { start: '2026-02-01', end: '2026-02-10' },
    });
    q.contains(late, { plane: 'plan' });
    // toJSON() itself validates and throws (see 'toJSON throws DiagramValidationError...'
    // above), so a model that is expected to carry an issue is read off the thrown error.
    expect(() => m.toJSON()).toThrowError(DiagramValidationError);
    try {
      m.toJSON();
    } catch (e) {
      expect((e as DiagramValidationError).issues.map((i) => [i.code, i.ref])).toEqual([['plan-nested', 'late']]);
    }
    // the same nesting declared on the ARCH plane is not a schedule
    const m2 = model('two');
    m2.plane('arch').plane('plan', { notation: 'plan' });
    m2.node('q', { type: 'plan-zone', plane: 'plan', metadata: { start: '2026-01-05', end: '2026-01-30' } }).contains(
      m2.node('late', { type: 'plan-zone', plane: 'plan', metadata: { start: '2026-02-01', end: '2026-02-10' } }),
      { plane: 'arch' },
    );
    expect(codes(m2.toJSON())).toEqual([]);
  });
  it('plan-role-target: a role relation into a non-zone, only under the plan notation', () => {
    const m = planModel(
      [
        zone('q', '2026-01-05', '2026-01-30'),
        { id: 'p', name: 'P', type: 'person' },
        { id: 's', name: 'S', type: 'service' },
      ],
      [],
      [
        { id: 'bad', from: 'p', to: 's', kind: 'executes' },
        { id: 'ok', from: 'p', to: 'q', kind: 'checks' },
      ],
    );
    expect(codes(m)).toEqual([['plan-role-target', 'bad']]);
    expect(codes({ ...m, notation: undefined })).toEqual([]);
  });
});
