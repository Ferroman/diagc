// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { model } from '@diagc/core';
import { RENDERER_VERSION } from './index';
import { DiagramView } from './DiagramView';

describe('renderer testing environment', () => {
  it('renders React into jsdom', () => {
    render(<div data-testid="probe">v{RENDERER_VERSION}</div>);
    expect(screen.getByTestId('probe').textContent).toBe('v1');
  });

  it('renders a two-table FK diagram', async () => {
    const b = model('erd');
    const a = b.table('a', { columns: [{ name: 'id', pk: true }, { name: 'b_id', fk: true }] });
    const bb = b.table('b', { columns: [{ name: 'id', pk: true }] });
    b.fk(a, 'b_id', bb);
    render(<DiagramView model={b.toJSON()} />);
    expect(await screen.findByText('b_id')).toBeDefined();
  });
});

describe('chrome prop', () => {
  const grouped = () => {
    const b = model('g');
    const parent = b.node('p', { name: 'Parent' });
    parent.contains(b.node('c', { name: 'Child' }));
    return b.toJSON();
  };

  it('renders the control cluster by default', async () => {
    const { container } = render(<DiagramView model={grouped()} />);
    await screen.findByText('Parent');
    expect(container.querySelector('.react-flow__controls')).not.toBeNull();
    expect(container.querySelector('.dg-no-chrome')).toBeNull();
  });

  // The PNG export sets chrome={false}: a still image should be the diagram
  // alone, with no zoom widget or pin affordance baked into it.
  it('drops the control cluster and marks the canvas when chrome is false', async () => {
    const { container } = render(<DiagramView model={grouped()} chrome={false} />);
    await screen.findByText('Parent');
    expect(container.querySelector('.react-flow__controls')).toBeNull();
    expect(container.querySelector('.dg-no-chrome')).not.toBeNull();
  });
});
