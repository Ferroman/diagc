import type { StudioNotationProfile } from '../types';
import { FishbonePanel } from './FishbonePanel';
import { fishboneQuickAdd } from './quickAdd';

export const FISHBONE: StudioNotationProfile = {
  label: 'Fishbone (cause and effect)',
  dock: {
    modes: 'edit',
    render: (ctx) => (
      <FishbonePanel
        model={ctx.model}
        selection={ctx.selection}
        plane={ctx.scopePlane}
        onCommand={ctx.onCommand}
        onSelect={(id) => ctx.select({ kind: 'node', id })}
        onCreated={ctx.requestLabelEdit}
      />
    ),
  },
  quickAdd: fishboneQuickAdd,
};
