// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DiagramRelation } from '@diagc/core/internal';
import { TransitionFields } from './TransitionFields';

const relation = (rest: Partial<DiagramRelation> = {}): DiagramRelation => ({
  id: 't1',
  from: 'a',
  to: 'b',
  kind: 'transition',
  ...rest,
});

describe('TransitionFields', () => {
  it('commits a typed guard on blur', () => {
    // Breaks if a part is not written back, or is written untrimmed.
    const onCommand = vi.fn();
    render(<TransitionFields relation={relation()} onCommand={onCommand} />);
    const guard = screen.getByLabelText('Guard');
    fireEvent.change(guard, { target: { value: ' total > 0 ' } });
    fireEvent.blur(guard);
    expect(onCommand).toHaveBeenCalledWith({ type: 'update-relation', id: 't1', patch: { guard: 'total > 0' } });
  });

  it('clears a part with null when its box is emptied, on Enter', () => {
    // Breaks if an emptied box leaves the old guard or stores an empty string.
    const onCommand = vi.fn();
    render(<TransitionFields relation={relation({ guard: 'ok' })} onCommand={onCommand} />);
    const guard = screen.getByLabelText('Guard');
    fireEvent.change(guard, { target: { value: '' } });
    fireEvent.keyDown(guard, { key: 'Enter' });
    expect(onCommand).toHaveBeenCalledWith({ type: 'update-relation', id: 't1', patch: { guard: null } });
  });

  describe('a transition whose label is stored (dragged, or added in place)', () => {
    const stored = () => relation({ trigger: 'pay', labels: [{ id: 'transition', text: 'pay', t: 0.3, side: 'top' }] });
    const edit = (rel: DiagramRelation, part: string, value: string) => {
      const onCommand = vi.fn();
      render(<TransitionFields relation={rel} onCommand={onCommand} />);
      const box = screen.getByLabelText(part);
      fireEvent.change(box, { target: { value } });
      fireEvent.blur(box);
      return onCommand.mock.calls[0]?.[0];
    };

    it('rewrites the stored text with the parts, keeping its place', () => {
      // Breaks if the stored label keeps the old text: it is drawn once the parts are gone.
      expect(edit(stored(), 'Trigger', 'ship')).toEqual({
        type: 'update-relation',
        id: 't1',
        patch: { trigger: 'ship', labels: [{ id: 'transition', text: 'ship', t: 0.3, side: 'top' }] },
      });
    });

    it('drops the stored label with the last part, and keeps any other label', () => {
      // Breaks if clearing the trigger brings the stale "pay" back on the canvas.
      expect(edit(stored(), 'Trigger', '')).toEqual({
        type: 'update-relation',
        id: 't1',
        patch: { trigger: null, labels: null },
      });
      const twoLabels = relation({
        trigger: 'pay',
        labels: [
          { id: 'transition', text: 'pay', t: 0.3 },
          { id: 'note', text: 'see spec', t: 0.8 },
        ],
      });
      cleanup();
      expect(edit(twoLabels, 'Trigger', '')).toEqual({
        type: 'update-relation',
        id: 't1',
        patch: { trigger: null, labels: [{ id: 'note', text: 'see spec', t: 0.8 }] },
      });
    });
  });

  it('commits nothing for an unchanged box', () => {
    // Breaks if every blur writes, filling the undo history.
    const onCommand = vi.fn();
    render(<TransitionFields relation={relation({ trigger: 'pay' })} onCommand={onCommand} />);
    fireEvent.blur(screen.getByLabelText('Trigger'));
    expect(onCommand).not.toHaveBeenCalled();
  });

  it('shows nothing for another kind', () => {
    // Breaks if the fields appear on every relation.
    render(<TransitionFields relation={relation({ kind: 'sync' })} onCommand={vi.fn()} />);
    expect(screen.queryByLabelText('Trigger')).toBeNull();
  });
});
