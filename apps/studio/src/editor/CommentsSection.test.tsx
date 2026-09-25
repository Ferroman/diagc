// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CommentsSection } from './CommentsSection';

const target = { node: 'a' } as const;

describe('CommentsSection', () => {
  it('adds a comment with the next free id, trimmed, and clears the box', () => {
    const onCommand = vi.fn();
    render(<CommentsSection target={target} comments={[{ id: 'c1', text: 'x' }]} onCommand={onCommand} />);
    const box = screen.getByLabelText('New comment');
    fireEvent.change(box, { target: { value: '  Slipped a week  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add comment' }));
    expect(onCommand).toHaveBeenCalledWith({ type: 'add-comment', target, comment: { id: 'c2', text: 'Slipped a week' } });
    expect((box as HTMLTextAreaElement).value).toBe('');
  });
  it('does nothing for an empty box', () => {
    const onCommand = vi.fn();
    render(<CommentsSection target={target} comments={[]} onCommand={onCommand} />);
    // No @testing-library/jest-dom in this repo (see ThreatsSection.test.tsx), so disabled is read off the element directly.
    expect((screen.getByRole('button', { name: 'Add comment' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('edits text on blur only when changed, by/at with null to clear, and removes', () => {
    const onCommand = vi.fn();
    render(<CommentsSection target={target} comments={[{ id: 'c1', text: 'old', by: 'Ann', at: '2026-09-22' }]} onCommand={onCommand} />);
    const text = screen.getByLabelText('Comment c1 text');
    fireEvent.blur(text);
    expect(onCommand).not.toHaveBeenCalled();
    fireEvent.change(text, { target: { value: 'new' } });
    fireEvent.blur(text);
    expect(onCommand).toHaveBeenLastCalledWith({ type: 'update-comment', target, id: 'c1', patch: { text: 'new' } });
    const by = screen.getByLabelText('Comment c1 author');
    fireEvent.change(by, { target: { value: '' } });
    fireEvent.blur(by);
    expect(onCommand).toHaveBeenLastCalledWith({ type: 'update-comment', target, id: 'c1', patch: { by: null } });
    const at = screen.getByLabelText('Comment c1 date');
    fireEvent.change(at, { target: { value: '2026-10-01' } });
    expect(onCommand).toHaveBeenLastCalledWith({ type: 'update-comment', target, id: 'c1', patch: { at: '2026-10-01' } });
    fireEvent.change(at, { target: { value: '' } });
    expect(onCommand).toHaveBeenLastCalledWith({ type: 'update-comment', target, id: 'c1', patch: { at: null } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove comment c1' }));
    expect(onCommand).toHaveBeenLastCalledWith({ type: 'remove-comment', target, id: 'c1' });
  });
  it('a blanked text snaps back rather than committing (a comment needs text)', () => {
    const onCommand = vi.fn();
    render(<CommentsSection target={target} comments={[{ id: 'c1', text: 'keep' }]} onCommand={onCommand} />);
    const text = screen.getByLabelText('Comment c1 text');
    fireEvent.change(text, { target: { value: '   ' } });
    fireEvent.blur(text);
    expect(onCommand).not.toHaveBeenCalled();
    expect((text as HTMLTextAreaElement).value).toBe('keep');
  });
  it('follows a change made underneath it (undo)', () => {
    const { rerender } = render(<CommentsSection target={target} comments={[{ id: 'c1', text: 'one' }]} onCommand={vi.fn()} />);
    rerender(<CommentsSection target={target} comments={[{ id: 'c1', text: 'two' }]} onCommand={vi.fn()} />);
    expect((screen.getByLabelText('Comment c1 text') as HTMLTextAreaElement).value).toBe('two');
  });
});
