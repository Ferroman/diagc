// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useRef } from 'react';
import { useDeepLink } from './useDeepLink';

// Drive the hook through a tiny harness so tests exercise the real effects
// (hash writer, hashchange listener, fallback promotion) without DiagramView.
function Harness({ names, booted }: { names: string[]; booted: boolean }) {
  const leaveEditRef = useRef<() => boolean>(() => true);
  const dl = useDeepLink({ names, booted, leaveEditRef });
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

const NAMES = ['sketch', 'two'];

describe('useDeepLink', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/'); // strip any hash
    localStorage.clear();
  });

  it('seeds selected + drill path from a deep-link hash', () => {
    window.location.hash = '#/sketch/sys';
    render(<Harness names={NAMES} booted />);
    expect(screen.getByTestId('selected').textContent).toBe('sketch');
    expect(screen.getByTestId('path').textContent).toBe('sys');
  });

  it('lets the hash outrank the localStorage memory', () => {
    localStorage.setItem('diagramming.selected', 'two');
    window.location.hash = '#/sketch';
    render(<Harness names={NAMES} booted />);
    expect(screen.getByTestId('selected').textContent).toBe('sketch');
  });

  it('keeps the localStorage memory when there is no hash', () => {
    localStorage.setItem('diagramming.selected', 'two');
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
});
