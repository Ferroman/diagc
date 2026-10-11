import type { StudioNotationProfile } from '../types';
import { causalLoopQuickAdd } from './quickAdd';

export const CAUSAL_LOOP: StudioNotationProfile = {
  loopAnalysis: true,
  quickAdd: causalLoopQuickAdd,
};
