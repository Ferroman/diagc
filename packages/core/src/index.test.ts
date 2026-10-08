import { describe, expect, it } from 'vitest';
import * as publicApi from './index';
import * as internalApi from './internal';

describe('@diagc/core entry points', () => {
  it('hands out the same objects from both entries', () => {
    for (const [name, value] of Object.entries(publicApi)) {
      expect(internalApi[name as keyof typeof internalApi], name).toBe(value);
    }
  });
});
