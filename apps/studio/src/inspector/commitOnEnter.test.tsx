// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { commitOnEnter } from './commitOnEnter';

function Field({ run }: { run: () => void }) {
  return <input aria-label="field" onKeyDown={(e) => commitOnEnter(e, run)} />;
}

describe('commitOnEnter', () => {
  it('runs the commit on Enter and prevents the default', () => {
    const run = vi.fn();
    render(<Field run={run} />);
    const notPrevented = fireEvent.keyDown(screen.getByLabelText('field'), { key: 'Enter' });
    expect(run).toHaveBeenCalledTimes(1);
    expect(notPrevented).toBe(false);
  });

  it('leaves every other key alone', () => {
    const run = vi.fn();
    render(<Field run={run} />);
    const notPrevented = fireEvent.keyDown(screen.getByLabelText('field'), { key: 'a' });
    expect(run).not.toHaveBeenCalled();
    expect(notPrevented).toBe(true);
  });
});
