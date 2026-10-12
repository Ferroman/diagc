import { describe, expect, it } from 'vitest';
import { refuse } from './result';

describe('refuse', () => {
  it('answers the status with one issue carrying the message, keys in the order a host sends them', () => {
    expect(JSON.stringify(refuse(409, "'shop' is taken"))).toBe(
      '{"status":409,"body":{"issues":[{"message":"\'shop\' is taken"}]}}',
    );
  });
});
