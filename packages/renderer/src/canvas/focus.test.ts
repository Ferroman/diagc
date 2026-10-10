import { describe, expect, it } from 'vitest';
import { model, type DiagramModel } from '@diagc/core/internal';
import { focusForVisible } from './focus';

function twoPlaneModel(): DiagramModel {
  const m = model('tp');
  m.plane('arch').plane('infra');
  const api = m.node('api', { type: 'service' });
  const sys = m.node('sys', { type: 'system' });
  const plat = m.node('plat', { type: 'platform' });
  const box = m.node('box', { type: 'infra' });
  plat.contains(sys);
  sys.contains(api);
  box.contains(api, { plane: 'infra' });
  return m.toJSON();
}

describe('focusForVisible', () => {
  it('opens the new-plane ancestors of currently visible entities', () => {
    expect(focusForVisible(twoPlaneModel(), 'infra', ['plat', 'sys', 'api'])).toEqual(['box']);
  });

  it('entities missing from the target plane contribute nothing', () => {
    expect(focusForVisible(twoPlaneModel(), 'infra', ['plat', 'sys'])).toEqual([]);
    expect(focusForVisible(twoPlaneModel(), 'arch', ['box'])).toEqual([]);
  });

  it('collects the full ancestor chain', () => {
    expect(focusForVisible(twoPlaneModel(), 'arch', ['api']).sort()).toEqual(['plat', 'sys']);
  });
});
