import { describe, expect, it } from 'vitest';
import { model, type DiagramModel } from '@diagc/core/internal';
import type { QuickAddSource } from '../canvas-editing/quickAddRecipe';
import { activityQuickAdd } from './quickAdd';

/** flow › lane a › region retry; a lane outside any frame; a plain box */
const chart: DiagramModel = (() => {
  const m = model('act');
  m.activity('flow').lane('a', { name: 'A' }).region('retry', 'Retry');
  const j = m.toJSON();
  j.nodes.push({ id: 'loose', name: 'Loose', type: 'activity-lane' }, { id: 'box', name: 'Box' });
  return j;
})();
const src = (id: string): QuickAddSource => ({
  model: chart,
  source: chart.nodes.find((n) => n.id === id)!,
  ctx: { notation: 'threat-model', plane: undefined, borrowsContainment: false, penLayer: null },
  kindTo: () => 'sync',
});
const label = (answer: ReturnType<typeof activityQuickAdd>) => (typeof answer === 'object' ? answer.label : answer);

describe('activityQuickAdd', () => {
  it('a lane in a frame offers a band above or below it, below by default', () => {
    expect(label(activityQuickAdd(src('a'), 'before'))).toBe('Add a lane above');
    expect(label(activityQuickAdd(src('a'), 'after'))).toBe('Add a lane below');
    expect(label(activityQuickAdd(src('a'), undefined))).toBe('Add a lane below');
  });

  it('settles the rest of the chrome, and a frameless lane, as nothing on any notation', () => {
    for (const id of ['flow', 'retry', 'loose']) expect(activityQuickAdd(src(id), undefined), id).toBe('none');
  });

  it('leaves any other node to the notation', () => {
    expect(activityQuickAdd(src('box'), undefined)).toBeUndefined();
  });
});
