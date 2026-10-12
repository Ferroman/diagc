// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DiagramModel, ValidationIssue } from '@diagc/core/internal';
import { IssueList } from './IssueList';

const model: DiagramModel = {
  version: 1,
  id: 'm',
  name: 'm',
  nodes: [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
  ],
  containment: [],
  relations: [{ id: 'a->b#0', from: 'a', to: 'b', kind: 'sync' }],
  layers: [],
  planes: [],
};
// the list reads codes as keys only, so any string stands in for one
const issue = (code: string, message: string, ref?: string): ValidationIssue =>
  (ref === undefined ? { code, message } : { code, message, ref }) as ValidationIssue;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('IssueList', () => {
  // breaks if an empty list still renders its <ul>
  it('renders nothing while the model is sound', () => {
    const { container } = render(<IssueList model={model} issues={[]} selects="nodes" onSelect={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  // breaks if a node row stops selecting its node, or a row naming nothing
  // on the canvas becomes a button
  it('selects the node a row names, and leaves a row with no element as text', () => {
    const onSelect = vi.fn();
    render(
      <IssueList
        model={model}
        issues={[issue('x-node', 'node issue', 'a'), issue('x-model', 'model issue', 'm'), issue('x-none', 'no ref')]}
        selects="nodes"
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'node issue' }));
    expect(onSelect).toHaveBeenCalledWith({ kind: 'node', id: 'a' });
    expect(screen.getByText('model issue').tagName).toBe('SPAN');
    expect(screen.getByText('no ref').tagName).toBe('SPAN');
  });

  // breaks if `nodes` lets a relation row select, or `elements` stops it
  it('selects a relation only when the list selects elements', () => {
    const onSelect = vi.fn();
    const issues = [issue('x-flow', 'flow issue', 'a->b#0')];
    const { rerender } = render(<IssueList model={model} issues={issues} selects="nodes" onSelect={onSelect} />);
    expect(screen.getByText('flow issue').tagName).toBe('SPAN');
    rerender(<IssueList model={model} issues={issues} selects="elements" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'flow issue' }));
    expect(onSelect).toHaveBeenCalledWith({ kind: 'edge', id: 'a->b#0' });
  });

  // breaks if the list's class or accessible name change
  it('is an so-issues list, named only when given a label', () => {
    const issues = [issue('x', 'one', 'a')];
    const { rerender } = render(<IssueList model={model} issues={issues} selects="nodes" onSelect={vi.fn()} />);
    expect(screen.getByRole('list').className).toBe('so-issues');
    expect(screen.getByRole('list').hasAttribute('aria-label')).toBe(false);
    rerender(<IssueList model={model} issues={issues} selects="nodes" onSelect={vi.fn()} label="Issues" />);
    expect(screen.getByRole('list', { name: 'Issues' })).toBeTruthy();
  });

  // breaks if rows sharing a code and a ref collide on their key (React warns
  // and may drop one) when the list keys by index
  it('keeps rows that share a code and a ref apart when keyed by index', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const issues = [issue('threat-dup', 'first', 'a'), issue('threat-dup', 'second', 'a')];
    render(<IssueList model={model} issues={issues} selects="elements" onSelect={vi.fn()} keyByIndex />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(error).not.toHaveBeenCalled();
  });
});
