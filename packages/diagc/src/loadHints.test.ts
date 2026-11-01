import { describe, expect, it } from 'vitest';
import { loadHint } from './loadHints';

describe('loadHint', () => {
  it('names the closest builder or node method for a misspelt one', () => {
    expect(loadHint('m.nod is not a function')).toBe("m.nod is not a function (did you mean 'node'?)");
    expect(loadHint('m.contians is not a function')).toBe("m.contians is not a function (did you mean 'contains'?)");
    expect(loadHint('api.reltae is not a function')).toBe("api.reltae is not a function (did you mean 'relate'?)");
  });

  it('points a composition verb at the include option and the compose topic', () => {
    for (const verb of ['include', 'includes', 'import', 'compose', 'embed']) {
      expect(loadHint(`m.${verb} is not a function`)).toBe(
        `m.${verb} is not a function — to pull another diagram in, give a node \`include\`: ` +
          "m.node('part', { include: './part.diagram.json' }); see 'diagc guide compose'",
      );
    }
  });

  it('leaves every other message as it is', () => {
    expect(loadHint('x.frobnicate is not a function')).toBe('x.frobnicate is not a function');
    expect(loadHint("Cannot read properties of undefined (reading 'id')")).toBe(
      "Cannot read properties of undefined (reading 'id')",
    );
    expect(loadHint('')).toBe('');
  });

  it('never suggests an internal method', () => {
    // addRelation, addThreat… are the builder's own plumbing, not the author API
    expect(loadHint('m.addRelatoin is not a function')).toBe('m.addRelatoin is not a function');
  });
});
