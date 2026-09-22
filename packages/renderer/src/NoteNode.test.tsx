// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';
import { NOTE_WIDTH, NoteNode, type NoteData } from './NoteNode';

const base: NoteData = {
  target: { node: 'a' },
  name: 'Web app',
  threats: [
    { id: 't1', category: 'S', title: 'Spoofed session' },
    { id: 't2', category: 'T', title: 'Config tamper', status: 'mitigated', description: 'Config is world-writable', mitigation: 'chmod 600' },
  ],
  anchor: { x: 0, y: 0 },
  badge: { x: 0, y: 0 },
  editing: false,
  comments: [],
  links: [],
};
const draw = (data: NoteData) => render(<ReactFlowProvider><NoteNode id="note:node:a" data={data} /></ReactFlowProvider>);
const rowsOf = (container: HTMLElement) => Array.from(container.querySelectorAll<HTMLElement>('.dg-note-row'));

describe('NoteNode — the bubble', () => {
  it('is a bubble of NOTE_WIDTH headed by name and open / total', () => {
    const { container } = draw(base);
    const bubble = container.querySelector('.dg-note') as HTMLElement;
    expect(bubble.style.width).toBe(`${NOTE_WIDTH}px`);
    expect(bubble.querySelector('.dg-note-name')?.textContent).toBe('Web app');
    expect(bubble.querySelector('.dg-note-count')?.textContent).toBe('1 / 2');
    expect(bubble.querySelector('.dg-note-count')?.getAttribute('data-state')).toBe('open');
  });

  it('draws its tail toward the badge once React Flow has measured it, from the side facing the badge', () => {
    // the bubble sits at (100, 100) absolute, 220×80; the badge is below-right of it
    const { container } = render(
      <ReactFlowProvider>
        <NoteNode id="note:node:a" data={{ ...base, badge: { x: 340, y: 200 } }} positionAbsoluteX={100} positionAbsoluteY={100} width={220} height={80} />
      </ReactFlowProvider>,
    );
    const tail = container.querySelector('svg.dg-note-tail') as SVGElement;
    expect(tail.getAttribute('data-side')).toBe('bottom');
    // one open path: fill closes it, the stroke draws only the two long sides
    expect(tail.querySelector('path')?.getAttribute('d')).toMatch(/^M[^Z]*$/);
  });

  it('draws no tail before it is measured, nor with the badge under the bubble', () => {
    const unmeasured = render(
      <ReactFlowProvider>
        <NoteNode id="note:node:a" data={{ ...base, badge: { x: 340, y: 200 } }} positionAbsoluteX={100} positionAbsoluteY={100} />
      </ReactFlowProvider>,
    );
    expect(unmeasured.container.querySelector('.dg-note-tail')).toBeNull();
    unmeasured.unmount();
    const covered = render(
      <ReactFlowProvider>
        <NoteNode id="note:node:a" data={{ ...base, badge: { x: 150, y: 140 } }} positionAbsoluteX={100} positionAbsoluteY={100} width={220} height={80} />
      </ReactFlowProvider>,
    );
    expect(covered.container.querySelector('.dg-note-tail')).toBeNull();
  });

  it('rows carry the STRIDE chip, the title and the status word; a handled row is muted, not struck or ticked', () => {
    const { container } = draw(base);
    const [open, handled] = rowsOf(container);
    expect(open?.querySelector('.dg-stride')?.textContent).toBe('S');
    expect(open?.querySelector('.dg-stride')?.getAttribute('title')).toBe('Spoofing');
    expect(open?.querySelector('.dg-note-status')?.textContent).toBe('open');
    expect(open?.querySelector('.dg-note-status')?.getAttribute('data-status')).toBe('open');
    expect(handled?.getAttribute('data-open')).toBe('false');
    expect(handled?.querySelector('.dg-note-status')?.textContent).toBe('mitigated');
    // the status chip says which handling — the row needs no tooltip and no ✓
    expect(handled?.getAttribute('title')).toBeNull();
    expect(handled?.textContent).not.toContain('✓');
  });

  it('shows n/a for not-applicable', () => {
    const { container } = draw({ ...base, threats: [{ id: 't', category: 'D', title: 'x', status: 'not-applicable' }] });
    const chip = container.querySelector('.dg-note-status') as HTMLElement;
    expect(chip.textContent).toBe('n/a');
    expect(chip.getAttribute('data-status')).toBe('not-applicable');
  });

  it('view mode: the status is a plain span, ▸ appears only where there are details, and expands to read-only text', () => {
    const { container } = draw(base);
    expect(container.querySelector('button.dg-note-status')).toBeNull();
    const [open, handled] = rowsOf(container);
    expect(open?.querySelector('.dg-note-expand')).toBeNull(); // nothing to show
    const expand = within(handled!).getByRole('button', { name: 'Show details' });
    expect(expand.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(expand);
    const details = container.querySelector('.dg-note-details') as HTMLElement;
    expect(details.textContent).toContain('Config is world-writable');
    expect(details.textContent).toContain('Mitigation');
    expect(details.textContent).toContain('chmod 600');
    expect(details.querySelector('textarea')).toBeNull();
    expect(within(handled!).getByRole('button', { name: 'Hide details' }).getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('.dg-note-add')).toBeNull(); // view mode: no +
  });

  it('edit mode: the status chip advances the status through the host', () => {
    const onSetThreatStatus = vi.fn();
    const { container } = draw({ ...base, editing: true, onSetThreatStatus });
    const [open, handled] = rowsOf(container);
    const chip = within(open!).getByRole('button', { name: 'Set status' });
    expect(chip.getAttribute('title')).toBe('Status: open — click to change');
    fireEvent.click(chip);
    expect(onSetThreatStatus).toHaveBeenCalledWith({ node: 'a' }, 't1', 'mitigated');
    fireEvent.click(within(handled!).getByRole('button', { name: 'Set status' }));
    expect(onSetThreatStatus).toHaveBeenCalledWith({ node: 'a' }, 't2', 'accepted');
  });

  it('edit mode: every row offers ▸; the details are textareas that commit on blur only when changed', () => {
    const onEditThreatText = vi.fn();
    const { container } = draw({ ...base, editing: true, onEditThreatText });
    const [open, handled] = rowsOf(container);
    expect(within(open!).getByRole('button', { name: 'Show details' })).toBeDefined();
    fireEvent.click(within(handled!).getByRole('button', { name: 'Show details' }));
    const desc = screen.getByLabelText('Description') as HTMLTextAreaElement;
    const mit = screen.getByLabelText('Mitigation') as HTMLTextAreaElement;
    expect(desc.value).toBe('Config is world-writable');
    expect(mit.value).toBe('chmod 600');
    fireEvent.blur(desc); // unchanged: nothing to say
    expect(onEditThreatText).not.toHaveBeenCalled();
    fireEvent.change(desc, { target: { value: '  Config is world-readable  ' } });
    fireEvent.blur(desc);
    expect(onEditThreatText).toHaveBeenCalledWith({ node: 'a' }, 't2', 'description', 'Config is world-readable');
    fireEvent.change(mit, { target: { value: '' } });
    fireEvent.blur(mit);
    expect(onEditThreatText).toHaveBeenCalledWith({ node: 'a' }, 't2', 'mitigation', '');
  });

  it('Escape in a details field restores the model text and commits nothing', () => {
    const onEditThreatText = vi.fn();
    const { container } = draw({ ...base, editing: true, onEditThreatText });
    fireEvent.click(within(rowsOf(container)[1]!).getByRole('button', { name: 'Show details' }));
    const desc = screen.getByLabelText('Description') as HTMLTextAreaElement;
    fireEvent.change(desc, { target: { value: 'half-typed' } });
    fireEvent.keyDown(desc, { key: 'Escape' });
    expect(desc.value).toBe('Config is world-writable');
    fireEvent.blur(desc);
    expect(onEditThreatText).not.toHaveBeenCalled();
  });

  it('edit mode: + adds a threat on the target; double-click retitles a row', () => {
    const onAddThreat = vi.fn();
    const onRetitleThreat = vi.fn();
    const { container } = draw({ ...base, editing: true, onAddThreat, onRetitleThreat });
    fireEvent.click(screen.getByRole('button', { name: 'Add a threat' }));
    expect(onAddThreat).toHaveBeenCalledWith({ node: 'a' });
    fireEvent.doubleClick(container.querySelectorAll('.dg-note-title')[0]!);
    const input = screen.getByLabelText('Rename threat') as HTMLInputElement;
    expect(input.value).toBe('Spoofed session');
    fireEvent.change(input, { target: { value: 'Session fixation' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRetitleThreat).toHaveBeenCalledWith({ node: 'a' }, 't1', 'Session fixation');
    expect(screen.queryByLabelText('Rename threat')).toBeNull();
  });

  it('Escape commits an empty title (the host decides whether that removes it)', () => {
    const onRetitleThreat = vi.fn();
    const { container } = draw({ ...base, editing: true, onRetitleThreat });
    fireEvent.doubleClick(container.querySelectorAll('.dg-note-title')[0]!);
    fireEvent.keyDown(screen.getByLabelText('Rename threat'), { key: 'Escape' });
    expect(onRetitleThreat).toHaveBeenCalledWith({ node: 'a' }, 't1', '');
  });

  it('opens the row the host asked for (editingId) and reports when it is done', () => {
    const onEndEdit = vi.fn();
    draw({ ...base, editing: true, editingId: 't2', onRetitleThreat: vi.fn(), onEndEdit });
    const input = screen.getByLabelText('Rename threat') as HTMLInputElement;
    expect(input.value).toBe('Config tamper');
    fireEvent.blur(input);
    expect(onEndEdit).toHaveBeenCalled();
  });

  it('mouse events on the controls and fields never reach the canvas', () => {
    const seen = vi.fn();
    document.body.addEventListener('mousedown', seen);
    const { container } = draw({ ...base, editing: true, onAddThreat: vi.fn(), onRetitleThreat: vi.fn(), onSetThreatStatus: vi.fn(), onEditThreatText: vi.fn() });
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Add a threat' }));
    const [open, handled] = rowsOf(container);
    fireEvent.mouseDown(within(open!).getByRole('button', { name: 'Set status' }));
    fireEvent.mouseDown(within(handled!).getByRole('button', { name: 'Show details' }));
    fireEvent.click(within(handled!).getByRole('button', { name: 'Show details' }));
    // a mousedown in a field must not reach the canvas, or React Flow starts
    // dragging the bubble out from under the caret
    fireEvent.mouseDown(screen.getByLabelText('Description'));
    fireEvent.doubleClick(container.querySelectorAll('.dg-note-title')[0]!);
    fireEvent.mouseDown(screen.getByLabelText('Rename threat'));
    expect(seen).not.toHaveBeenCalled();
    document.body.removeEventListener('mousedown', seen);
  });

  it('drops an expanded but empty details block when edit mode ends', () => {
    // A row with no description and no mitigation only has something to show
    // while the textareas are there. Left expanded, it would export as an
    // empty gap under the row.
    const { container, rerender } = draw({ ...base, editing: true, onEditThreatText: vi.fn() });
    const [empty, filled] = rowsOf(container);
    fireEvent.click(within(empty!).getByRole('button', { name: 'Show details' }));
    fireEvent.click(within(filled!).getByRole('button', { name: 'Show details' }));
    expect(container.querySelectorAll('.dg-note-details')).toHaveLength(2);
    rerender(<ReactFlowProvider><NoteNode id="note:node:a" data={{ ...base, editing: false }} /></ReactFlowProvider>);
    // not "collapse everything on the way out": the row that has text to show
    // stays expanded, so the empty one's disappearance is about being empty
    expect(rowsOf(container)[0]?.querySelector('.dg-note-details')).toBeNull();
    expect(rowsOf(container)[1]?.querySelector('.dg-note-details')?.textContent).toContain('chmod 600');
  });

  it('drops a half-finished rename when edit mode ends', () => {
    const { container, rerender } = draw({ ...base, editing: true, onRetitleThreat: vi.fn() });
    fireEvent.doubleClick(container.querySelectorAll('.dg-note-title')[0]!);
    expect(screen.getByLabelText('Rename threat')).toBeDefined();
    const at = (editing: boolean) =>
      rerender(<ReactFlowProvider><NoteNode id="note:node:a" data={{ ...base, editing, onRetitleThreat: vi.fn() }} /></ReactFlowProvider>);
    at(false);
    at(true);
    expect(screen.queryByLabelText('Rename threat')).toBeNull();
  });
});

describe('NoteNode — comments and links', () => {
  it('lists comments with their by · at line, under a section title, and no threat header when there are no threats', () => {
    const { container } = draw({ ...base, threats: [], comments: [{ id: 'c1', text: 'Slipped a week', by: 'Ann', at: '2026-09-22' }, { id: 'c2', text: 'Vendor confirmed' }] });
    expect(container.querySelector('.dg-note-count')).toBeNull();
    expect(container.querySelector('.dg-note-rows')).toBeNull();
    const items = Array.from(container.querySelectorAll('.dg-note-comment'));
    expect(items.map((i) => i.querySelector('.dg-note-text')?.textContent)).toEqual(['Slipped a week', 'Vendor confirmed']);
    expect(items[0]!.querySelector('.dg-note-meta')?.textContent).toBe('Ann · 2026-09-22');
    expect(items[1]!.querySelector('.dg-note-meta')).toBeNull();
    expect(container.querySelector('.dg-note-section')?.textContent).toContain('Comments');
  });
  it('lists links as new-tab anchors, and routes through the host when it listens', () => {
    const onOpenLink = vi.fn();
    const { container } = draw({ ...base, threats: [], links: [{ label: 'Ticket', url: 'https://x/1' }], onOpenLink });
    const a = container.querySelector<HTMLAnchorElement>('a.dg-note-link')!;
    expect(a.textContent).toBe('Ticket');
    expect(a.getAttribute('href')).toBe('https://x/1');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    fireEvent.click(a);
    expect(onOpenLink).toHaveBeenCalledWith('https://x/1');
  });
  it('keeps the threat header and rows when threats exist alongside comments', () => {
    const { container } = draw({ ...base, comments: [{ id: 'c1', text: 'x' }] });
    expect(container.querySelector('.dg-note-count')).not.toBeNull();
    expect(container.querySelectorAll('.dg-note-row').length).toBe(base.threats.length);
    expect(container.querySelectorAll('.dg-note-comment').length).toBe(1);
  });
});
