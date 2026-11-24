import { describe, expect, it } from 'vitest';
import { compileView, model } from '@diagc/core/internal';
import { LAYOUT_SIZED_TYPES, estimateBoxSize, textWidth, withBoxSizes, wrapText, wrappedName } from './box-size';
import { createTypeRegistry } from '../registry';

// The expectations are the DOM sizes measured in headless Chrome against the
// published pages (see the module comment) — the estimator only has to land
// within a few px of these, never below the real box by more than the slack
// the default node spacing absorbs.
describe('estimateBoxSize', () => {
  it('a short untyped label is the CSS minimum box (measured 142x34)', () => {
    expect(estimateBoxSize({ name: 'roots' })).toEqual({ width: 142, height: 34 });
  });

  it('a long single-line label widens the box instead of overflowing it (measured 231)', () => {
    const s = estimateBoxSize({ name: 'avoid direct/sync  communication' });
    expect(s.width).toBeGreaterThanOrEqual(231);
    expect(s.width).toBeLessThan(231 + 30);
    expect(s.height).toBe(34);
  });

  it('a type subtitle adds the second row (measured 142x50)', () => {
    expect(estimateBoxSize({ name: 'node', subtitle: 'service', hasIcon: true })).toEqual({ width: 142, height: 50 });
  });

  it('meta badges alone also add the second row', () => {
    expect(estimateBoxSize({ name: 'x', metaBadges: ['go'] }).height).toBe(50);
  });

  it('the wider of the two rows sets the width (measured 159 for the C4 container)', () => {
    const s = estimateBoxSize({ name: 'Web Application', subtitle: '[Container: Java, Spring MVC]', hasIcon: true });
    expect(s.width).toBeGreaterThanOrEqual(159);
    expect(s.width).toBeLessThan(159 + 30);
  });

  it('a leading icon takes room on the title row', () => {
    const name = 'a fairly long service name here';
    expect(estimateBoxSize({ name, hasIcon: true }).width).toBe(estimateBoxSize({ name }).width + 22);
  });

  it('meta badges widen the second row', () => {
    const bare = estimateBoxSize({ name: 'x', subtitle: 'service' });
    const tagged = estimateBoxSize({
      name: 'x',
      subtitle: 'service',
      metaBadges: ['typescript', 'nestjs', 'kubernetes'],
    });
    expect(tagged.width).toBeGreaterThan(bare.width);
  });

  it('the person head stands above the body (measured 195x63)', () => {
    const s = estimateBoxSize({ name: 'Personal Banking Customer', subtitle: '[Person]', shape: 'person' });
    expect(s.height).toBe(64);
    expect(s.width).toBeGreaterThanOrEqual(195);
  });

  it('a pill pads wider than a box', () => {
    expect(estimateBoxSize({ name: 'Person', shape: 'pill' }).width).toBe(
      estimateBoxSize({ name: 'Person' }).width + 12,
    );
  });

  it('font scale changes both dimensions', () => {
    const name = 'a fairly long service name here';
    const md = estimateBoxSize({ name });
    expect(estimateBoxSize({ name, fontScale: 'lg' }).width).toBeGreaterThan(md.width);
    expect(estimateBoxSize({ name, fontScale: 'lg' }).height).toBeGreaterThan(md.height);
    expect(estimateBoxSize({ name, fontScale: 'sm' }).width).toBeLessThan(md.width);
  });

  it('a collapsed container reserves its count badge and fold chrome (measured 174x49)', () => {
    const s = estimateBoxSize({ name: 'Acme Platform', subtitle: 'platform', collapsedCount: 17 });
    expect(s.width).toBeGreaterThanOrEqual(174);
    expect(s.width).toBeLessThan(174 + 30);
    expect(s.height).toBe(50);
    // more digits, wider badge
    expect(estimateBoxSize({ name: 'Acme Platform', collapsedCount: 170 }).width).toBeGreaterThan(
      estimateBoxSize({ name: 'Acme Platform', collapsedCount: 1 }).width,
    );
  });
});

describe('wrapText', () => {
  it('breaks at word boundaries, each line within the cap', () => {
    const lines = wrapText('Do each random run on the real system, compare the full state', 180, 12);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe('Do each random run on the real system, compare the full state');
    for (const line of lines) expect(textWidth(line, 12)).toBeLessThanOrEqual(180);
  });

  it('keeps a short text, a break already in it, and a word wider than the cap', () => {
    expect(wrapText('Ask for a change', 180, 12)).toEqual(['Ask for a change']);
    expect(wrapText('one\ntwo', 180, 12)).toEqual(['one', 'two']);
    expect(wrapText('a Supercalifragilisticexpialidocious b', 60, 12)).toEqual([
      'a',
      'Supercalifragilisticexpialidocious',
      'b',
    ]);
  });
});

