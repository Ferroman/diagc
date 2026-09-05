// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { model } from '@diagramming/core';
import { Embed } from './Embed';
import type { EmbedSpec } from './fence';

const twoNodeModel = () => {
  const b = model('demo');
  b.node('a', { name: 'Alpha', type: 'service' });
  b.node('b', { name: 'Beta', type: 'database' });
  return b.toJSON();
};

const spec: EmbedSpec = { name: 'demo', height: 300 };

// Embed imports nothing from 'obsidian' — the 'obsidian' package ships types
// only (package.json `"main": ""`), so any test that pulled it in at runtime
// would fail to resolve a module. Everything host-specific (apiFetch, link
// opening, asset/library bases) arrives as a prop instead, which is exactly
// what makes this component unit-testable at all.
describe('Embed', () => {
  it('renders both node names once the model loads', async () => {
    const apiFetch = vi.fn(async () => new Response(JSON.stringify({ model: twoNodeModel() }), { status: 200 }));
    render(
      <Embed
        spec={spec}
        apiFetch={apiFetch}
        openLink={vi.fn()}
        assetBase=""
        libraryBase=""
        onOpenStudio={vi.fn()}
      />,
    );
    expect(await screen.findByText('Alpha')).toBeDefined();
    expect(screen.getByText('Beta')).toBeDefined();
    expect(apiFetch).toHaveBeenCalledWith('/api/diagrams/demo');
  });

  it('publishes the light-theme --dg-* tokens so node/group borders resolve', () => {
    // Without this, DiagramView's colorMode="light" themes React Flow itself
    // but never sets the --dg-* custom properties node strokes/fills and the
    // dashed group borders read from (see apps/viewer/src/Viewer.tsx's
    // identical effect) — an embed opened before the studio pane ever ran
    // this session would render every box border-less. Clear the property
    // first (jsdom persists documentElement styles across tests in this
    // file) so a pass here proves Embed set it, not a leftover from a
    // previous test.
    document.documentElement.style.removeProperty('--dg-node-stroke');
    const apiFetch = vi.fn(async () => new Response(JSON.stringify({ model: twoNodeModel() }), { status: 200 }));
    render(
      <Embed
        spec={spec}
        apiFetch={apiFetch}
        openLink={vi.fn()}
        assetBase=""
        libraryBase=""
        onOpenStudio={vi.fn()}
      />,
    );
    // The effect has no dependency on the fetch/load state, so it has already
    // run (RTL's render() flushes mount-time effects) before this assertion.
    expect(document.documentElement.style.getPropertyValue('--dg-node-stroke')).not.toBe('');
    document.documentElement.style.removeProperty('--dg-node-stroke'); // don't leak into later tests
  });

  it('renders the error card for a failed fetch', async () => {
    const apiFetch = vi.fn(
      async () => new Response(JSON.stringify({ issues: [{ message: "No diagram source 'demo'" }] }), { status: 404 }),
    );
    const { container } = render(
      <Embed
        spec={spec}
        apiFetch={apiFetch}
        openLink={vi.fn()}
        assetBase=""
        libraryBase=""
        onOpenStudio={vi.fn()}
      />,
    );
    await waitFor(() => expect(container.querySelector('.dg-embed-error')).not.toBeNull());
    expect(screen.getByText(/No diagram source 'demo'/)).toBeDefined();
  });

  it('renders the error card when apiFetch itself rejects', async () => {
    const apiFetch = vi.fn(async () => {
      throw new Error('network down');
    });
    const { container } = render(
      <Embed
        spec={spec}
        apiFetch={apiFetch}
        openLink={vi.fn()}
        assetBase=""
        libraryBase=""
        onOpenStudio={vi.fn()}
      />,
    );
    await waitFor(() => expect(container.querySelector('.dg-embed-error')).not.toBeNull());
    expect(screen.getByText(/network down/)).toBeDefined();
  });

  it('calls onOpenStudio when the corner button is clicked', async () => {
    const apiFetch = vi.fn(async () => new Response(JSON.stringify({ model: twoNodeModel() }), { status: 200 }));
    const onOpenStudio = vi.fn();
    const { container } = render(
      <Embed
        spec={spec}
        apiFetch={apiFetch}
        openLink={vi.fn()}
        assetBase=""
        libraryBase=""
        onOpenStudio={onOpenStudio}
      />,
    );
    await screen.findByText('Alpha');
    const button = container.querySelector('.dg-embed-open');
    expect(button).not.toBeNull();
    (button as HTMLElement).click();
    expect(onOpenStudio).toHaveBeenCalled();
  });
});
