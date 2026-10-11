// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BUILTIN_NOTATIONS, model, type DiagramModel } from '@diagc/core/internal';
import { notationLabel, studioNotation, STUDIO_NOTATIONS } from './index';
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
      'causal-loop': ['loopAnalysis'],
      'git-graph': ['dock'],
      c4: [],
      'second-order': ['dock', 'label'],
      fishbone: ['dock', 'label'],
      'threat-model': ['connectKind', 'dock', 'label'],
      plan: ['datesFromDropPoint', 'dock', 'gestures', 'label', 'planSection'],
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
