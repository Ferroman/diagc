import { describe, expect, it } from 'vitest';
import { CAUSAL_LOOP_NOTATION } from './causal-loop';
import { BUILTIN_NOTATIONS } from '../../types';

describe('causal-loop notation', () => {
  it('is a builtin notation', () => {
    expect(BUILTIN_NOTATIONS).toContain(CAUSAL_LOOP_NOTATION);
  });
});
