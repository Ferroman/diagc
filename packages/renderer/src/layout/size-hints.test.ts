import { describe, expect, it } from 'vitest';
import { DEFAULT_IMAGE_NODE_SIZE, type DiagramModel, type DiagramNode } from '@diagc/core/internal';
import { CAPTION_HEIGHT, captionWidth, estimateLabelSize, glyphCaptionSize } from '../node/label-size';
import { tableSize } from '../node/table-ports';
import { notationProfile } from '../notations';
import { createTypeRegistry } from '../registry';
import { sizeHintFor, sizeHintsOf, type SizeHintContext } from './size-hints';

const plain: SizeHintContext = { profile: notationProfile(), typeRegistry: createTypeRegistry(), sizes: undefined };
const cld: SizeHintContext = { ...plain, profile: notationProfile('causal-loop') };
const saved = (id: string, w: number, h: number): SizeHintContext => ({ ...plain, sizes: { [id]: { w, h } } });
const node = (fields: Partial<DiagramNode>): DiagramNode => ({ id: 'n', name: 'Name', ...fields });

describe('sizeHintFor, one rule at a time', () => {
  it("gives a plain one-line box no hint, so it takes the layout's leaf size", () => {
    expect(sizeHintFor(node({}), plain)).toBeUndefined();
  });

  it("takes the notation's leaf size", () => {
    expect(sizeHintFor(node({}), cld)).toEqual({ width: 140, height: 48 });
  });

  it("takes a glyph's registry size and hangs its caption below", () => {
    expect(sizeHintFor(node({ type: 'activity-decision', name: 'Paid?' }), plain)).toEqual({
      width: 48,
      height: 48,
      caption: glyphCaptionSize('Paid?'),
    });
  });

  it("takes a glyph's saved size over its registry size, and reserves no caption for a blank name", () => {
    expect(sizeHintFor(node({ type: 'activity-decision', name: '  ' }), saved('n', 60, 60))).toEqual({
      width: 60,
      height: 60,
      caption: undefined,
    });
  });

  it('widens an image for its caption and reserves the caption strip below it', () => {
    const name = 'A rather long image caption';
    expect(sizeHintFor(node({ image: 'icon:server', name }), plain)).toEqual({
      width: Math.max(DEFAULT_IMAGE_NODE_SIZE.w, captionWidth(name)),
      height: DEFAULT_IMAGE_NODE_SIZE.h,
      reserveBottom: CAPTION_HEIGHT,
    });
  });

  it('reserves nothing below an image drawn as corner chrome', () => {
    expect(sizeHintFor(node({ type: 'aws-vpc', image: 'icon:vpc' }), plain)).toBeUndefined();
  });

  it("takes a silhouette's saved size, and gives it none without one", () => {
    expect(sizeHintFor(node({ shape: 'cylinder' }), saved('n', 90, 70))).toEqual({ width: 90, height: 70 });
    expect(sizeHintFor(node({ shape: 'cylinder' }), plain)).toBeUndefined();
  });

  it('estimates a multi-line label, at its font scale', () => {
    expect(sizeHintFor(node({ name: 'one\ntwo', fontScale: 'lg' }), plain)).toEqual(
      estimateLabelSize('one\ntwo', 'lg'),
    );
  });

  it('sizes a database table to its header and every row', () => {
    const columns = [{ name: 'id', pk: true }, { name: 'email' }];
    expect(sizeHintFor(node({ type: 'db-table', name: 'users', columns }), plain)).toEqual(tableSize(columns, 'users'));
  });

  it('leaves a saved size alone for a multi-line label and a table', () => {
    expect(sizeHintFor(node({ name: 'one\ntwo' }), saved('n', 90, 70))).toBeUndefined();
    expect(sizeHintFor(node({ type: 'db-table', columns: [{ name: 'id' }] }), saved('n', 90, 70))).toBeUndefined();
  });
});

describe('sizeHintFor, where two rules apply', () => {
  it("a multi-line causal-loop variable takes the label estimate over the notation's leaf size", () => {
    expect(sizeHintFor(node({ name: 'one\ntwo' }), cld)).toEqual(estimateLabelSize('one\ntwo'));
  });

  it('a send signal with a multi-line name takes the label estimate over its registry size', () => {
    expect(sizeHintFor(node({ type: 'activity-send', name: 'one\ntwo' }), plain)).toEqual(
      estimateLabelSize('one\ntwo'),
    );
  });

  it('a glyph with a multi-line name keeps its registry size and its caption', () => {
    expect(sizeHintFor(node({ type: 'activity-decision', name: 'Paid\nin full?' }), plain)).toEqual({
      width: 48,
      height: 48,
      caption: glyphCaptionSize('Paid\nin full?'),
    });
  });

  it("a silhouette's saved size drops an image's caption strip", () => {
    expect(sizeHintFor(node({ image: 'icon:server', shape: 'cylinder' }), saved('n', 90, 70))).toEqual({
      width: 90,
      height: 70,
    });
  });

  it('an image with a silhouette and no saved size keeps its caption strip', () => {
    expect(sizeHintFor(node({ image: 'icon:server', shape: 'cylinder' }), plain)).toMatchObject({
      reserveBottom: CAPTION_HEIGHT,
    });
  });

  it('an image keeps its picture size whatever its name says', () => {
    expect(sizeHintFor(node({ image: 'icon:server', name: 'one\ntwo' }), plain)).toMatchObject({
      height: DEFAULT_IMAGE_NODE_SIZE.h,
      reserveBottom: CAPTION_HEIGHT,
    });
  });
});

describe('sizeHintsOf', () => {
  it('holds a hint for each node that has one, and none for the rest', () => {
    const model = {
      nodes: [node({ id: 'a' }), node({ id: 'b', name: 'one\ntwo' })],
    } as unknown as DiagramModel;
    expect([...sizeHintsOf(model, plain)]).toEqual([['b', estimateLabelSize('one\ntwo')]]);
  });
});
