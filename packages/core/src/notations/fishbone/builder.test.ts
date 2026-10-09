import { describe, expect, it } from 'vitest';
import { model } from '../../builder/index';

describe('fishbone builder', () => {
  it('declares the notation, the head, categories, causes and sub-causes with cause-of arrows from child to parent', () => {
    const m = model('f');
    const fb = m.fishbone('late', 'Late deliveries');
    const method = fb.category('method', 'Method', { color: '#abc' });
    const nc = method.cause('no-checklist', 'No checklist');
    nc.cause('unowned', 'Nobody owns it', { description: 'sub' });
    const j = m.toJSON();
    expect(j.notation).toBe('fishbone');
    expect(j.nodes.map((n) => [n.id, n.type])).toEqual([
      ['late', 'fb-effect'],
      ['method', 'fb-category'],
      ['no-checklist', 'fb-cause'],
      ['unowned', 'fb-cause'],
    ]);
    expect(j.nodes.find((n) => n.id === 'method')?.color).toBe('#abc');
    expect(j.nodes.find((n) => n.id === 'unowned')?.description).toBe('sub');
    expect(j.relations.map((r) => [r.from, r.to, r.kind])).toEqual([
      ['method', 'late', 'cause-of'],
      ['no-checklist', 'method', 'cause-of'],
      ['unowned', 'no-checklist', 'cause-of'],
    ]);
  });

  it('seeds a preset and hands back refs keyed by slug id, in bone order', () => {
    const m = model('f');
    const fb = m.fishbone('late', 'Late deliveries');
    const cats = fb.categories('Software');
    expect(Object.keys(cats)).toEqual(['people', 'process', 'requirements', 'code', 'infrastructure', 'dependencies']);
    cats.code!.cause('bug', 'A bug');
    const j = m.toJSON();
    expect(j.nodes.find((n) => n.id === 'code')?.name).toBe('Code');
    expect(j.relations.at(-1)).toMatchObject({ from: 'bug', to: 'code', kind: 'cause-of' });
  });

  it('stops at the sub-cause: a fourth level throws at build time', () => {
    const m = model('f');
    const sub = m.fishbone('e').category('c').cause('a').cause('a1');
    expect(() => sub.cause('a11')).toThrow(/three levels/);
  });

  it('is declared once, model-wide or as a plane', () => {
    const m = model('f');
    m.fishbone('e');
    expect(() => m.fishbone('e2')).toThrow('fishbone() already declared');
    const p = model('p');
    p.fishbone('e', 'Effect', { plane: 'why', planeName: 'Why it broke' });
    const j = p.toJSON();
    expect(j.notation).toBeUndefined();
    expect(j.planes).toEqual([{ id: 'why', name: 'Why it broke', notation: 'fishbone' }]);
    // the plane name defaults to 'Causes' when none is given, same as `planeName` overrides it
    const defaulted = model('defaulted');
    defaulted.fishbone('e', 'E', { plane: 'p' });
    expect(defaulted.toJSON().planes).toEqual([{ id: 'p', name: 'Causes', notation: 'fishbone' }]);
    const named = model('named');
    named.fishbone('e', 'E', { plane: 'p', planeName: 'Why' });
    expect(named.toJSON().planes).toEqual([{ id: 'p', name: 'Why', notation: 'fishbone' }]);
    // the effect's own opts (FishboneOpts, here `description`) ride through to its node
    const withOpts = model('opts');
    withOpts.fishbone('e', 'E', { description: 'd' });
    expect(withOpts.toJSON().nodes.find((n) => n.id === 'e')?.description).toBe('d');
  });
});
