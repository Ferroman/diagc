import { describe, expect, it } from 'vitest';
import { model } from '@diagc/core/internal';
import { createTypeRegistry } from '../registry';
import { stylePreset } from '../sketch/stylePresets';
import { hueInk, nodeHue, typeHuesOf, typeSlots } from './type-hues';

const registry = createTypeRegistry();

/** sys contains api, db and web; `loose` is untyped */
function platform() {
  const m = model('p');
  const sys = m.node('sys', { type: 'system' });
  const api = m.node('api', { type: 'service' });
  const db = m.node('db', { type: 'table' });
  const web = m.node('web', { type: 'service' });
  m.node('loose');
  sys.contains(api, db, web);
  return m.toJSON();
}

describe('typeSlots', () => {
  it('numbers types by first appearance, the types of boxes that contain nothing first', () => {
    expect([...typeSlots(platform(), registry)]).toEqual([
      ['service', 0],
      ['table', 1],
      ['system', 2],
    ]);
  });

  it('gives types the registry fills alike one slot', () => {
    const filled = createTypeRegistry({
      'c4-container': { shape: 'box', fill: '#438dd5' },
      'c4-container-api': { shape: 'box', fill: '#438dd5' },
      'c4-person': { shape: 'box', fill: '#08427b' },
    });
    const m = model('c4');
    m.node('a', { type: 'c4-container-api' });
    m.node('p', { type: 'c4-person' });
    m.node('b', { type: 'c4-container' });
    expect([...typeSlots(m.toJSON(), filled)]).toEqual([
      ['c4-container-api', 0],
      ['c4-person', 1],
      ['c4-container', 0],
    ]);
  });
});

describe('typeHuesOf', () => {
  it('colours only under a preset with a palette', () => {
    expect(typeHuesOf(stylePreset('clean'), platform(), registry)).toBeUndefined();
    const hues = typeHuesOf({ id: 'x', label: 'X', palette: ['#111111', '#222222'] }, platform(), registry);
    expect(hues?.palette).toEqual(['#111111', '#222222']);
    expect(hues?.slots.get('table')).toBe(1);
  });
});

describe('nodeHue', () => {
  const hues = {
    palette: ['#111111', '#222222'],
    slots: new Map([
      ['service', 0],
      ['table', 1],
      ['system', 2],
    ]),
  };

  it("takes the node's accent as written", () => {
    expect(nodeHue('service', '#c62828', hues)).toBe('#c62828');
  });

  it("else its type's palette colour, wrapping past the end", () => {
    expect(nodeHue('table', undefined, hues)).toBe('#222222');
    expect(nodeHue('system', undefined, hues)).toBe('#111111');
  });

  it('gives an untyped or unknown-typed box with no accent nothing', () => {
    expect(nodeHue(undefined, undefined, hues)).toBeUndefined();
    expect(nodeHue('nope', undefined, hues)).toBeUndefined();
  });
});

describe('hueInk', () => {
  it('picks the text colour that reads on a hex hue', () => {
    expect(hueInk('#aaaaaa')).toBe('#000');
    expect(hueInk('#ff5')).toBe('#000');
    expect(hueInk('#0000aa')).toBe('#fff');
    expect(hueInk('#08427b')).toBe('#fff');
  });

  it('says nothing for other colour syntax', () => {
    expect(hueInk('var(--dg-text)')).toBeUndefined();
    expect(hueInk('red')).toBeUndefined();
  });
});
