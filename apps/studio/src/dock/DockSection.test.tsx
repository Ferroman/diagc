// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { DockSection } from './DockSection';

const header = (name: string) => screen.getByRole('button', { name });

beforeEach(() => localStorage.clear());

describe('DockSection', () => {
  it('starts open, with its title as a heading over the content', () => {
    render(
      <DockSection id="threat-model" title="Threat model">
        <p>register</p>
      </DockSection>,
    );
    expect(screen.getByRole('heading', { name: 'Threat model' })).not.toBeNull();
    expect(header('Threat model').getAttribute('aria-expanded')).toBe('true');
    expect(screen.queryByText('register')).not.toBeNull();
  });

  it('folds to its header alone, and unfolds again', () => {
    render(
      <DockSection id="threat-model" title="Threat model">
        <p>register</p>
      </DockSection>,
    );
    fireEvent.click(header('Threat model'));
    expect(header('Threat model').getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('register')).toBeNull();
    fireEvent.click(header('Threat model'));
    expect(screen.queryByText('register')).not.toBeNull();
  });

  it('folds one section without touching its neighbour', () => {
    render(
      <>
        <DockSection id="threat-model" title="Threat model">
          <p>register</p>
        </DockSection>
        <DockSection id="layers-planes" title="Layers & planes">
          <p>layers</p>
        </DockSection>
      </>,
    );
    fireEvent.click(header('Threat model'));
    expect(screen.queryByText('register')).toBeNull();
    expect(screen.queryByText('layers')).not.toBeNull();
    expect(header('Layers & planes').getAttribute('aria-expanded')).toBe('true');
  });

  it('remembers a folded section across mounts, per id', () => {
    const first = render(
      <DockSection id="threat-model" title="Threat model">
        <p>register</p>
      </DockSection>,
    );
    fireEvent.click(header('Threat model'));
    first.unmount();

    render(
      <>
        <DockSection id="threat-model" title="Threat model">
          <p>register</p>
        </DockSection>
        <DockSection id="layers-planes" title="Layers & planes">
          <p>layers</p>
        </DockSection>
      </>,
    );
    expect(screen.queryByText('register')).toBeNull();
    expect(screen.queryByText('layers')).not.toBeNull();
  });

  it('is the panel landmark itself, named by its title and tied to the header', () => {
    render(
      <DockSection id="threat-model" title="Threat model" className="sidebar so-panel">
        <p>register</p>
      </DockSection>,
    );
    const panel = screen.getByRole('complementary', { name: 'Threat model' });
    expect(header('Threat model').getAttribute('aria-controls')).toBe(panel.id);
    // the panel's own classes ride on the landmark, so its stylesheet still applies
    expect(panel.classList.contains('so-panel')).toBe(true);
  });

  it('lets a panel keep a landmark name longer than its title', () => {
    render(
      <DockSection id="git" title="Git" label="Git graph">
        <p>lanes</p>
      </DockSection>,
    );
    expect(screen.getByRole('complementary', { name: 'Git graph' })).not.toBeNull();
    expect(header('Git')).not.toBeNull();
  });
});
