// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveKeymap, type Keymap, type Mode } from './keymap';
import { useHotkeys, type Handlers } from './useHotkeys';

const roots: HTMLElement[] = [];
afterEach(() => {
  for (const r of roots.splice(0)) r.remove();
});

function setup(handlers: Handlers, over: { keymap?: Keymap; mode?: Mode; suspended?: boolean } = {}) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  roots.push(root);
  const rootRef = { current: root };
  const handlersRef = { current: handlers };
  renderHook(() =>
    useHotkeys({
      rootRef,
      handlersRef,
      keymap: over.keymap ?? resolveKeymap({}),
      mode: over.mode ?? 'edit',
      suspended: over.suspended ?? false,
      mac: false,
    }),
  );
  return root;
}

const press = (init: KeyboardEventInit, target: EventTarget = window) => {
  const e = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
};

describe('useHotkeys', () => {
  it('runs the action a chord is bound to and claims the key', () => {
    const addNode = vi.fn();
    setup({ 'edit.add-node': addNode });
    expect(press({ key: 'n' }).defaultPrevented).toBe(true);
    expect(addNode).toHaveBeenCalledTimes(1);
  });

  it('leaves the key alone when the handler says it did nothing', () => {
    const addChild = vi.fn(() => false);
    setup({ 'edit.add-child': addChild });
    expect(press({ key: 'Tab' }).defaultPrevented).toBe(false); // still the focus key
    expect(addChild).toHaveBeenCalledTimes(1);
  });

  it('leaves the key alone when the action has no handler right now', () => {
    setup({});
    expect(press({ key: 's', ctrlKey: true }).defaultPrevented).toBe(false);
  });

  it('honours the mode: an edit key is dead in view mode', () => {
    const addNode = vi.fn();
    setup({ 'edit.add-node': addNode }, { mode: 'view' });
    press({ key: 'n' });
    expect(addNode).not.toHaveBeenCalled();
  });

  it('follows a rebind: the new key fires, the old one does not', () => {
    const addNode = vi.fn();
    setup({ 'edit.add-node': addNode }, { keymap: resolveKeymap({ 'edit.add-node': ['A'] }) });
    press({ key: 'n' });
    expect(addNode).not.toHaveBeenCalled();
    press({ key: 'a' });
    expect(addNode).toHaveBeenCalledTimes(1);
  });

  it('ignores keys typed into a field or an editable region', () => {
    const addNode = vi.fn();
    const root = setup({ 'edit.add-node': addNode });
    const input = root.appendChild(document.createElement('input'));
    const rich = root.appendChild(document.createElement('div'));
    rich.setAttribute('contenteditable', 'true');
    const inner = rich.appendChild(document.createElement('span'));
    press({ key: 'n' }, input);
    press({ key: 'n' }, inner);
    expect(addNode).not.toHaveBeenCalled();
  });

  it('lets an in-fields action through from a field, on a modified chord only', () => {
    const picker = vi.fn();
    // bind the picker to a bare key as well: a field must still swallow that one
    const root = setup({ 'diagram.picker': picker }, { keymap: resolveKeymap({ 'diagram.picker': ['Mod+K', 'K'] }) });
    const input = root.appendChild(document.createElement('input'));
    expect(press({ key: 'k', ctrlKey: true }, input).defaultPrevented).toBe(true); // closes the picker from its search box
    expect(picker).toHaveBeenCalledTimes(1);
    press({ key: 'k' }, input); // typing a k
    expect(picker).toHaveBeenCalledTimes(1);
  });

  it('keeps an in-fields action out of a field that is not the studio\'s', () => {
    const picker = vi.fn();
    setup({ 'diagram.picker': picker });
    const note = document.body.appendChild(document.createElement('textarea')); // Cmd+K in an Obsidian note is "insert link"
    roots.push(note);
    expect(press({ key: 'k', ctrlKey: true }, note).defaultPrevented).toBe(false);
    expect(picker).not.toHaveBeenCalled();
  });

  it('ignores keys aimed at another part of the host document, but not at the page itself', () => {
    const addNode = vi.fn();
    const root = setup({ 'edit.add-node': addNode });
    const elsewhere = document.body.appendChild(document.createElement('button'));
    roots.push(elsewhere);
    press({ key: 'n' }, elsewhere); // an Obsidian pane that is not ours
    expect(addNode).not.toHaveBeenCalled();
    press({ key: 'n' }, document.body); // nothing focused
    press({ key: 'n' }, root.appendChild(document.createElement('button'))); // our own toolbar
    expect(addNode).toHaveBeenCalledTimes(2);
  });

  it('stands down while suspended (the shortcuts dialog is recording keys)', () => {
    const addNode = vi.fn();
    setup({ 'edit.add-node': addNode }, { suspended: true });
    expect(press({ key: 'n' }).defaultPrevented).toBe(false);
    expect(addNode).not.toHaveBeenCalled();
  });

  it('ignores auto-repeat except where the action asks for it', () => {
    const save = vi.fn();
    const undo = vi.fn();
    setup({ 'edit.save': save, 'edit.undo': undo });
    press({ key: 's', ctrlKey: true });
    // Held: not run again — but still claimed, or the browser's Save dialog opens.
    expect(press({ key: 's', ctrlKey: true, repeat: true }).defaultPrevented).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    press({ key: 'z', ctrlKey: true });
    press({ key: 'z', ctrlKey: true, repeat: true });
    expect(undo).toHaveBeenCalledTimes(2);
  });

  it('does not claim the repeats of a key whose first press was declined', () => {
    setup({ 'edit.add-child': () => false });
    press({ key: 'Tab' });
    expect(press({ key: 'Tab', repeat: true }).defaultPrevented).toBe(false); // holding Tab still walks focus
  });

  it('gets Escape to Select in edit mode', () => {
    const select = vi.fn();
    setup({ 'tool.select': select });
    press({ key: 'Escape' });
    expect(select).toHaveBeenCalledTimes(1);
  });
});
