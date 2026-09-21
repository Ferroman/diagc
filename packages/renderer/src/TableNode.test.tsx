// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';
import { createTypeRegistry } from './registry';
import { createIconRegistry } from '@diagc/icons';
import { DiagramNode, type DiagramNodeData } from './DiagramNode';

const data = (): DiagramNodeData => ({
  label: 'accounts',
  state: 'leaf',
  promoted: false,
  sharedMembers: [],
  hiddenCount: 0,
  typeId: 'db-table',
  typeRegistry: createTypeRegistry(),
  icons: createIconRegistry(),
  columns: [
    { name: 'id', type: 'uuid', pk: true },
    { name: 'access_level', type: 'int', fk: true },
    { name: 'email', type: 'text' },
  ],
});

describe('TableNode', () => {
  it('renders the table name, columns, types and PK/FK markers', () => {
    render(
      <ReactFlowProvider>
        <DiagramNode id="accounts" data={data()} />
      </ReactFlowProvider>,
    );
    expect(screen.getByText('accounts')).toBeDefined();
    expect(screen.getByText('id')).toBeDefined();
    expect(screen.getByText('uuid')).toBeDefined();
    expect(screen.getByText('access_level')).toBeDefined();
    expect(screen.getByText('FK')).toBeDefined();
  });

  it('shows a link badge and reports its click, same as the other node kinds', () => {
    const onOpenLink = vi.fn();
    const { container } = render(
      <ReactFlowProvider>
        <DiagramNode id="accounts" data={{ ...data(), link: '[[Note]]', onOpenLink }} />
      </ReactFlowProvider>,
    );
    const badge = container.querySelector('.dg-link-badge');
    expect(badge).not.toBeNull();
    fireEvent.click(badge!);
    expect(onOpenLink).toHaveBeenCalledWith('[[Note]]');
  });

  // A table has its own body, so it never reaches the branches that draw the shared
  // rename field. Double-click and a dropped Table stencil both ask for it all the same.
  it('renames in place: the header turns into the rename field and Enter commits', () => {
    const onLabelCommit = vi.fn();
    render(
      <ReactFlowProvider>
        <DiagramNode id="accounts" data={{ ...data(), labelEditing: true, onLabelCommit }} />
      </ReactFlowProvider>,
    );
    const input = screen.getByLabelText('Rename') as HTMLInputElement;
    expect(input.value).toBe('accounts');
    fireEvent.change(input, { target: { value: 'users' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onLabelCommit).toHaveBeenCalledWith('users');
  });
});

describe('TableNode edit mode', () => {
  const editData = (onColumnsChange: (c: any) => void) => ({ ...data(), onColumnsChange });

  it('read mode shows no editing controls', () => {
    const { container } = render(
      <ReactFlowProvider><DiagramNode id="t" data={data()} /></ReactFlowProvider>,
    );
    expect(container.querySelector('.dg-table-name-input')).toBeNull();
    expect(container.querySelector('.dg-table-add')).toBeNull();
  });

  it('“+ add column” appends a column', () => {
    const spy = vi.fn();
    const { getByText } = render(
      <ReactFlowProvider><DiagramNode id="t" data={editData(spy)} /></ReactFlowProvider>,
    );
    fireEvent.click(getByText(/add column/i));
    const cols = spy.mock.calls[0]![0];
    expect(cols.length).toBe(data().columns!.length + 1);
    expect(cols[cols.length - 1].name).toMatch(/column/);
  });

  it('editing a name input commits the new name', () => {
    const spy = vi.fn();
    const { container } = render(
      <ReactFlowProvider><DiagramNode id="t" data={editData(spy)} /></ReactFlowProvider>,
    );
    const first = container.querySelector('.dg-table-name-input') as HTMLInputElement;
    fireEvent.change(first, { target: { value: 'account_id' } });
    expect(spy.mock.calls[0]![0][0].name).toBe('account_id');
  });

  it('the badge cycles pk→fk on the id column', () => {
    const spy = vi.fn();
    const { container } = render(
      <ReactFlowProvider><DiagramNode id="t" data={editData(spy)} /></ReactFlowProvider>,
    );
    // first fixture column is `id` (pk); one click cycles pk → fk
    fireEvent.click(container.querySelectorAll('.dg-table-badge')[0]!);
    expect(spy.mock.calls[0]![0][0]).toMatchObject({ pk: false, fk: true });
  });

  it('delete removes the row', () => {
    const spy = vi.fn();
    const { container } = render(
      <ReactFlowProvider><DiagramNode id="t" data={editData(spy)} /></ReactFlowProvider>,
    );
    fireEvent.click(container.querySelectorAll('.dg-table-del')[0]!);
    expect(spy.mock.calls[0]![0].length).toBe(data().columns!.length - 1);
  });
});
