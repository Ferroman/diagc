import { describe, expect, it } from 'vitest';
import { model } from '../builder/index';
import { validate } from './index';
import { emptyModel } from './models.fixture';

describe('validate', () => {
  it('flags dangling relation endpoints and containment refs', () => {
    const m = emptyModel();
    m.nodes = [{ id: 'a', name: 'a', type: 't' }];
    m.relations = [{ id: 'r', from: 'a', to: 'ghost', kind: 'k' }];
    m.containment = [{ parent: 'phantom', child: 'a' }];
    expect(validate(m)).toEqual([
      { code: 'dangling-endpoint', message: "Containment references unknown node 'phantom'", ref: 'phantom' },
      { code: 'dangling-endpoint', message: "Relation 'r' references unknown node 'ghost'", ref: 'r' },
    ]);
  });

  it('accepts a valid multi-membership model', () => {
    const m = model('acme');
    const shared = m.node('db', { type: 'database' });
    m.node('sys-a', { type: 'system' }).contains(shared);
    m.node('sys-b', { type: 'system' }).contains(shared);
    expect(validate(m.toJSON())).toEqual([]);
  });
});
