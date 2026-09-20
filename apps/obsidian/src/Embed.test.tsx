// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { model } from '@diagc/core';
import { darkTheme, lightTheme } from '@diagc/renderer';
import { Embed } from './Embed';
import type { EmbedSpec } from './fence';

const twoNodeModel = () => {
  const b = model('demo');
  b.node('a', { name: 'Alpha', type: 'service' });
  b.node('b', { name: 'Beta', type: 'database' });
  return b.toJSON();
};

const styledModel = () => {
  const b = model('demo');
  b.node('a', { name: 'Alpha', type: 'service' });
  b.style('sketch');
  b.notation('git-graph');
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
        theme="light"
      />,
    );
    expect(await screen.findByText('Alpha')).toBeDefined();
    expect(screen.getByText('Beta')).toBeDefined();
    expect(apiFetch).toHaveBeenCalledWith('/api/diagrams/demo');
  });

  it("publishes the theme prop's --dg-* tokens on the embed container, not documentElement", async () => {
    // Scoped to the embed's own root rather than documentElement: the studio
    // pane (App.tsx) applies its own (default dark) theme to documentElement
    // too, and a vault can have both a studio leaf and an embed open at
    // once — whichever mounted last would clobber the other's tokens if both
    // wrote to the shared document root. Custom properties inherit downward,
    // so setting them on this container is sufficient for DiagramView's
    // children to read them, and it leaves documentElement (and thus the
    // studio pane's tokens) untouched.
    document.documentElement.style.removeProperty('--dg-node-stroke');
    const apiFetch = vi.fn(async () => new Response(JSON.stringify({ model: twoNodeModel() }), { status: 200 }));
    const { container } = render(
      <Embed
        spec={spec}
        apiFetch={apiFetch}
        openLink={vi.fn()}
        assetBase=""
        libraryBase=""
        onOpenStudio={vi.fn()}
        theme="light"
      />,
    );
    // The ref only attaches once the loaded branch renders the container div,
    // so wait for the model to actually load before asserting.
    await screen.findByText('Alpha');
    const root = container.querySelector('.dg-embed') as HTMLElement;
    expect(root.style.getPropertyValue('--dg-bg')).toBe(lightTheme.bg);
    expect(document.documentElement.style.getPropertyValue('--dg-bg')).toBe('');
  });

  it('follows the vault scheme: theme="dark" applies the dark tokens and colorMode', async () => {
    // The regression this guards: embeds used to hard-code light mode, so a
    // dark vault got a glaring light card that also disagreed with the studio
    // pane. The host derives the prop from Obsidian's body class (theme.ts).
    const apiFetch = vi.fn(async () => new Response(JSON.stringify({ model: twoNodeModel() }), { status: 200 }));
    const { container } = render(
      <Embed
        spec={spec}
        apiFetch={apiFetch}
        openLink={vi.fn()}
        assetBase=""
        libraryBase=""
        onOpenStudio={vi.fn()}
        theme="dark"
      />,
    );
    await screen.findByText('Alpha');
    const root = container.querySelector('.dg-embed') as HTMLElement;
    expect(root.style.getPropertyValue('--dg-bg')).toBe(darkTheme.bg);
    // colorMode themes React Flow itself — it stamps the mode class on its root
    expect(container.querySelector('.react-flow')?.className).toContain('dark');
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
        theme="light"
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
        theme="light"
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
        theme="light"
      />,
    );
    await screen.findByText('Alpha');
    const button = container.querySelector('.dg-embed-open');
    expect(button).not.toBeNull();
    (button as HTMLElement).click();
    expect(onOpenStudio).toHaveBeenCalled();
  });

  it('passes the loaded model\'s style and notation through to DiagramView', async () => {
    // Mirrors apps/viewer/src/Viewer.tsx: an embed that drops these two
    // structurally mis-renders any diagram authored with a non-default style
    // or a notation profile. `dg-style-<id>`/`dg-style-rough` and
    // `dg-notation-<id>` are the canvas classes DiagramView derives straight
    // from the `styleId`/`notation` props (DiagramView.tsx), so they are a
    // cheap, mock-free way to observe that both actually reached it.
    const apiFetch = vi.fn(async () => new Response(JSON.stringify({ model: styledModel() }), { status: 200 }));
    const { container } = render(
      <Embed
        spec={spec}
        apiFetch={apiFetch}
        openLink={vi.fn()}
        assetBase=""
        libraryBase=""
        onOpenStudio={vi.fn()}
        theme="light"
      />,
    );
    await screen.findByText('Alpha');
    const canvas = container.querySelector('.dg-canvas');
    expect(canvas).not.toBeNull();
    expect(canvas!.className).toContain('dg-style-sketch');
    expect(canvas!.className).toContain('dg-style-rough');
    expect(canvas!.className).toContain('dg-notation-git');
  });
});
