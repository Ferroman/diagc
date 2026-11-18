import { describe, expect, it } from 'vitest';
import { compileView, model, STATE_KINDS, type DiagramModel } from '@diagc/core/internal';
import {
  STATE_KIND_COLOR,
  STATE_KIND_LABEL,
  stateMachineColors,
  stateMachineEdgeColor,
  ZONE_COLORS,
} from './state-kinds';
import { darkTheme, lightTheme, themeToCssVars } from './theme';

function zoned(zones = 3): DiagramModel {
  const m = model('z');
  const machine = m.stateMachine('a');
  for (let i = 0; i < zones; i++) machine.zone(`z${i}`, `Zone ${i}`);
  return m.toJSON();
}

describe('stateMachineColors', () => {
  it('gives each zone the next theme colour, in declared order, and starts again after the last', () => {
    const colors = stateMachineColors(zoned(ZONE_COLORS.length + 1), undefined);
    expect(ZONE_COLORS.map((_, i) => colors.get(`z${i}`))).toEqual(ZONE_COLORS);
    expect(colors.get(`z${ZONE_COLORS.length}`)).toBe(ZONE_COLORS[0]);
  });

  it('follows containment order, not node order', () => {
    const m = zoned(2);
    const reordered = { ...m, containment: [...m.containment].reverse() };
    expect(stateMachineColors(reordered, undefined).get('z1')).toBe(ZONE_COLORS[0]);
  });

  it("keeps a zone's turn when that zone names a colour, so the zones after it keep theirs", () => {
    const m = zoned(3);
    const own = { ...m, nodes: m.nodes.map((n) => (n.id === 'z1' ? { ...n, color: '#123456' } : n)) };
    // the node's own colour wins where it is drawn (typeColor); the map still counts the turn
    expect(stateMachineColors(own, undefined).get('z2')).toBe(ZONE_COLORS[2]);
  });

  it('colours a state by its kind, and leaves a state without one alone', () => {
    const m = model('k');
    const machine = m.stateMachine('a');
    for (const kind of STATE_KINDS) machine.state(kind, kind, { kind });
    machine.state('plain', 'Plain');
    const colors = stateMachineColors(m.toJSON(), undefined);
    for (const kind of STATE_KINDS) expect(colors.get(kind)).toBe(STATE_KIND_COLOR[kind]);
    expect(colors.has('plain')).toBe(false);
  });

  it('colours nothing in a machine without zones or kinds', () => {
    const m = model('p');
    m.stateMachine('a').state('s', 'S');
    expect(stateMachineColors(m.toJSON(), undefined).size).toBe(0);
  });
});

describe('stateMachineEdgeColor', () => {
  it('draws a transition into a failed state in the failure colour, and no other', () => {
    const m = model('e');
    const machine = m.stateMachine('a');
    const start = machine.state('start', 'Start');
    const lost = machine.state('lost', 'Lost', { kind: 'failed' });
    const done = machine.state('done', 'Done', { kind: 'ok' });
    machine.transition(start, lost, { trigger: 'fail' });
    machine.transition(start, done, { trigger: 'finish' });
    machine.transition(lost, start, { trigger: 'retry' });
    const json = m.toJSON();
    const view = compileView(json, { pins: { a: 'expanded' } });
    const colorOf = (from: string, to: string) =>
      stateMachineEdgeColor(
        view.edges.find((e) => e.from === from && e.to === to)!,
        json,
      );
    expect(colorOf('start', 'lost')).toBe(STATE_KIND_COLOR.failed);
    expect(colorOf('start', 'done')).toBeUndefined();
    // out of a failed state is a way back, not a failure
    expect(colorOf('lost', 'start')).toBeUndefined();
  });
});

describe('the colours and labels', () => {
  const tokenOf = (v: string): string => /^var\((--[a-z0-9-]+)\)$/.exec(v)?.[1] ?? '';

  it('name a theme token each, defined in both themes', () => {
    const tokens = [...Object.values(STATE_KIND_COLOR), ...ZONE_COLORS].map(tokenOf);
    for (const theme of [lightTheme, darkTheme]) {
      const vars = themeToCssVars(theme);
      for (const token of tokens) expect(vars[token], token).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('keep the zone colours apart from the kind colours in each theme', () => {
    for (const theme of [lightTheme, darkTheme]) {
      const vars = themeToCssVars(theme);
      const kinds = new Set(Object.values(STATE_KIND_COLOR).map((v) => vars[tokenOf(v)]));
      for (const zone of ZONE_COLORS) expect(kinds.has(vars[tokenOf(zone)])).toBe(false);
    }
  });

  it('label every kind', () => {
    expect(Object.keys(STATE_KIND_LABEL).sort()).toEqual([...STATE_KINDS].sort());
  });
});
