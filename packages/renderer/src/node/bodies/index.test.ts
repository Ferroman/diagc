import { describe, expect, it } from 'vitest';
import { ACTIVITY_LANE_TYPE, FB_EFFECT_TYPE, GIT_NOTATION, PLAN_EVENT_TYPE } from '@diagc/core/internal';
import { createIconRegistry } from '@diagc/icons';
import { notationProfile } from '../../notations';
import { createTypeRegistry } from '../../registry';
import type { DiagramNodeData } from '../DiagramNode';
import { ActivityBandBody } from './ActivityBandBody';
import { BoxBody } from './BoxBody';
import { CausalGroupBody } from './CausalGroupBody';
import { CommitBody } from './CommitBody';
import { FishboneEffectBody } from './FishboneEffectBody';
import { GitLaneBody } from './GitLaneBody';
import { GroupBody } from './GroupBody';
import { ImageBody } from './ImageBody';
import { NODE_BODIES } from './index';
import { PlanEventBody } from './PlanEventBody';
import { SilhouetteBody } from './SilhouetteBody';
import { TableBody } from './TableBody';

const typeRegistry = createTypeRegistry({
  dot: { shape: 'circle' },
  grid: { shape: 'table' },
  region: { shape: 'box', cornerBadge: true },
});

/** The body DiagramNode would pick, the way it picks it. */
function bodyFor(partial: Partial<DiagramNodeData>) {
  const data: DiagramNodeData = {
    label: 'n',
    state: 'leaf',
    promoted: false,
    sharedMembers: [],
    hiddenCount: 0,
    typeRegistry,
    icons: createIconRegistry(),
    ...partial,
  };
  const style = data.typeId !== undefined ? typeRegistry.resolve(data.typeId) : { shape: 'box' as const };
  const profile = notationProfile(data.notation);
  return NODE_BODIES.find((rule) => rule.match(data, profile, style))!.Body;
}

describe('NODE_BODIES', () => {
  it('draws a table leaf as a table, image and silhouette notwithstanding', () => {
    expect(bodyFor({ typeId: 'grid', image: 'a.png', shape: 'b.svg' })).toBe(TableBody);
  });
  it('draws a circle leaf as a commit, image notwithstanding', () => {
    expect(bodyFor({ typeId: 'dot', image: 'a.png' })).toBe(CommitBody);
  });
  it('draws a plan event as one, silhouette notwithstanding', () => {
    expect(bodyFor({ typeId: PLAN_EVENT_TYPE, shape: 'b.svg' })).toBe(PlanEventBody);
  });
  it('prefers a silhouette to an image', () => {
    expect(bodyFor({ typeId: 'service', shape: 'b.svg', image: 'a.png' })).toBe(SilhouetteBody);
    expect(bodyFor({ typeId: 'service', image: 'a.png' })).toBe(ImageBody);
  });
  it("keeps a corner-badge type's image as chrome: its leaf is a box", () => {
    expect(bodyFor({ typeId: 'region', image: 'a.png' })).toBe(BoxBody);
  });
  it('draws the leaf-only bodies as a group once the node is open', () => {
    for (const typeId of ['grid', 'dot', PLAN_EVENT_TYPE]) {
      expect(bodyFor({ typeId, state: 'expanded' })).toBe(GroupBody);
    }
    expect(bodyFor({ typeId: 'service', image: 'a.png', state: 'expanded' })).toBe(GroupBody);
  });
  it('draws a git branch as a lane, empty or not, on a git graph only', () => {
    expect(bodyFor({ notation: GIT_NOTATION, typeId: 'branch' })).toBe(GitLaneBody);
    expect(bodyFor({ notation: GIT_NOTATION, typeId: 'branch', state: 'expanded' })).toBe(GitLaneBody);
    expect(bodyFor({ typeId: 'branch' })).toBe(BoxBody);
  });
  it('keys notation chrome on the type, not the fold state', () => {
    expect(bodyFor({ typeId: FB_EFFECT_TYPE, state: 'collapsed' })).toBe(FishboneEffectBody);
    expect(bodyFor({ typeId: ACTIVITY_LANE_TYPE })).toBe(ActivityBandBody);
  });
  it('draws an open causal-loop group as its tag, and a folded one as a text box', () => {
    expect(bodyFor({ notation: 'causal-loop', state: 'expanded' })).toBe(CausalGroupBody);
    expect(bodyFor({ notation: 'causal-loop', state: 'collapsed' })).toBe(BoxBody);
  });
  it('ends with a rule that takes every node', () => {
    expect(NODE_BODIES.at(-1)!.Body).toBe(BoxBody);
    expect(bodyFor({})).toBe(BoxBody);
  });
});
