import { describe, expect, it } from 'vitest';
import { ABOVE_BOXES_Z, NOTE_Z, SELECTED_NODE_LIFT } from './stacking';

describe('stacking', () => {
  it('lifted edges sit under the notes, and both under a selected node (1000) and the label layer (999)', () => {
    expect(NOTE_Z).toBeGreaterThan(ABOVE_BOXES_Z);
    expect(NOTE_Z).toBeLessThan(999);
  });

  it("names React Flow's own lift on selection", () => expect(SELECTED_NODE_LIFT).toBe(1000));
});
