// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useRef } from 'react';
import { defaultHost, setHost } from '../host';
import { useDeepLink, type DeepLink } from './useDeepLink';

// Drive the hook through a tiny harness so tests exercise the real effects
// (hash writer, hashchange listener, fallback promotion) without DiagramView.
function Harness({
  names,
  booted,
  onDeepLink,
}: {
  names: string[];
  booted: boolean;
  onDeepLink?: (dl: DeepLink) => void;
}) {
  const leaveEditRef = useRef<() => boolean>(() => true);
  const dl = useDeepLink({ names, booted, leaveEditRef });
  onDeepLink?.(dl);
  return (
    <div>
      <span data-testid="selected">{dl.selected}</span>
      <span data-testid="path">{dl.enteredPath.join('/')}</span>
      <button onClick={() => dl.setSelected('two')}>select-two</button>
      <button onClick={() => dl.setEnteredPath(['sys'])}>drill-sys</button>
      <button onClick={() => dl.setEnteredPath([])}>clear-path</button>
      <button onClick={() => dl.handleEnteredPathChange(['sys'])}>report-sys</button>
    </div>
  );
}

// A minimal UrlStateAdapter with no window.location involved at all, to prove
// the hook goes through the host rather than the global.
const memoryUrlState = () => {
  let hash = '';
  const subs = new Set<() => void>();
  return {
    get: () => hash,
    set: (h: string) => { hash = h; },
    subscribe: (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb); }; },
    /** test hook: an "external" navigation — set + notify */
    navigate(h: string) { hash = h; subs.forEach((cb) => cb()); },
  };
};

const NAMES = ['sketch', 'two'];

describe('useDeepLink', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/'); // strip any hash
    localStorage.clear();
  });

  afterEach(() => {
    setHost(defaultHost);
  });

  it('seeds selected + drill path from a deep-link hash', () => {
    window.location.hash = '#/sketch/sys';
    render(<Harness names={NAMES} booted />);
    expect(screen.getByTestId('selected').textContent).toBe('sketch');
    expect(screen.getByTestId('path').textContent).toBe('sys');
  });

  it('lets the hash outrank the localStorage memory', () => {
    localStorage.setItem('diagc.selected', 'two');
    window.location.hash = '#/sketch';
    render(<Harness names={NAMES} booted />);
    expect(screen.getByTestId('selected').textContent).toBe('sketch');
  });

  it('keeps the localStorage memory when there is no hash', () => {
    localStorage.setItem('diagc.selected', 'two');
    render(<Harness names={NAMES} booted />);
    expect(screen.getByTestId('selected').textContent).toBe('two');
  });

  it('promotes a stale/absent selection out of the empty string once booted', () => {
    const { rerender } = render(<Harness names={NAMES} booted={false} />);
    // nothing stored + not booted → '' (names are empty pre-boot anyway)
    expect(screen.getByTestId('selected').textContent).toBe('');
    rerender(<Harness names={NAMES} booted />);
    expect(screen.getByTestId('selected').textContent).toBe('sketch');
  });

  it('applies an external hash navigation via the hashchange listener', () => {
    render(<Harness names={NAMES} booted />);
    act(() => {
      window.location.hash = '#/sketch/sys';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(screen.getByTestId('path').textContent).toBe('sys');
  });

  it('updates the hash when the drill path changes', () => {
    render(<Harness names={NAMES} booted />);
    act(() => {
      screen.getByText('drill-sys').click();
    });
    expect(window.location.hash).toBe('#/sketch/sys');
  });

  it('runs entirely against an injected urlState (no window.location)', () => {
    const memory = memoryUrlState();
    setHost({ ...defaultHost, urlState: memory });
    let dl: DeepLink | undefined;
    render(<Harness names={['a', 'b']} booted onDeepLink={(d) => { dl = d; }} />);

    act(() => memory.navigate('#/b'));
    expect(screen.getByTestId('selected').textContent).toBe('b');

    act(() => dl!.setSelected('a'));
    expect(memory.get().endsWith('#/a')).toBe(true);

    // never touched the real window at all
    expect(window.location.hash).toBe('');
  });
});
