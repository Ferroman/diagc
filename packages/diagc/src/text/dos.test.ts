import { describe, expect, it } from 'vitest';
import type { DiagramModel } from '@diagc/core/internal';
import { hueInk, typeSlots } from '../../../renderer/src/canvas/type-hues';
import { notationProfile } from '../../../renderer/src/notations';
import { createTypeRegistry } from '../../../renderer/src/registry';
import { stylePreset } from '../../../renderer/src/sketch/stylePresets';
import { parseColor } from './ansi';
import { DOS_PALETTE, dosSlots, inkOn, styleOf } from './dos';

const modelOf = (nodes: DiagramModel['nodes'], containment: DiagramModel['containment'] = []): DiagramModel => ({
  version: 1,
  id: 'm',
  name: 'm',
  nodes,
  containment,
  relations: [],
  layers: [],
  planes: [],
});

describe('the DOS look', () => {
  it("colours boxes from the renderer's DOS palette, in its order", () => {
    expect(DOS_PALETTE).toEqual(stylePreset('dos').palette);
  });

  it('gives each type the slot the renderer gives it: what contains nothing first', () => {
    const model = modelOf(
      [
        { id: 'g', name: 'G', type: 'platform' },
        { id: 'a', name: 'A', type: 'service' },
        { id: 'b', name: 'B', type: 'database' },
        { id: 'c', name: 'C', type: 'service' },
      ],
      [{ parent: 'g', child: 'a' }],
    );
    expect(dosSlots(model, undefined)).toEqual(typeSlots(model, createTypeRegistry()));
    expect(dosSlots(model, undefined).get('platform')).toBe(2);
  });

  it("shares a slot between the types a notation fills alike, as C4's containers", () => {
    const model = modelOf([
      { id: 'p', name: 'P', type: 'c4-person' },
      { id: 'w', name: 'W', type: 'c4-container-web' },
      { id: 'd', name: 'D', type: 'c4-container-db' },
      { id: 's', name: 'S', type: 'c4-system-external' },
      { id: 'x', name: 'X', type: 'c4-container-external' },
    ]);
    const c4 = createTypeRegistry(notationProfile('c4').typeStyles);
    expect(dosSlots(model, 'c4')).toEqual(typeSlots(model, c4));
    expect(dosSlots(model, 'c4').get('c4-container-db')).toBe(dosSlots(model, 'c4').get('c4-container-web'));
  });

  it('writes black or white on a colour, whichever the renderer would', () => {
    for (const css of [...DOS_PALETTE, '#0000aa', '#08427b', '#1168bd', '#999999', '#c62828', '#ffffff', '#000']) {
      const ink = inkOn(parseColor(css)!);
      expect(ink.rgb).toEqual(parseColor(hueInk(css)!));
    }
  });

  it('draws a diagram in DOS where it asks for the DOS style, and plain for any other', () => {
    expect(styleOf({ style: 'dos' })).toBe('dos');
    expect(styleOf({ style: 'sketch' })).toBe('clean');
    expect(styleOf({})).toBe('clean');
  });
});
