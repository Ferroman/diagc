// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findHome } from './home';

// site/site.js run against site/index.html, the pair the site ships. The script is a
// plain one (no module syntax), so it is evaluated here the way a <script> tag runs it.
const root = findHome(fileURLToPath(import.meta.url)).root;
const read = (f: string): string => (existsSync(f) ? readFileSync(f, 'utf8') : '');
const page = read(path.join(root, 'site', 'index.html'));
const script = read(path.join(root, 'site', 'site.js'));

const $ = <T extends Element = HTMLElement>(selector: string): T => {
  const el = document.querySelector<T>(selector);
  if (el === null) throw new Error(`no ${selector} on the page`);
  return el;
};
/** Click, and say whether the page's own handler cancelled the default action. jsdom
 * cannot follow a link, so a listener that runs after the page's (the event bubbles up
 * to the document) records that decision and then cancels the click itself. */
const click = (el: Element, init: MouseEventInit = {}): boolean => {
  let cancelled = false;
  document.addEventListener(
    'click',
    (e) => {
      cancelled = e.defaultPrevented;
      e.preventDefault();
    },
    { once: true },
  );
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init }));
  return cancelled;
};

beforeEach(() => {
  document.documentElement.innerHTML = /<html[^>]*>([\s\S]*)<\/html>/i.exec(page)?.[1] ?? '';
  new Function(script)();
});
afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard');
  window.getSelection()?.removeAllRanges();
});

describe('the landing page script', () => {
  it('loads a demo into the stage on a click', () => {
    const demo = document.querySelectorAll<HTMLAnchorElement>('.thumbs a[data-live]')[1]!;
    expect(click(demo)).toBe(true);
    expect($<HTMLIFrameElement>('#stage-frame iframe').getAttribute('src')).toBe(demo.getAttribute('href'));
    expect($('#stage-title').textContent).toBe(demo.dataset['title']);
    expect($<HTMLAnchorElement>('#stage-open').getAttribute('href')).toBe(demo.getAttribute('href'));
    expect($('.stage-poster').hidden).toBe(true);
    expect($('.stage-live').hidden).toBe(false);
  });

  it('leaves a modified click to the browser', () => {
    expect(click($('.thumbs a[data-live]'), { ctrlKey: true })).toBe(false);
    expect(document.querySelector('#stage-frame iframe')).toBeNull();
  });

  it('puts the picture back on Close', () => {
    click($('.stage-poster'));
    expect(document.querySelector('#stage-frame iframe')).not.toBeNull();
    click($('#stage-close'));
    expect(document.querySelector('#stage-frame iframe')).toBeNull();
    expect($('.stage-poster').hidden).toBe(false);
    expect($('.stage-live').hidden).toBe(true);
  });

  it('copies the install line', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    click($('#copy-install'));
    await vi.waitFor(() => expect($('#copy-install').textContent).toBe('Copied'));
    expect(writeText).toHaveBeenCalledWith($('#install-command').textContent);
  });

  it('selects the install line when there is no clipboard', async () => {
    click($('#copy-install'));
    await vi.waitFor(() => expect($('#copy-install').textContent).toBe('Selected'));
    expect(window.getSelection()?.getRangeAt(0).toString()).toBe($('#install-command').textContent);
  });
});
