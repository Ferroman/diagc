import type { StudioNotationProfile } from '../types';
import { StateMachinePanel } from './StateMachinePanel';
import { smConnectKind, stateMachineQuickAdd } from './quickAdd';

/** What a state machine adds to the studio: the transition a connect draws and
 * the `+` recipes, and a panel that reads the machine in view mode too. */
export const STATE_MACHINE: StudioNotationProfile = {
  label: 'State machine (UML)',
  dock: {
    modes: 'both',
    render: (ctx) => (
      <StateMachinePanel
        model={ctx.model}
        viewPlane={ctx.viewPlane}
        scopePlane={ctx.scopePlane}
        selection={ctx.selection}
        editing={ctx.editing}
        onCommand={ctx.onCommand}
        onSelect={ctx.select}
        onCreated={ctx.requestLabelEdit}
        onUnfold={ctx.unfold}
      />
    ),
  },
  connectKind: smConnectKind,
  quickAdd: stateMachineQuickAdd,
};
