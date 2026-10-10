// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_FRAME_TYPE,
  ACTIVITY_LANE_TYPE,
  ACTIVITY_REGION_TYPE,
  FB_CAUSE_TYPE,
  FB_EFFECT_TYPE,
  GIT_NOTATION,
  GIT_STAGE_TYPE,
  PLAN_EVENT_TYPE,
  TM_NOTATION,
} from '@diagc/core/internal';
import { createIconRegistry } from '@diagc/icons';
import { createTypeRegistry } from '../registry';
import { NoteStateContext, type NoteState } from '../notes/note-state';
import { DiagramNode, type DiagramNodeData } from './DiagramNode';

// Which of the shared chrome each body draws, and in what order: the link
// badge, the threat badge (a count, or the offer of a first threat), the
// comment badge, the quick-add button and the four connect handles. Every case
// offers all of it (a link, threats, comments, a recipe, selected), so what a
// body leaves out is a decision, not missing data.
const notes: NoteState = { isOpen: () => false, toggle: () => {}, placeBadge: () => {} };

function renderNode(partial: Partial<DiagramNodeData>): HTMLElement {
  const data: DiagramNodeData = {
    label: 'n',
    state: 'leaf',
    promoted: false,
    sharedMembers: [],
    hiddenCount: 0,
    typeRegistry: createTypeRegistry({ dot: { shape: 'circle' }, grid: { shape: 'table' } }),
    icons: createIconRegistry(),
    link: 'https://example.com',
    threats: { open: 1, total: 2 },
    annotations: { comments: 1, links: 0 },
    quickAdd: { label: () => 'Add', run: () => {} },
    ...partial,
  };
  const { container } = render(
    <ReactFlowProvider>
      <NoteStateContext.Provider value={notes}>
        <DiagramNode id="n1" data={data} selected width={100} height={40} />
      </NoteStateContext.Provider>
    </ReactFlowProvider>,
  );
  return container;
}

function chromeOf(partial: Partial<DiagramNodeData>): string {
  const container = renderNode(partial);
  const parts: string[] = [];
  for (const el of container.querySelectorAll(
    '.dg-link-badge, .dg-threat-badge, .dg-comment-badge, .dg-quick-add, .dg-handle',
  )) {
    const part = el.classList.contains('dg-link-badge')
      ? 'link'
      : el.classList.contains('dg-threat-badge')
        ? `threat${el.getAttribute('data-state') === 'empty' ? '(offer)' : ''}`
        : el.classList.contains('dg-comment-badge')
          ? 'comment'
          : el.classList.contains('dg-quick-add')
            ? `quickAdd${el.getAttribute('data-side') !== null ? `(${el.getAttribute('data-side')})` : ''}`
            : 'handle';
    if (part === 'handle' && parts.at(-1) === 'handles') continue;
    parts.push(part === 'handle' ? 'handles' : part);
  }
  return parts.join(' ');
}

describe('the chrome each node body draws', () => {
  it.each([
    ['table', { typeId: 'grid' }, 'link quickAdd'],
    ['commit (a circle)', { typeId: 'dot' }, 'link quickAdd handles'],
    ['plan event', { typeId: PLAN_EVENT_TYPE }, 'link comment quickAdd handles'],
    ['silhouette', { typeId: 'service', shape: 'robot.svg' }, 'link quickAdd handles'],
    ['image', { typeId: 'service', image: 'abc.png' }, 'link quickAdd handles'],
    ['git lane', { notation: GIT_NOTATION, typeId: 'branch', state: 'expanded' as const }, 'quickAdd handles'],
    ['fishbone effect', { typeId: FB_EFFECT_TYPE }, 'quickAdd handles'],
    ['fishbone cause', { typeId: FB_CAUSE_TYPE }, 'quickAdd handles'],
    ['git stage', { typeId: GIT_STAGE_TYPE, state: 'expanded' as const }, ''],
    ['activity frame', { typeId: ACTIVITY_FRAME_TYPE, state: 'expanded' as const }, 'handles'],
    [
      'activity lane',
      { typeId: ACTIVITY_LANE_TYPE, state: 'expanded' as const },
      'handles quickAdd(before) quickAdd(after)',
    ],
    ['activity region', { typeId: ACTIVITY_REGION_TYPE, state: 'expanded' as const }, 'handles'],
    ['causal-loop group', { notation: 'causal-loop' as const, state: 'expanded' as const }, 'handles'],
    ['group', { typeId: 'service', state: 'expanded' as const }, 'threat comment quickAdd handles'],
    ['box', { typeId: 'service' }, 'link threat comment quickAdd handles'],
    ['causal-loop text', { notation: 'causal-loop' as const }, 'link threat comment quickAdd handles'],
  ])('%s', (_name, partial, chrome) => {
    expect(chromeOf(partial)).toBe(chrome);
  });

  it('offers the first threat where a box would count them, on a threat model only', () => {
    const offer = { threats: undefined, onAddThreat: () => {} };
    expect(chromeOf({ typeId: 'service', notation: TM_NOTATION, ...offer })).toBe(
      'link threat(offer) comment quickAdd handles',
    );
    expect(chromeOf({ typeId: 'service', ...offer })).toBe('link comment quickAdd handles');
  });

  it("keeps an external stub's badges the passive count: its note belongs to the view that draws the node", () => {
    const container = renderNode({ typeId: 'service', external: true });
    expect(chromeOf({ typeId: 'service', external: true })).toBe('link threat comment quickAdd handles');
    expect(container.querySelector('span.dg-threat-badge')).not.toBeNull();
    expect(container.querySelector('span.dg-comment-badge')).not.toBeNull();
    expect(container.querySelectorAll('button.dg-threat-badge, button.dg-comment-badge')).toHaveLength(0);
  });
});
