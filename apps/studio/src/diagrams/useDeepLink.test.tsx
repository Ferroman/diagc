// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { defaultHost, setHost } from '../host';
import { useDeepLink, type DeepLink } from './useDeepLink';

// Drive the hook through a tiny harness so tests exercise the real effects
// (hash writer, hashchange listener, fallback promotion) without DiagramView.
function Harness({
  names,
  booted,
  onDeepLink,
  resetView = () => {},
}: {
  names: string[];
  booted: boolean;
  onDeepLink?: (dl: DeepLink) => void;
  resetView?: () => void;
}) {
  const leaveEditRef = useRef<() => boolean>(() => true);
  const resetViewRef = useRef(resetView);
  resetViewRef.current = resetView;
  const dl = useDeepLink({ names, booted, leaveEditRef, resetViewRef });
  onDeepLink?.(dl);
  return (
    <div>
      <span data-testid="selected">{dl.selected}</span>
      <span data-testid="path">{dl.enteredPath.join('/')}</span>
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
    set: (h: string) => {
      hash = h;
    },
    subscribe: (cb: () => void) => {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
    /** test hook: an "external" navigation — set + notify */
    navigate(h: string) {
      hash = h;
      subs.forEach((cb) => cb());
    },
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

  it('starts the view over when another diagram opens, but not on a drill step', () => {
    const resetView = vi.fn();
    localStorage.setItem('diagc.selected', 'gone');
    render(<Harness names={NAMES} booted resetView={resetView} />);
    // the stale name falls back to the first diagram
    expect(screen.getByTestId('selected').textContent).toBe('sketch');
    expect(resetView).toHaveBeenCalledTimes(1);
    act(() => {
      window.location.hash = '#/sketch/sys';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(screen.getByTestId('path').textContent).toBe('sys');
    expect(resetView).toHaveBeenCalledTimes(1);
    act(() => {
      window.location.hash = '#/two';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(screen.getByTestId('selected').textContent).toBe('two');
    expect(resetView).toHaveBeenCalledTimes(2);
  });

  it('updates the hash when the drill path changes', () => {
    render(<Harness names={NAMES} booted />);
    act(() => {
      screen.getByText('report-sys').click();
    });
    expect(window.location.hash).toBe('#/sketch/sys');
  });

  it('runs entirely against an injected urlState (no window.location)', () => {
    const memory = memoryUrlState();
    setHost({ ...defaultHost, urlState: memory });
    let dl: DeepLink | undefined;
    render(
      <Harness
        names={['a', 'b']}
        booted
        onDeepLink={(d) => {
          dl = d;
        }}
      />,
    );

    act(() => memory.navigate('#/b'));
    expect(screen.getByTestId('selected').textContent).toBe('b');

    act(() => dl!.selectDiagram('a'));
    expect(memory.get().endsWith('#/a')).toBe(true);

    // never touched the real window at all
    expect(window.location.hash).toBe('');
  });

  // Breaks if opening a diagram keeps the drill trail of the one before (its
  // container ids name nothing in the next).
  it('opens another diagram at its top level', () => {
    let dl: DeepLink | undefined;
    window.location.hash = '#/sketch/sys';
    render(<Harness names={NAMES} booted onDeepLink={(d) => (dl = d)} />);
    act(() => dl!.selectDiagram('two'));
    expect(screen.getByTestId('selected').textContent).toBe('two');
    expect(dl!.enteredPath).toEqual([]);
  });

  // Breaks if a rename drops the drill trail, or hands it back as the same array
  // (DiagramView re-applies a trail only on a new reference).
  it('follows a rename with the same trail as a new array', () => {
    let dl: DeepLink | undefined;
    window.location.hash = '#/sketch/sys';
    render(<Harness names={[...NAMES, 'renamed']} booted onDeepLink={(d) => (dl = d)} />);
    const trail = dl!.enteredPath;
    act(() => dl!.renameSelected('renamed'));
    expect(screen.getByTestId('selected').textContent).toBe('renamed');
    expect(dl!.enteredPath).toEqual(['sys']);
    expect(dl!.enteredPath).not.toBe(trail);
  });

  it('seeds grouping and hidden ids from the hash', () => {
    let dl: DeepLink | undefined;
    window.location.hash = '#/sketch/sys?group=1&hide=t1,__unassigned__';
    render(<Harness names={NAMES} booted onDeepLink={(d) => (dl = d)} />);
    expect(dl!.grouped).toBe(true);
    expect(dl!.hidden).toEqual(['t1', '__unassigned__']);
  });

  // The view is written into the hash, as a replace: Back must still walk
  // drill steps, not every eye toggle.
  it('writes a view change into the hash without a history entry, and nothing when default', () => {
    let dl: DeepLink | undefined;
    window.location.hash = '#/sketch';
    render(<Harness names={NAMES} booted onDeepLink={(d) => (dl = d)} />);
    const before = window.history.length;
    act(() => dl!.handleGroupedChange(true));
    act(() => dl!.handleHiddenChange(['t1']));
    expect(window.location.hash).toBe('#/sketch?group=1&hide=t1');
    expect(window.history.length).toBe(before);
    act(() => dl!.handleGroupedChange(false));
    act(() => dl!.handleHiddenChange([]));
    expect(window.location.hash).toBe('#/sketch');
    expect(window.history.length).toBe(before);
  });

  // Review Focus 5: one diagram's team ids name nothing in the next.
  it('a new diagram opens ungrouped with nothing hidden', () => {
    let dl: DeepLink | undefined;
    window.location.hash = '#/sketch?group=1&hide=t1';
    render(<Harness names={NAMES} booted onDeepLink={(d) => (dl = d)} />);
    act(() => dl!.selectDiagram('two'));
    expect(dl!.grouped).toBe(false);
    expect(dl!.hidden).toEqual([]);
    expect(window.location.hash).toBe('#/two');
    // the view's own reset report changes nothing and writes nothing
    const before = window.history.length;
    act(() => dl!.handleGroupedChange(false));
    act(() => dl!.handleHiddenChange([]));
    expect(window.location.hash).toBe('#/two');
    expect(window.history.length).toBe(before);
  });

  it('applies the view of an external hash navigation', () => {
    let dl: DeepLink | undefined;
    window.location.hash = '#/sketch';
    render(<Harness names={NAMES} booted onDeepLink={(d) => (dl = d)} />);
    act(() => {
      window.location.hash = '#/sketch?group=1&hide=a';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(dl!.grouped).toBe(true);
    expect(dl!.hidden).toEqual(['a']);
  });

  // A link's own view must win over the view's reset for the model it lands on.
  it("an external hashchange to another diagram opens with that link's view", () => {
    let dl: DeepLink | undefined;
    window.location.hash = '#/sketch?group=1&hide=a';
    render(<Harness names={NAMES} booted onDeepLink={(d) => (dl = d)} />);
    act(() => {
      window.location.hash = '#/two?group=1&hide=t1,__unassigned__';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(dl!.selected).toBe('two');
    expect(dl!.grouped).toBe(true);
    expect(dl!.hidden).toEqual(['t1', '__unassigned__']);
    expect(window.location.hash).toBe('#/two?group=1&hide=t1,__unassigned__');
  });
});
