import { describe, expect, it } from 'vitest';
import { ACTIVITY_LANE_TYPE, GIT_STAGE_TYPE, type DiagramNode, type ViewNode } from '@diagc/core/internal';
import { notationProfile, type NotationProfile } from '../notations';
import { createTypeRegistry } from '../registry';
import { nodeFrameProps, type NodeFrameContext } from './node-frame';

const geo = { x: 10, y: 20, width: 140, height: 60 };
const size = { width: 140, height: 60 };

const viewNode = (node: Partial<DiagramNode> = {}, state: ViewNode['state'] = 'leaf'): ViewNode => ({
  id: 'n',
  node: { id: 'n', name: 'N', type: 'service', ...node },
  state,
  children: [],
  promoted: false,
  sharedMembers: [],
});

const elk = notationProfile(undefined);
/** a notation that owns its plane's arrangement */
const owned: NotationProfile = {
  ...elk,
  layout: (() => ({ geometry: new Map() })) as unknown as NotationProfile['layout'],
};

const ctx = (over: Partial<NodeFrameContext> = {}): NodeFrameContext => ({
  editing: true,
  profile: elk,
  typeRegistry: createTypeRegistry({ dot: { shape: 'circle' } }),
  fixed: new Set(),
  ...over,
});

describe('nodeFrameProps: dragging', () => {
  it('locks a node the layout fixed, and gives it back the press in edit mode only', () => {
    const fixed = new Set(['n']);
    expect(nodeFrameProps(viewNode(), geo, undefined, ctx({ fixed }))).toMatchObject({
      draggable: false,
      className: 'nopan',
    });
    expect(nodeFrameProps(viewNode(), geo, undefined, ctx({ fixed, editing: false }))).toMatchObject({
      draggable: false,
      className: undefined,
    });
  });

  it('lets a fixed node drag when the notation says its drag still means something', () => {
    const profile: NotationProfile = { ...elk, node: { ...elk.node, draggableWhenFixed: () => true } };
    const frame = nodeFrameProps(viewNode(), geo, undefined, ctx({ fixed: new Set(['n']), profile }));
    expect(frame.draggable).toBeUndefined();
    expect(frame.className).toBeUndefined();
  });
});

describe('nodeFrameProps: keeping to the parent', () => {
  it('holds nothing at the top level', () => {
    const frame = nodeFrameProps(viewNode(), geo, undefined, ctx());
    expect(frame.expandParent).toBeUndefined();
    expect(frame.extent).toBeUndefined();
  });

  it('grows the parent around a child under elk, in both modes', () => {
    expect(nodeFrameProps(viewNode(), geo, 'p', ctx()).expandParent).toBe(true);
    expect(nodeFrameProps(viewNode(), geo, 'p', ctx({ editing: false })).expandParent).toBe(true);
  });

  it("clamps a child inside a notation's own arrangement while editing, and not in view mode", () => {
    expect(nodeFrameProps(viewNode(), geo, 'p', ctx({ profile: owned }))).toMatchObject({ extent: 'parent' });
    const view = nodeFrameProps(viewNode(), geo, 'p', ctx({ profile: owned, editing: false }));
    expect(view.extent).toBeUndefined();
    expect(view.expandParent).toBeUndefined();
  });

  it('holds back nothing from a node a drag may drop into another parent', () => {
    const profile: NotationProfile = {
      ...owned,
      node: { ...owned.node, dropTarget: () => true, canDrop: () => true } as NotationProfile['node'],
    };
    const frame = nodeFrameProps(viewNode(), geo, 'p', ctx({ profile }));
    expect(frame.extent).toBeUndefined();
    expect(frame.expandParent).toBeUndefined();
  });
});

describe('nodeFrameProps: size', () => {
  it('sizes an open container from the layout, behind its children', () => {
    expect(nodeFrameProps(viewNode({}, 'expanded'), geo, undefined, ctx())).toMatchObject({ style: size, zIndex: -1 });
  });

  it('puts a git stage behind the lanes it spans', () => {
    const stage = viewNode({ type: GIT_STAGE_TYPE }, 'collapsed');
    expect(nodeFrameProps(stage, geo, undefined, ctx())).toMatchObject({ style: size, zIndex: -2 });
  });

  it('sizes an image or a shape leaf from the layout', () => {
    expect(nodeFrameProps(viewNode({ image: 'a.png' }), geo, undefined, ctx()).style).toEqual(size);
    expect(nodeFrameProps(viewNode({ shape: '/s.svg' }), geo, undefined, ctx()).style).toEqual(size);
  });

  it('sizes a leaf with no CSS-natural size: a forced shape, activity chrome, a lane', () => {
    expect(nodeFrameProps(viewNode({ type: 'dot' }), geo, undefined, ctx()).style).toEqual(size);
    expect(nodeFrameProps(viewNode({ type: ACTIVITY_LANE_TYPE }), geo, undefined, ctx()).style).toEqual(size);
    const lanes: NotationProfile = { ...elk, node: { ...elk.node, isLane: (t: string) => t === 'branch' } };
    expect(nodeFrameProps(viewNode({ type: 'branch' }), geo, undefined, ctx({ profile: lanes })).style).toEqual(size);
  });

  it('floors an ordinary box at the width elk laid out, and leaves its height to CSS', () => {
    const frame = nodeFrameProps(viewNode(), geo, undefined, ctx());
    expect(frame.style).toEqual({ minWidth: 140 });
    expect(frame.zIndex).toBeUndefined();
  });

  it("sets no size on an ordinary box a notation's layout placed, nor on a typeless text node", () => {
    expect(nodeFrameProps(viewNode(), geo, undefined, ctx({ profile: owned })).style).toBeUndefined();
    const text: NotationProfile = { ...elk, node: { ...elk.node, typelessAsText: true } };
    expect(nodeFrameProps(viewNode({ type: undefined }), geo, undefined, ctx({ profile: text })).style).toBeUndefined();
  });

  it('keeps the frame keys in the order React Flow is handed them', () => {
    const fixed = new Set(['n']);
    const frame = nodeFrameProps(viewNode({}, 'expanded'), geo, 'p', ctx({ fixed }));
    expect(Object.keys(frame)).toEqual(['draggable', 'className', 'expandParent', 'style', 'zIndex']);
  });
});
