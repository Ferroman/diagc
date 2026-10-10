// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { AddThreatButton, NoteBadge } from './NoteBadge';
import { NoteStateContext, type NoteState } from './note-state';

function withNotes(ui: ReactNode, open = false) {
  const notes: NoteState = { isOpen: () => open, toggle: vi.fn(), placeBadge: () => {} };
  const onParent = vi.fn();
  render(
    <NoteStateContext.Provider value={notes}>
      <div onClick={onParent} onMouseDown={onParent}>
        {ui}
      </div>
    </NoteStateContext.Provider>,
  );
  return { toggle: notes.toggle, onParent };
}

describe('NoteBadge', () => {
  const badge = { className: 'dg-threat-badge', state: 'open', title: '1 open threat', text: '1' };

  it('is the passive count on a canvas that draws no notes', () => {
    render(<NoteBadge {...badge} target={{ node: 'a' }} />);
    const el = screen.getByText('1');
    expect(el.tagName).toBe('SPAN');
    expect(el.className).toBe('dg-threat-badge');
    expect(el.getAttribute('data-state')).toBe('open');
    expect(el.getAttribute('title')).toBe('1 open threat');
  });

  it('is the passive count for an element whose note this canvas does not draw', () => {
    withNotes(<NoteBadge {...badge} target={undefined} />);
    expect(screen.getByText('1').tagName).toBe('SPAN');
  });

  it("switches its element's note, and the canvas sees neither the press nor the click", () => {
    const { toggle, onParent } = withNotes(<NoteBadge {...badge} target={{ node: 'a' }} />);
    const button = screen.getByRole('button', { name: '1 open threat — show' });
    expect(button.className).toBe('dg-threat-badge nodrag');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    fireEvent.mouseDown(button);
    fireEvent.click(button);
    expect(toggle).toHaveBeenCalledWith({ node: 'a' });
    expect(onParent).not.toHaveBeenCalled();
  });

  it('says hide while the note is open', () => {
    withNotes(<NoteBadge {...badge} target={{ node: 'a' }} />, true);
    expect(screen.getByRole('button', { name: '1 open threat — hide' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('on a flow, names the flow and keeps the press off the pane', () => {
    withNotes(
      <NoteBadge
        className="dg-comment-badge dg-edge-comment"
        target={{ relation: 'r1' }}
        edge="a=>b:"
        title="2 comments"
        text="2"
        style={{ transform: 'translate(1px, 2px)' }}
      />,
    );
    const button = screen.getByRole('button', { name: '2 comments — show' });
    expect(button.className).toBe('dg-comment-badge dg-edge-comment nodrag nopan');
    expect(button.getAttribute('data-edge')).toBe('a=>b:');
    expect(button.getAttribute('data-state')).toBeNull();
    expect(button.style.transform).toBe('translate(1px, 2px)');
  });
});

describe('AddThreatButton', () => {
  it('adds a threat, and the canvas sees neither the press nor the click', () => {
    const onAdd = vi.fn();
    const { onParent } = withNotes(<AddThreatButton className="dg-threat-badge nodrag" state="empty" onAdd={onAdd} />);
    const button = screen.getByRole('button', { name: 'Add a threat' });
    expect(button.textContent).toBe('+');
    expect(button.getAttribute('title')).toBe('Add a threat');
    expect(button.getAttribute('data-state')).toBe('empty');
    fireEvent.mouseDown(button);
    fireEvent.click(button);
    expect(onAdd).toHaveBeenCalledOnce();
    expect(onParent).not.toHaveBeenCalled();
  });

  it('is a plain add row without a state', () => {
    render(<AddThreatButton className="dg-note-add nodrag nopan" onAdd={() => {}} />);
    const button = screen.getByRole('button', { name: 'Add a threat' });
    expect(button.className).toBe('dg-note-add nodrag nopan');
    expect(button.hasAttribute('data-state')).toBe(false);
  });
});
