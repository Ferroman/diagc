// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LinksSection } from './LinksSection';

describe('LinksSection', () => {
  it('adds a link (label + url required) and clears the boxes', () => {
    const onCommand = vi.fn();
    render(<LinksSection nodeId="a" links={[{ label: 'Doc', url: 'https://d' }]} onCommand={onCommand} />);
    // No @testing-library/jest-dom in this repo (see ThreatsSection.test.tsx), so disabled is read off the element directly.
    expect((screen.getByRole('button', { name: 'Add link' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('New link label'), { target: { value: 'Ticket' } });
    fireEvent.change(screen.getByLabelText('New link url'), { target: { value: 'https://t/1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add link' }));
    expect(onCommand).toHaveBeenCalledWith({
      type: 'set-node-details',
      id: 'a',
      details: {
        links: [
          { label: 'Doc', url: 'https://d' },
          { label: 'Ticket', url: 'https://t/1' },
        ],
      },
    });
  });
  it('edits a row on blur when changed, and removing the last link clears the field', () => {
    const onCommand = vi.fn();
    render(<LinksSection nodeId="a" links={[{ label: 'Doc', url: 'https://d' }]} onCommand={onCommand} />);
    const label = screen.getByLabelText('Link 1 label');
    fireEvent.blur(label);
    expect(onCommand).not.toHaveBeenCalled();
    fireEvent.change(label, { target: { value: 'Design doc' } });
    fireEvent.blur(label);
    expect(onCommand).toHaveBeenLastCalledWith({
      type: 'set-node-details',
      id: 'a',
      details: { links: [{ label: 'Design doc', url: 'https://d' }] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remove link 1' }));
    expect(onCommand).toHaveBeenLastCalledWith({ type: 'set-node-details', id: 'a', details: { links: null } });
  });

  // breaks if a link's label or url box resyncs on the other's change (losing
  // what is typed), or stops following its own stored value
  it.each([
    ['label', 'Link 1 label'],
    ['url', 'Link 1 url'],
  ] as const)('the %s keeps a draft through the other field changing, and takes its own new value', (key, label) => {
    const ui = (link: { label: string; url: string }) => <LinksSection nodeId="a" links={[link]} onCommand={vi.fn()} />;
    const stored = { label: 'Doc', url: 'https://d' };
    const { rerender } = render(ui(stored));
    const box = () => screen.getByLabelText(label) as HTMLInputElement;
    fireEvent.change(box(), { target: { value: 'typed' } });
    const other = key === 'label' ? { url: 'https://e' } : { label: 'Spec' };
    rerender(ui({ ...stored, ...other }));
    expect(box().value).toBe('typed');
    rerender(ui({ ...stored, ...other, [key]: 'stored' }));
    expect(box().value).toBe('stored');
  });
});
