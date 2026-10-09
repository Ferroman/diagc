import { describe, expect, it } from 'vitest';
import { model } from '../builder/index';
import { DiagramValidationError } from './index';

describe('DiagramValidationError', () => {
  it('toJSON throws DiagramValidationError listing every issue', () => {
    const m = model('acme');
    const a = m.node('a', { type: 't' });
    const b = m.node('b', { type: 't' });
    a.contains(b);
    b.contains(a);
    m.relate(a, b, { kind: 'k', layer: 'missing' });

    expect(() => m.toJSON()).toThrowError(DiagramValidationError);
    try {
      m.toJSON();
    } catch (e) {
      const err = e as DiagramValidationError;
      expect(err.issues.map((i) => i.code).sort()).toEqual(['containment-cycle', 'unknown-layer']);
      expect(err.message).toContain('Containment cycle');
      expect(err.message).toContain("unknown layer 'missing'");
    }
  });
});
