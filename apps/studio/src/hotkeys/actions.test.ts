import { describe, expect, it } from 'vitest';
import { ACTIONS, actionOf, GROUPS } from './actions';
import { conflictsOf, reservedReason, resolveKeymap } from './keymap';

describe('ACTIONS', () => {
  it('has 47 actions with unique ids, 22 of them bound by default', () => {
    expect(ACTIONS).toHaveLength(47);
    expect(new Set(ACTIONS.map((a) => a.id)).size).toBe(47);
    expect(ACTIONS.filter((a) => a.defaults.length > 0)).toHaveLength(22);
  });

  it('files every action under a listed group', () => {
    for (const a of ACTIONS) expect(GROUPS).toContain(a.group);
  });

  it('ships no default that clashes with another, and none that is reserved', () => {
    const keymap = resolveKeymap({});
    for (const a of ACTIONS) {
      for (const chord of a.defaults) {
        expect(conflictsOf(keymap, a.id, chord), `${a.id} ${chord}`).toEqual([]);
        expect(reservedReason(chord), `${a.id} ${chord}`).toBeNull();
      }
    }
  });

  it('keeps the keys the studio already had', () => {
    const d = (id: Parameters<typeof actionOf>[0]) => actionOf(id).defaults;
    expect(d('edit.add-node')).toEqual(['N']);
    expect(d('edit.add-child')).toEqual(['Tab']);
    expect(d('edit.undo')).toEqual(['Mod+Z']);
    expect(d('edit.redo')).toEqual(['Mod+Shift+Z', 'Mod+Y']);
    expect(d('edit.save')).toEqual(['Mod+S']);
    expect(d('tool.pen')).toEqual(['P']);
    expect(d('tool.eraser')).toEqual(['E']);
    expect(d('canvas.laser')).toEqual(['L']);
  });

  it('lets only the picker through while typing, and only on a chord no field would type', () => {
    const open = ACTIONS.filter((a) => a.inFields === true);
    expect(open.map((a) => a.id)).toEqual(['diagram.picker']);
    for (const a of open) for (const chord of a.defaults) expect(chord).toMatch(/^(Mod|Ctrl|Meta|Alt)\+/);
  });

  it('lets a held key repeat only where that is wanted', () => {
    expect(ACTIONS.filter((a) => a.repeat === true).map((a) => a.id)).toEqual([
      'edit.undo',
      'edit.redo',
      'canvas.zoom-in',
      'canvas.zoom-out',
    ]);
  });
});
