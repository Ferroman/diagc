import type { StudioNotationProfile } from '../types';
import { flowKind } from './connectKind';
import { threatModelQuickAdd } from './quickAdd';
import { ThreatModelPanel } from './ThreatModelPanel';

export const THREAT_MODEL: StudioNotationProfile = {
  // the notation is the STRIDE data-flow diagram; 'Threat model' alone would
  // read as a category rather than the method the plane is drawn in
  label: 'Threat model (STRIDE)',
  dock: {
    // In view mode too, unlike the other notations' panels: this one only reads
    // the model, and the register and the crossings still to review are as much
    // use on a read-only .diagram.ts threat model as on an editable one.
    modes: 'both',
    render: (ctx) => <ThreatModelPanel model={ctx.model} plane={ctx.viewPlane} onSelect={ctx.select} />,
  },
  connectKind: flowKind,
  quickAdd: threatModelQuickAdd,
};
