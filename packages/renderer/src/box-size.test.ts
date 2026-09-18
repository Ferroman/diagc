import { describe, expect, it } from 'vitest';
import { compileView, model } from '@diagramming/core';
import { estimateBoxSize, textWidth, withBoxSizes } from './box-size';
import { createTypeRegistry } from './registry';

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
    const tagged = estimateBoxSize({ name: 'x', subtitle: 'service', metaBadges: ['typescript', 'nestjs', 'kubernetes'] });
    expect(tagged.width).toBeGreaterThan(bare.width);
  });

  it('the person head stands above the body (measured 195x63)', () => {
    const s = estimateBoxSize({ name: 'Personal Banking Customer', subtitle: '[Person]', shape: 'person' });
    expect(s.height).toBe(64);
    expect(s.width).toBeGreaterThanOrEqual(195);
  });

  it('a pill pads wider than a box', () => {
    expect(estimateBoxSize({ name: 'Person', shape: 'pill' }).width).toBe(estimateBoxSize({ name: 'Person' }).width + 12);
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

  it('uses the notation chip size for a folded typeless node when the profile has one', () => {
    const m = model('x');
    const g = m.node('g', { name: 'Group' });
    g.contains(m.node('k', { name: 'kid' }));
    const chip = { width: 140, height: 48 };
    const sizes = withBoxSizes(compileView(m.toJSON(), {}).roots, new Map(), { ...ctx, leafSize: () => chip });
    expect(sizes.get('g')).toEqual(chip);
  });
});
