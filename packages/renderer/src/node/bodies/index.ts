import {
  ACTIVITY_REGION_TYPE,
  FB_CAUSE_TYPE,
  FB_EFFECT_TYPE,
  GIT_STAGE_TYPE,
  isActivityBand,
  PLAN_EVENT_TYPE,
} from '@diagc/core/internal';
import { isCausalGroup } from '../node-look';
import { ActivityBandBody } from './ActivityBandBody';
import { ActivityRegionBody } from './ActivityRegionBody';
import { BoxBody } from './BoxBody';
import { CausalGroupBody } from './CausalGroupBody';
import { CommitBody } from './CommitBody';
import { FishboneCauseBody } from './FishboneCauseBody';
import { FishboneEffectBody } from './FishboneEffectBody';
import { GitLaneBody } from './GitLaneBody';
import { GitStageBody } from './GitStageBody';
import { GroupBody } from './GroupBody';
import { ImageBody } from './ImageBody';
import { PlanEventBody } from './PlanEventBody';
import { SilhouetteBody } from './SilhouetteBody';
import { TableBody } from './TableBody';
import type { BodyRule } from './types';

/**
 * Which body draws a node: the first rule that matches. The order is the
 * precedence — a table leaf with an image is a table, a circle leaf with an
 * image is a commit — and the last rule takes every node the others leave.
 * Adding a body is a component, one line here, and the chrome it uses.
 */
export const NODE_BODIES: readonly BodyRule[] = [
  { match: (data, _profile, style) => style.shape === 'table' && data.state === 'leaf', Body: TableBody },
  { match: (data, _profile, style) => style.shape === 'circle' && data.state === 'leaf', Body: CommitBody },
  { match: (data) => data.typeId === PLAN_EVENT_TYPE && data.state === 'leaf', Body: PlanEventBody },
  { match: (data) => data.shape !== undefined && data.state === 'leaf', Body: SilhouetteBody },
  // A cornerBadge type's image is container chrome, not the node's body: its
  // leaf keeps the typed-box look (inline thumb) so a group placed before it
  // has children doesn't balloon into a stretched icon.
  {
    match: (data, _profile, style) => data.image !== undefined && data.state === 'leaf' && style.cornerBadge !== true,
    Body: ImageBody,
  },
  // Not gated on the node having members: a branch with no commits yet has no
  // children, so the view compiler marks it 'leaf' — but it is still a lane
  // row (the notation keeps every lane, empty or not, drawn full-width by
  // gitLayout), not an ordinary leaf box.
  {
    match: (data, profile) => data.typeId !== undefined && profile.node?.isLane?.(data.typeId) === true,
    Body: GitLaneBody,
  },
  { match: (data) => data.typeId === FB_EFFECT_TYPE, Body: FishboneEffectBody },
  { match: (data) => data.typeId === FB_CAUSE_TYPE, Body: FishboneCauseBody },
  { match: (data) => data.typeId === GIT_STAGE_TYPE, Body: GitStageBody },
  // Activity chrome keys on the type, not container state: an empty lane or
  // frame has no children, compiles as 'leaf', and must still render as a
  // band/frame — never as an ordinary leaf box (the git empty-lane lesson).
  { match: (data) => isActivityBand(data.typeId), Body: ActivityBandBody },
  { match: (data) => data.typeId === ACTIVITY_REGION_TYPE, Body: ActivityRegionBody },
  { match: (data, profile) => isCausalGroup(data, profile) && data.state === 'expanded', Body: CausalGroupBody },
  { match: (data) => data.state === 'expanded', Body: GroupBody },
  { match: () => true, Body: BoxBody },
];