describe('wrappedName', () => {
  const types = createTypeRegistry();
  const long = 'Find a short run for each example, refusal and broken rule';

  it('wraps a long name of a type that wraps, and no other', () => {
    const action = types.resolve('activity-action');
    expect(wrappedName({ id: 'n', name: long, type: 'activity-action' }, action)!.length).toBeGreaterThan(1);
    expect(wrappedName({ id: 'n', name: 'Short', type: 'activity-action' }, action)).toBeUndefined();
    expect(wrappedName({ id: 'n', name: long, type: 'service' }, types.resolve('service'))).toBeUndefined();
    expect(wrappedName({ id: 'n', name: long }, undefined)).toBeUndefined();
  });

  it('leaves a rich label as its author laid it out', () => {
    const node = { id: 'n', name: long, type: 'activity-action', rich: [{ text: long }] };
    expect(wrappedName(node, types.resolve('activity-action'))).toBeUndefined();
  });

  it('sizes the box for the lines it is drawn on', () => {
    const m = model('wrap');
    const lane = m.activity('f').lane('l');
    lane.action('long', long);
    lane.action('short', 'Short');
    const view = compileView(m.toJSON(), { pins: { f: 'expanded', l: 'expanded' } });
    const sizes = withBoxSizes(view.roots, new Map(), { typeRegistry: types, metaKeys: [], hiddenCounts: new Map() });
    const lines = wrappedName({ id: 'long', name: long, type: 'activity-action' }, types.resolve('activity-action'))!;
    expect(sizes.get('long')!.height).toBe(sizes.get('short')!.height + (lines.length - 1) * 16);
    expect(sizes.get('long')!.width).toBeLessThan(estimateBoxSize({ name: long, shape: 'rounded' }).width);
  });
});

describe('textWidth', () => {
  // canvas.measureText in headless Chrome, '600 12px system-ui' — the label face
  const MEASURED: [string, number][] = [
    ['Order cancel request', 125.4],
    ['PaymentGateway', 105.9],
    ['OrderController', 95.6],
    ['avoid direct/sync  communication', 203],
    ['Web Application', 97.6],
    ['Personal Banking Customer', 166.7],
  ];

  it.each(MEASURED)('lands within 4%% of the drawn width of %j, and never meaningfully under it', (text, drawn) => {
    const est = textWidth(text, 12);
    expect(est).toBeGreaterThan(drawn - 2); // an under-estimate is the one that shows
    expect(est).toBeLessThan(drawn * 1.04 + 2);
  });

  it('scales with the font size and counts full-width scripts as a full em', () => {
    expect(textWidth('Shop', 20)).toBeCloseTo((textWidth('Shop', 10) * 20) / 10, 9);
    expect(textWidth('注文', 12)).toBe(24);
    expect(textWidth('', 12)).toBe(0);
  });
});

