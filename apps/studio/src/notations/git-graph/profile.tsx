import type { StudioNotationProfile } from '../types';
import { GitPanel } from './GitPanel';

export const GIT_GRAPH: StudioNotationProfile = {
  dock: {
    modes: 'edit',
    render: (ctx) => (
      <GitPanel
        model={ctx.model}
        plane={ctx.viewPlane}
        selection={ctx.selection}
        onCommand={ctx.onCommand}
        onSelect={(id) => ctx.select({ kind: 'node', id })}
      />
    ),
  },
};
