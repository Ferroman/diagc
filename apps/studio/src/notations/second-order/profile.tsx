import type { StudioNotationProfile } from '../types';
import { secondOrderQuickAdd } from './quickAdd';
import { SecondOrderPanel } from './SecondOrderPanel';

export const SECOND_ORDER: StudioNotationProfile = {
  label: 'Second-order thinking',
  dock: {
    modes: 'edit',
    render: (ctx) => (
      <SecondOrderPanel
        model={ctx.model}
        selection={ctx.selection}
        scopePlane={ctx.scopePlane}
        onCommand={ctx.onCommand}
        onSelect={(id) => ctx.select({ kind: 'node', id })}
        onCreated={ctx.requestLabelEdit}
      />
    ),
  },
  quickAdd: secondOrderQuickAdd,
};
