import type { StudioNotationProfile } from '../types';
import { smConnectKind, stateMachineQuickAdd } from './quickAdd';

/** What a state machine adds to the studio: the transition a connect draws and
 * the `+` recipes; later capabilities (dock) hang off this entry. */
export const STATE_MACHINE: StudioNotationProfile = {
  label: 'State machine (UML)',
  connectKind: smConnectKind,
  quickAdd: stateMachineQuickAdd,
};
