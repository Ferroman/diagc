// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BUILTIN_NOTATIONS, TM_FLOW_KIND, model, type DiagramModel } from '@diagc/core/internal';
import { connectKind, notationLabel, studioNotation, STUDIO_NOTATIONS } from './index';
import type { NotationDockContext } from './types';

const empty: DiagramModel = model('d').toJSON();

const ctx = (over: Partial<NotationDockContext> = {}): NotationDockContext => ({
  model: empty,
  editing: true,
  viewPlane: 'view',
  scopePlane: undefined,
  selection: null,
  today: '2026-01-20',
  onCommand: vi.fn(),
  select: vi.fn(),
  requestLabelEdit: vi.fn(),
  ...over,
});

describe('STUDIO_NOTATIONS', () => {
  it('says what each notation adds, and nothing for the stencil notations', () => {
    const fields = Object.fromEntries(Object.entries(STUDIO_NOTATIONS).map(([id, p]) => [id, Object.keys(p).sort()]));
    expect(fields).toEqual({
      'causal-loop': ['loopAnalysis', 'quickAdd'],
      'git-graph': ['dock', 'quickAdd'],
      c4: [],
      'second-order': ['dock', 'label', 'quickAdd'],
      fishbone: ['dock', 'label', 'quickAdd'],
      'threat-model': ['connectKind', 'dock', 'label', 'quickAdd'],
      plan: ['datesFromDropPoint', 'dock', 'gestures', 'label', 'planSection', 'quickAdd'],
      deployment: [],
    });
  });

  it('a plane in the default look adds nothing', () => {
    expect(studioNotation(undefined)).toEqual({});
  });

  it('labels every notation, deriving the name where the entry gives none', () => {
    expect(BUILTIN_NOTATIONS.map(notationLabel)).toEqual([
      'Causal loop',
      'Git graph',
      'C4',
      'Second-order thinking',
      'Fishbone (cause and effect)',
      'Threat model (STRIDE)',
      'Plan (schedule)',
      'Deployment',
    ]);
  });

  it('docks the threat model in both modes and every other panel while editing only', () => {
    const modes = Object.fromEntries(
      Object.entries(STUDIO_NOTATIONS).flatMap(([id, p]) => (p.dock !== undefined ? [[id, p.dock.modes]] : [])),
    );
    expect(modes).toEqual({
      'git-graph': 'edit',
      'second-order': 'edit',
      fishbone: 'edit',
      'threat-model': 'both',
      plan: 'edit',
    });
  });

  it.each([
    ['git-graph', 'Git graph'],
    ['plan', 'Plan'],
    ['second-order', 'Second-order thinking'],
    ['fishbone', 'Fishbone'],
    ['threat-model', 'Threat model'],
  ] as const)('%s renders its own panel', (id, landmark) => {
    render(<>{STUDIO_NOTATIONS[id].dock!.render(ctx())}</>);
    expect(screen.getByRole('complementary', { name: landmark })).toBeDefined();
  });
});

describe('connectKind', () => {
  /** customer (entity) and web (process) loose, both inside the dmz boundary */
  const tm = (() => {
    const m = model('tm');
    const b = m.threatModel();
    b.boundary('dmz', 'DMZ').contains(b.entity('user', 'Customer'), b.process('web', 'Web app'));
    return m.toJSON();
  })();
  /** two zones on the plan plane; roles come from the panel, never from a canvas connect */
  const plan = (() => {
    const m = model('sched');
    const p = m.plan();
    p.zone('a', { name: 'A', start: '2026-01-05', end: '2026-01-09' });
    p.zone('b', { name: 'B', start: '2026-01-12', end: '2026-01-16' });
    return m.toJSON();
  })();

  it("asks the threat model's rule on a threat model", () => {
    expect(connectKind('threat-model', tm, 'user', 'web')).toBe(TM_FLOW_KIND);
    expect(connectKind('threat-model', tm, 'dmz', 'web')).toBe('sync');
  });

  it('keeps the plain sync default everywhere else', () => {
    // No notation, and the two notations that derive their structure from the
    // topology rather than the kind — neither may change behaviour here.
    expect(connectKind(undefined, tm, 'user', 'web')).toBe('sync');
    expect(connectKind('fishbone', tm, 'user', 'web')).toBe('sync');
    expect(connectKind('second-order', tm, 'user', 'web')).toBe('sync');
    expect(connectKind('c4', tm, 'user', 'web')).toBe('sync');
    expect(connectKind('plan', plan, 'a', 'b')).toBe('sync');
  });
});
