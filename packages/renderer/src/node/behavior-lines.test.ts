import { describe, expect, it } from 'vitest';
import { behaviorLines } from './behavior-lines';

describe('behaviorLines', () => {
  it('formats each behaviour as trigger [guard] / effect', () => {
    expect(
      behaviorLines({
        behaviors: [
          { trigger: 'entry', effect: 'reserveStock' },
          { trigger: 'remind', guard: 'overdue', effect: 'email' },
        ],
      }),
    ).toEqual(['entry / reserveStock', 'remind [overdue] / email']);
  });

  it('is empty for a node with none', () => {
    expect(behaviorLines({})).toEqual([]);
  });
});
