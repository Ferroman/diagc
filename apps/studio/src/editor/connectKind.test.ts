import { describe, expect, it } from 'vitest';
import { TM_BOUNDARY_TYPE, TM_ENTITY_TYPE, TM_FLOW_KIND, TM_PROCESS_TYPE, model } from '@diagc/core';

import { connectKind } from './connectKind';

/** customer (entity) and web (process) loose, both inside the dmz boundary */
const tm = (() => {
  const m = model('tm');
  const b = m.threatModel();
  b.boundary('dmz', 'DMZ').contains(b.entity('user', 'Customer'), b.process('web', 'Web app'));
  return m.toJSON();
})();

describe('connectKind', () => {
  it('draws a data-flow between two elements of a threat model', () => {
    expect(connectKind('threat-model', tm, 'user', 'web')).toBe(TM_FLOW_KIND);
    // the types are what it reads, so the ids come from core rather than here
    expect(tm.nodes.find((n) => n.id === 'user')?.type).toBe(TM_ENTITY_TYPE);
    expect(tm.nodes.find((n) => n.id === 'web')?.type).toBe(TM_PROCESS_TYPE);
  });

  it('degrades to sync when a trust boundary is either end', () => {
    // A data-flow touching a boundary fails validation (tm-flow-boundary) and an
    // invalid model does not autosave — the gesture would wedge the save until
    // undone, and a boundary is a big dashed box that is easy to drag from.
    expect(tm.nodes.find((n) => n.id === 'dmz')?.type).toBe(TM_BOUNDARY_TYPE);
    expect(connectKind('threat-model', tm, 'dmz', 'web')).toBe('sync');
    expect(connectKind('threat-model', tm, 'web', 'dmz')).toBe('sync');
    expect(connectKind('threat-model', tm, 'dmz', 'dmz')).toBe('sync');
  });

  it('keeps the plain sync default everywhere else', () => {
    // No notation, and the two notations that derive their structure from the
    // topology rather than the kind — neither may change behaviour here.
    expect(connectKind(undefined, tm, 'user', 'web')).toBe('sync');
    expect(connectKind('fishbone', tm, 'user', 'web')).toBe('sync');
    expect(connectKind('second-order', tm, 'user', 'web')).toBe('sync');
    expect(connectKind('c4', tm, 'user', 'web')).toBe('sync');
  });

  it('still flows without a model, and without a node it knows', () => {
    // The session model is read through an optional chain at the call site; no
    // model means nothing says "boundary", and a plain flow is the right guess.
    expect(connectKind('threat-model', undefined, 'user', 'web')).toBe(TM_FLOW_KIND);
    expect(connectKind('threat-model', tm, 'ghost', 'web')).toBe(TM_FLOW_KIND);
  });
});
