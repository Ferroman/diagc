import { describe, expect, it } from 'vitest';
import { BUILTIN_NOTATIONS, model } from '@diagc/core/internal';
import { anyCarriesThreats, carriesThreats, threatsOffered } from './threatsOffered';

describe('threatsOffered', () => {
  it('offers threats on the threat model alone, and wherever one already exists', () => {
    expect(BUILTIN_NOTATIONS.filter((n) => threatsOffered(n, false))).toEqual(['threat-model']);
    expect(threatsOffered(undefined, false)).toBe(false);
    expect([...BUILTIN_NOTATIONS, undefined].every((n) => threatsOffered(n, true))).toBe(true);
  });
});

describe('carriesThreats / anyCarriesThreats', () => {
  it('counts an element with at least one threat, on a node or a relation', () => {
    expect(carriesThreats({})).toBe(false);
    expect(carriesThreats({ threats: [] })).toBe(false);
    expect(carriesThreats({ threats: [{ id: 't1', category: 'S', title: 'Spoofed' }] })).toBe(true);

    const m = model('d');
    const [a, b] = [m.node('a'), m.node('b')];
    m.relate(a, b, { kind: 'sync' });
    const plain = m.toJSON();
    expect(anyCarriesThreats(plain)).toBe(false);
    const threat = { id: 't1', category: 'T' as const, title: 'Tampered' };
    expect(
      anyCarriesThreats({ ...plain, nodes: plain.nodes.map((n, i) => (i === 1 ? { ...n, threats: [threat] } : n)) }),
    ).toBe(true);
    expect(anyCarriesThreats({ ...plain, relations: plain.relations.map((r) => ({ ...r, threats: [threat] })) })).toBe(
      true,
    );
  });
});
