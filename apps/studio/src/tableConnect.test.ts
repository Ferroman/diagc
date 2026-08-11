import { describe, expect, it } from 'vitest';
import type { DiagramModel } from '@diagramming/core';
import { fkConnectionCommands } from './tableConnect';

const model = (): DiagramModel => ({
  version: 1, id: 'd', name: 'd',
  nodes: [
    { id: 'account_role', name: 'account_role', type: 'db-table', columns: [{ name: 'id', pk: true }, { name: 'account_id' }] },
    { id: 'accounts', name: 'accounts', type: 'db-table', columns: [{ name: 'id', pk: true }] },
    { id: 'svc', name: 'svc', type: 'service' },
  ],
  containment: [], relations: [], layers: [], planes: [],
});

describe('fkConnectionCommands', () => {
  it('turns a column-origin connect into an fk relation + fk flag', () => {
    const cmds = fkConnectionCommands(model(), 'account_role', 'accounts', 'account_id');
    expect(cmds).not.toBeNull();
    expect(cmds![0]).toMatchObject({ type: 'add-relation', from: 'account_role', to: 'accounts', opts: { kind: 'fk', fromColumn: 'account_id', toColumn: 'id' } });
    expect(cmds![1]).toMatchObject({ type: 'set-table-columns', id: 'account_role' });
    const flagged = (cmds![1] as any).columns.find((c: any) => c.name === 'account_id');
    expect(flagged.fk).toBe(true);
  });
  it('returns null when the source is not a db-table column', () => {
    expect(fkConnectionCommands(model(), 'svc', 'accounts', null)).toBeNull();
    expect(fkConnectionCommands(model(), 'account_role', 'accounts', 'nope')).toBeNull();
  });
  it('omits the fk-flag command when the column is already fk', () => {
    const m = model();
    (m.nodes[0]!.columns![1] as any).fk = true;
    const cmds = fkConnectionCommands(m, 'account_role', 'accounts', 'account_id');
    expect(cmds!.length).toBe(1);
  });
});
