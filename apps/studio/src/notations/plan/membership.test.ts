import { describe, expect, it } from 'vitest';
import { model } from '@diagc/core/internal';
import { addMember, removeMember } from './membership';

function roster() {
  const m = model('r');
  const p = m.plan();
  const pay = p.team('pay', 'Payments');
  p.team('plat', 'Platform');
  const alice = p.person('alice', 'Alice');
  p.person('bob', 'Bob');
  pay.member(alice);
  p.zone('q', { name: 'Q', start: '2026-01-05', end: '2026-01-30' });
  return m.toJSON();
}

describe('membership', () => {
  it('adds a person to a team once', () => {
    const m = roster();
    expect(addMember(m, 'bob', 'pay')).toEqual({
      type: 'add-relation',
      from: 'bob',
      to: 'pay',
      opts: { kind: 'member-of' },
    });
    expect(addMember(m, 'alice', 'pay')).toBeUndefined();
    expect(addMember(m, 'alice', 'plat')).toBeDefined();
  });

  it('refuses a team into a team, and anything that is not a person into a team', () => {
    const m = roster();
    expect(addMember(m, 'plat', 'pay')).toBeUndefined();
    expect(addMember(m, 'q', 'pay')).toBeUndefined();
    expect(addMember(m, 'bob', 'q')).toBeUndefined();
    expect(addMember(m, 'bob', 'nobody')).toBeUndefined();
  });

  it('removes a membership', () => {
    const m = roster();
    const id = m.relations.find((r) => r.kind === 'member-of')!.id;
    expect(removeMember(m, 'alice', 'pay')).toEqual({ type: 'delete-relation', id });
    expect(removeMember(m, 'bob', 'pay')).toBeUndefined();
  });

  it('removes every duplicate in one step', () => {
    const m = roster();
    m.relations.push({ ...m.relations.find((r) => r.kind === 'member-of')!, id: 'dup' });
    const c = removeMember(m, 'alice', 'pay');
    expect(c).toMatchObject({ type: 'batch' });
    expect((c as { commands: unknown[] }).commands).toHaveLength(2);
  });
});
