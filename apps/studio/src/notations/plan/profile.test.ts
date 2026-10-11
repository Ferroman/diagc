import { describe, expect, it } from 'vitest';
import { model, type DiagramModel } from '@diagc/core/internal';
import { PLAN_LAYOUT } from '@diagc/renderer';
import { assign, planMoves, planResize } from './planActions';
import { PLAN } from './profile';

const { DAY } = PLAN_LAYOUT;

/** build (Feb 2 – Feb 27) holding the event m1; alice, a person; a plain box */
function schedule(): DiagramModel {
  const m = model('s');
  const p = m.plan();
  p.zone('build', { start: '2026-02-02', end: '2026-02-27' }).event('m1', { at: '2026-02-16' });
  p.person('alice', 'Alice');
  m.node('box', { name: 'Box' });
  return m.toJSON();
}
const gestures = PLAN.gestures!;

describe("the plan's gestures", () => {
  it('reads a move as dates, the way planMoves does', () => {
    const model = schedule();
    const move = { positions: { build: { x: 0, y: 0 } }, deltas: { build: { dx: 3 * DAY, dy: 0 } } };
    expect(gestures.nodesMoved!({ model, plane: 'plan', ...move })).toEqual(
      planMoves(model, 'plan', move.positions, move.deltas),
    );
    expect(gestures.nodesMoved!({ model, plane: 'plan', ...move })).toBeDefined();
  });

  it('consumes a move it has no answer for: an actor is a list entry, not a position', () => {
    const model = schedule();
    expect(
      gestures.nodesMoved!({
        model,
        plane: 'plan',
        positions: { alice: { x: 5, y: 5 } },
        deltas: { alice: { dx: 5, dy: 5 } },
      }),
    ).toBeUndefined();
  });

  it('reads a drop into a zone as a role, the way assign does', () => {
    const model = schedule();
    const drop = { model, plane: 'plan', id: 'alice', targetId: 'build', rel: { x: 4, y: 4 } };
    expect(gestures.dropInto!(drop)).toEqual(assign({ model, plane: 'plan' }, 'alice', 'build', drop.rel));
    expect(gestures.dropInto!(drop)).toEqual({
      type: 'add-relation',
      from: 'alice',
      to: 'build',
      opts: { kind: 'executes' },
    });
  });

  it('resizes a zone as dates, and hands any other node back to the generic resize', () => {
    const model = schedule();
    const resize = { model, plane: 'plan', w: 10 * DAY, h: 40, pos: { x: 0, y: 0 } };
    expect(gestures.resize!({ ...resize, id: 'build' })).toEqual(
      planResize({ model, plane: 'plan' }, 'build', 0, 10 * DAY),
    );
    expect(gestures.resize!({ ...resize, id: 'build' })).toMatchObject({ type: 'set-plan-dates', id: 'build' });
    expect(gestures.resize!({ ...resize, id: 'm1' })).toBe('generic');
    expect(gestures.resize!({ ...resize, id: 'box' })).toBe('generic');
    expect(gestures.resize!({ ...resize, id: 'gone' })).toBe('generic');
  });
});
