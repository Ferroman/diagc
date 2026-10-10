import { describe, expect, it } from 'vitest';
import { CommandError } from './command-error';
import { FISHBONE_NOTATION } from './notations/fishbone/fishbone';
import { GIT_NOTATION } from './notations/git-graph/git-graph';
import {
  canonicalPlane,
  containmentOn,
  containmentPlaneOf,
  defaultPlaneOf,
  isOnPlane,
  layoutPlaneKey,
  notationPlane,
  viewedPlane,
} from './planes';
import type { DiagramModel, DiagramPlane } from './types';

const doc = (planes: DiagramPlane[], containment: DiagramModel['containment'] = []): DiagramModel => ({
  version: 1,
  id: 't',
  name: 't',
  nodes: [],
  containment,
  relations: [],
  layers: [],
  planes,
});
const arch: DiagramPlane = { id: 'arch', name: 'Architecture' };
const infra: DiagramPlane = { id: 'infra', name: 'Infrastructure' };
const flow: DiagramPlane = { id: 'flow', name: 'Flow', containmentOf: 'arch' };

describe('defaultPlaneOf', () => {
  it('is the first plane declared', () => expect(defaultPlaneOf(doc([arch, infra]))).toBe('arch'));
  it('is undefined without planes', () => expect(defaultPlaneOf(doc([]))).toBeUndefined());
});

describe('viewedPlane', () => {
  it('is the named plane', () => expect(viewedPlane([arch, infra], 'infra')).toBe(infra));
  it('is the first plane when none is named', () => expect(viewedPlane([arch, infra])).toBe(arch));
  it('is the plane itself when it borrows containment', () => expect(viewedPlane([arch, flow], 'flow')).toBe(flow));
  it('is undefined for an unknown plane', () => expect(viewedPlane([arch], 'nope')).toBeUndefined());
  it('is undefined without planes', () => expect(viewedPlane([])).toBeUndefined());
});

describe('containmentPlaneOf', () => {
  it("is the plane's own id", () => expect(containmentPlaneOf(doc([arch, infra]), 'infra')).toBe('infra'));
  it("is the donor's id for a plane that borrows", () =>
    expect(containmentPlaneOf(doc([arch, flow]), 'flow')).toBe('arch'));
  it('reads the default plane when none is named', () => expect(containmentPlaneOf(doc([flow, arch]))).toBe('arch'));
  it('is undefined for an unknown plane', () => expect(containmentPlaneOf(doc([arch]), 'nope')).toBeUndefined());
  it('is undefined without planes', () => expect(containmentPlaneOf(doc([]))).toBeUndefined());
});

describe('isOnPlane and containmentOn', () => {
  const m = doc(
    [arch, infra],
    [
      { parent: 'a', child: 'b' },
      { parent: 'a', child: 'c', plane: 'arch' },
      { parent: 'a', child: 'd', plane: 'infra' },
    ],
  );

  it('puts an untagged edge on the default plane', () => {
    expect(isOnPlane(m.containment[0]!, 'arch', m)).toBe(true);
    expect(isOnPlane(m.containment[0]!, 'infra', m)).toBe(false);
  });

  it('puts an edge that names the default plane on it too', () => {
    expect(isOnPlane(m.containment[1]!, 'arch', m)).toBe(true);
  });

  it("lists a plane's edges in declaration order", () => {
    expect(containmentOn(m, 'arch').map((e) => e.child)).toEqual(['b', 'c']);
    expect(containmentOn(m, 'infra').map((e) => e.child)).toEqual(['d']);
  });

  it('puts every untagged edge of a model without planes on the plane `undefined`', () => {
    const bare = doc([], [{ parent: 'a', child: 'b' }]);
    expect(containmentOn(bare, undefined)).toEqual(bare.containment);
  });
});

describe('canonicalPlane', () => {
  it('leaves an absent plane absent', () => expect(canonicalPlane(doc([arch, infra]))).toBeUndefined());
  it('writes the default plane untagged', () => expect(canonicalPlane(doc([arch, infra]), 'arch')).toBeUndefined());
  it('keeps another plane', () => expect(canonicalPlane(doc([arch, infra]), 'infra')).toBe('infra'));
  it('resolves a borrow, then collapses the default', () =>
    expect(canonicalPlane(doc([arch, flow]), 'flow')).toBeUndefined());
  it('throws on an unknown plane', () =>
    expect(() => canonicalPlane(doc([arch]), 'nope')).toThrowError(new CommandError("Unknown plane 'nope'")));
});

describe('layoutPlaneKey', () => {
  it('files a borrowing plane under its donor', () => expect(layoutPlaneKey(doc([arch, flow]), 'flow')).toBe('arch'));
  it('files the default view under the default plane', () => expect(layoutPlaneKey(doc([arch, flow]))).toBe('arch'));
  it("is 'default' without planes", () => expect(layoutPlaneKey(doc([]))).toBe('default'));
});

describe('notationPlane', () => {
  it('finds the first plane with the notation', () => {
    const git: DiagramPlane = { id: 'g', name: 'G', notation: GIT_NOTATION };
    expect(notationPlane(doc([arch, git]), GIT_NOTATION)).toEqual({ plane: git });
  });

  it("gives a plane without its own notation the model's", () => {
    const m = { ...doc([arch]), notation: GIT_NOTATION } as DiagramModel;
    expect(notationPlane(m, GIT_NOTATION)).toEqual({ plane: arch });
  });

  it('is {} for a model without planes that has the notation', () => {
    const m = { ...doc([]), notation: GIT_NOTATION } as DiagramModel;
    expect(notationPlane(m, GIT_NOTATION)).toEqual({});
  });

  it('is undefined where nothing draws the notation', () => {
    const fish: DiagramPlane = { id: 'f', name: 'F', notation: FISHBONE_NOTATION };
    const m = { ...doc([fish]), notation: GIT_NOTATION } as DiagramModel;
    expect(notationPlane(m, GIT_NOTATION)).toBeUndefined();
    expect(notationPlane(doc([]), GIT_NOTATION)).toBeUndefined();
  });
});
