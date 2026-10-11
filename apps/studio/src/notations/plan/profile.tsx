import { isPlanZone } from '@diagc/core/internal';
import type { StudioNotationProfile } from '../types';
import { assign, planMoves, planResize } from './planActions';
import { PlanPanel } from './PlanPanel';
import { planQuickAdd } from './quickAdd';

export const PLAN: StudioNotationProfile = {
  label: 'Plan (schedule)',
  dock: {
    modes: 'edit',
    render: (ctx) => (
      <PlanPanel
        model={ctx.model}
        plane={ctx.viewPlane}
        selection={ctx.selection}
        onCommand={ctx.onCommand}
        onSelect={(id) => ctx.select({ kind: 'node', id })}
        today={ctx.today}
      />
    ),
  },
  gestures: {
    // a move is a date change; the layout owns x
    nodesMoved: ({ model, plane, positions, deltas }) => planMoves(model, plane, positions, deltas),
    // a drop assigns a role or re-homes the node instead of an ordinary move
    dropInto: ({ model, plane, id, targetId, rel }) => assign(model, plane, id, targetId, rel),
    resize: ({ model, plane, id, w, pos }) => {
      // the lookup scans every node, so it stays here: every other notation
      // resizes without it
      const node = model.nodes.find((n) => n.id === id);
      if (node === undefined || !isPlanZone(node)) return 'generic';
      // a zone's width is its dates: no size is ever saved for it
      return planResize(model, plane, id, pos.x, w);
    },
  },
  quickAdd: planQuickAdd,
  datesFromDropPoint: true,
  planSection: true,
};