describe('withBoxSizes', () => {
  function fixture() {
    const m = model('x');
    const plain = m.node('plain', { name: 'roots' });
    const long = m.node('long', { name: 'avoid direct/sync  communication' });
    const svc = m.node('svc', { type: 'service', name: 'mail-svc', metadata: { framework: 'nestjs' } });
    const sys = m.node('sys', { type: 'system', name: 'Shop' });
    const inner = m.node('inner', { type: 'service', name: 'Storefront' });
    const dot = m.node('dot', { type: 'activity-start', name: '' });
    const silhouette = m.node('sil', { name: 'Person', shape: '/library/shapes/person.svg' });
    sys.contains(inner);
    void [plain, long, svc, dot, silhouette];
    return m.toJSON();
  }
  const ctx = {
    typeRegistry: createTypeRegistry(),
    metaKeys: ['framework', 'language', 'tool'],
    hiddenCounts: new Map([['sys', 1]]),
  };

  it('sizes every CSS-sized leaf from its own content', () => {
    const view = compileView(fixture(), {});
    const sizes = withBoxSizes(view.roots, new Map(), ctx);
    expect(sizes.get('plain')).toEqual({ width: 142, height: 34 });
    expect(sizes.get('long')!.width).toBeGreaterThan(200);
    // type subtitle + a meta badge → the two-row box
    expect(sizes.get('svc')!.height).toBe(50);
  });

  it("keeps a folded state's behaviours hint where it is larger than the folded box", () => {
    const m = model('sm').notation('state-machine');
    const s = m.stateMachine('mc').state('s', 'S');
    s.state('kid', 'Kid');
    const view = compileView(m.toJSON(), { pins: { mc: 'expanded' } });
    const tall = { width: 300, height: 140 };
    const sizes = withBoxSizes(view.roots, new Map([['s', tall]]), { ...ctx, hiddenCounts: new Map([['s', 1]]) });
    expect(sizes.get('s')).toMatchObject(tall);
  });

  it('a folded container gets the folded-box footprint, an unfolded one none at all', () => {
    const folded = withBoxSizes(compileView(fixture(), {}).roots, new Map(), ctx);
    expect(folded.get('sys')).toEqual(estimateBoxSize({ name: 'Shop', subtitle: 'system', collapsedCount: 1 }));
    expect(folded.has('inner')).toBe(false); // hidden inside the fold

    const open = withBoxSizes(compileView(fixture(), { focus: ['sys'] }).roots, new Map(), ctx);
    expect(open.has('sys')).toBe(false); // elk sizes an open container from its children
    expect(open.get('inner')).toBeDefined();
  });

  it('a folded container ignores a LEAF hint (its picture is a header thumb, not its body)', () => {
    const view = compileView(fixture(), {});
    const sizes = withBoxSizes(view.roots, new Map([['sys', { width: 64, height: 64 }]]), ctx);
    expect(sizes.get('sys')!.width).toBeGreaterThanOrEqual(142);
  });

  it('never overrides a leaf that already has a hint, nor one the view force-sizes', () => {
    const view = compileView(fixture(), {});
    const sizes = withBoxSizes(view.roots, new Map([['plain', { width: 300, height: 90 }]]), ctx);
    expect(sizes.get('plain')).toEqual({ width: 300, height: 90 });
    // a glyph and a silhouette take the layout's size inline, so an estimate of
    // their (absent) CSS box would shrink them — they keep the LEAF_SIZE fallback
    expect(sizes.has('dot')).toBe(false);
    expect(sizes.has('sil')).toBe(false);
  });

  it('a registry default size is a floor for a CSS-sized box: a long label still widens it', () => {
    const m = model('sig');
    m.node('short', { type: 'activity-receive', name: 'Ping' });
    m.node('long', { type: 'activity-receive', name: 'Order cancel request received' });
    m.node('glyph', { type: 'activity-decision', name: 'a very long decision name indeed' });
    const view = compileView(m.toJSON(), {});
    const registryDefault = { width: 140, height: 44 };
    const hints = new Map([
      ['short', registryDefault],
      ['long', registryDefault],
      ['glyph', { width: 48, height: 48 }],
    ]);
    const sizes = withBoxSizes(view.roots, hints, ctx);
    // even a short label draws at the CSS minimum (120 + padding), wider than the default
    expect(sizes.get('short')).toEqual({ width: 152, height: 44 });
    expect(sizes.get('long')!.width).toBeGreaterThan(200);
    expect(sizes.get('long')!.height).toBe(44);
    // a glyph is force-sized: the layout's size IS its drawn size
    expect(sizes.get('glyph')).toEqual({ width: 48, height: 48 });
  });

  it('a DFD process and store are force-sized: the reservation IS the drawn box', () => {
    // An ellipse (and the store's two rules) reads as a footprint, not as a
    // wrapper around a label — estimating the CSS box would shrink the drawn
    // shape inside the 150×90 / 150×56 the layout reserved for it.
    const m = model('tm');
    const tm = m.threatModel();
    tm.process('p', 'Verify the credentials thoroughly');
    tm.store('s', 'Users');
    const view = compileView(m.toJSON(), {});
    const hints = new Map([
      ['p', { width: 150, height: 90 }],
      ['s', { width: 150, height: 56 }],
    ]);
    const sizes = withBoxSizes(view.roots, hints, ctx);
    expect(sizes.get('p')).toEqual({ width: 150, height: 90 });
    expect(sizes.get('s')).toEqual({ width: 150, height: 56 });
  });

  it('uses the notation’s text-node size for a folded typeless node when the profile has one', () => {
    const m = model('x');
    const g = m.node('g', { name: 'Group' });
    g.contains(m.node('k', { name: 'kid' }));
    const textNode = { width: 140, height: 48 };
    const sizes = withBoxSizes(compileView(m.toJSON(), {}).roots, new Map(), { ...ctx, leafSize: () => textNode });
    expect(sizes.get('g')).toEqual(textNode);
  });
});

describe('LAYOUT_SIZED_TYPES', () => {
  it('names exactly the fishbone types, the plan zone, period and lane header, which their layout sizes', () => {
    expect([...LAYOUT_SIZED_TYPES].sort()).toEqual([
      'fb-category',
      'fb-cause',
      'fb-effect',
      'plan-lane',
      'plan-period',
      'plan-zone',
    ]);
  });
});
