// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RichLabelEditor } from './RichLabelEditor';

const editor = (c: HTMLElement) => c.querySelector('.dg-rich-input') as HTMLElement;

afterEach(() => {
  vi.restoreAllMocks();
  window.getSelection()?.removeAllRanges();
});

describe('RichLabelEditor', () => {
  it('seeds the contentEditable from runs', () => {
    const { container } = render(<RichLabelEditor runs={[{ text: 'Hi', bold: true }]} onCommit={vi.fn()} />);
    expect(editor(container).innerHTML).toContain('<b>Hi</b>');
  });
  it('commits parsed runs on blur', () => {
    const onCommit = vi.fn();
    const { container } = render(<RichLabelEditor runs={[{ text: 'a' }]} onCommit={onCommit} />);
    const el = editor(container);
    el.innerHTML = 'a<b>b</b>';
    fireEvent.blur(el);
    expect(onCommit).toHaveBeenCalledWith([{ text: 'a' }, { text: 'b', bold: true }]);
  });
  it('cancels on Escape', () => {
    const onCommit = vi.fn();
    const { container } = render(<RichLabelEditor runs={[{ text: 'a' }]} onCommit={onCommit} />);
    fireEvent.keyDown(editor(container), { key: 'Escape' });
    expect(onCommit).toHaveBeenCalledWith(null);
  });
  it('commits on Ctrl+Enter', () => {
    const onCommit = vi.fn();
    const { container } = render(<RichLabelEditor runs={[{ text: 'a' }]} onCommit={onCommit} />);
    const el = editor(container);
    el.innerHTML = 'z';
    fireEvent.keyDown(el, { key: 'Enter', ctrlKey: true });
    expect(onCommit).toHaveBeenCalledWith([{ text: 'z' }]);
  });
  it('does not double-commit on Ctrl+Enter then blur', () => {
    const onCommit = vi.fn();
    const { container } = render(<RichLabelEditor runs={[{ text: 'a' }]} onCommit={onCommit} />);
    const el = editor(container);
    fireEvent.keyDown(el, { key: 'Enter', ctrlKey: true });
    fireEvent.blur(el);
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  it('Tab commits the runs and then chains (onTab); Shift+Tab does neither', () => {
    // Tab is "named, next one please": the commit has to land before the caller
    // builds the next node, or that add would be made on the pre-rename model.
    const onCommit = vi.fn();
    const onTab = vi.fn();
    const { container } = render(<RichLabelEditor runs={[{ text: 'a' }]} onCommit={onCommit} onTab={onTab} />);
    const el = editor(container);
    // Shift+Tab keeps the browser default (blur commits, focus walks back)
    expect(fireEvent.keyDown(el, { key: 'Tab', shiftKey: true })).toBe(true);
    expect(onTab).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
    el.innerHTML = 'z';
    expect(fireEvent.keyDown(el, { key: 'Tab' })).toBe(false); // default prevented: focus stays put
    expect(onCommit).toHaveBeenCalledWith([{ text: 'z' }]);
    expect(onTab).toHaveBeenCalledTimes(1);
    expect(onCommit.mock.invocationCallOrder[0]!).toBeLessThan(onTab.mock.invocationCallOrder[0]!);
  });

  it('shows the bold/italic toolbar only when the selection is non-empty', () => {
    // jsdom can't produce a real non-collapsed Selection, so stub getSelection to
    // drive syncToolbar's own logic; toolbar placement is browser-probe verified.
    const nonEmpty = {
      isCollapsed: false,
      rangeCount: 1,
      removeAllRanges: () => {},
      addRange: () => {},
      getRangeAt: () => ({ getBoundingClientRect: () => ({ left: 10, top: 40 }) }),
    } as unknown as Selection;
    const { container } = render(<RichLabelEditor runs={[{ text: 'abc' }]} onCommit={vi.fn()} />);
    // no selection yet → no toolbar
    expect(screen.queryByRole('button', { name: 'Bold' })).toBeNull();
    vi.spyOn(window, 'getSelection').mockReturnValue(nonEmpty);
    fireEvent.mouseUp(editor(container));
    // the toolbar is portaled to document.body, so query the whole screen
    expect(screen.getByRole('button', { name: 'Bold' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Italic' })).toBeTruthy();
  });
});
