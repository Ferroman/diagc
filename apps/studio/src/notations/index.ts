import {
  CAUSAL_LOOP_NOTATION,
  DEPLOY_NOTATION,
  FISHBONE_NOTATION,
  GIT_NOTATION,
  PLAN_NOTATION,
  SECOND_ORDER_NOTATION,
  TM_NOTATION,
  type NotationId,
} from '@diagc/core/internal';
import { CAUSAL_LOOP } from './causal-loop/profile';
import { FISHBONE } from './fishbone/profile';
import { GIT_GRAPH } from './git-graph/profile';
import { PLAN } from './plan/profile';
import { SECOND_ORDER } from './second-order/profile';
import { THREAT_MODEL } from './threat-model/profile';
import type { StudioNotationProfile } from './types';

// Record<NotationId, ...> keying means adding a notation id to BUILTIN_NOTATIONS
// forces a compile error here until its entry is added — intended. A stencil
// notation, which only changes how the renderer draws, adds nothing here.
export const STUDIO_NOTATIONS: Record<NotationId, StudioNotationProfile> = {
  [CAUSAL_LOOP_NOTATION]: CAUSAL_LOOP,
  [GIT_NOTATION]: GIT_GRAPH,
  c4: {},
  [SECOND_ORDER_NOTATION]: SECOND_ORDER,
  [FISHBONE_NOTATION]: FISHBONE,
  [TM_NOTATION]: THREAT_MODEL,
  [PLAN_NOTATION]: PLAN,
  [DEPLOY_NOTATION]: {},
};

const DEFAULT_PROFILE: StudioNotationProfile = {};

/** What the plane's notation adds; a plane drawn in the default look adds nothing. */
export const studioNotation = (id?: NotationId): StudioNotationProfile =>
  id !== undefined ? (STUDIO_NOTATIONS[id] ?? DEFAULT_PROFILE) : DEFAULT_PROFILE;

/** The name a notation select shows: the entry's label, else derived from the
 * id ('causal-loop' → 'Causal loop'). */
export const notationLabel = (id: NotationId): string =>
  STUDIO_NOTATIONS[id].label ?? id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, ' ');
