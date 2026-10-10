// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { model } from '@diagc/core/internal';
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

/** a relation on the `ops` layer, which the `main` plane turns on by default, and
 * an untagged one, which always shows */
const presetModel = () => {
  const b = model('demo');
  b.layer('ops', { name: 'Ops' });
  b.plane('main', { name: 'Main', layers: ['ops'] });
  const a = b.node('a', { name: 'Alpha', type: 'service' });
  const c = b.node('c', { name: 'Gamma', type: 'service' });
  b.relate(a, c, { kind: 'sync', layer: 'ops', label: 'pages on-call' });
  b.relate(c, a, { kind: 'sync', label: 'calls back' });
  return b.toJSON();
};

/** two planes, each turning on its own layer by default */
const twoPresetModel = () => {
  const b = model('demo');
  b.layer('ops', { name: 'Ops' });
  b.layer('audit', { name: 'Audit' });
  b.plane('main', { name: 'Main', layers: ['ops'] });
  b.plane('review', { name: 'Review', layers: ['audit'] });
  const a = b.node('a', { name: 'Alpha', type: 'service' });
  const c = b.node('c', { name: 'Gamma', type: 'service' });
  b.relate(a, c, { kind: 'sync', layer: 'ops', label: 'pages on-call' });
  b.relate(c, a, { kind: 'sync', layer: 'audit', label: 'logs access' });
  return b.toJSON();
};

/** a container holding one service, on the model's only plane */
const containedModel = () => {
  const b = model('demo');
  b.plane('main', { name: 'Main' });
  b.node('sys', { name: 'Shop', type: 'system' }).contains(b.node('a', { name: 'Alpha', type: 'service' }));
  return b.toJSON();
};

const planModel = () => {
  const b = model('demo');
  const p = b.plan();
  p.zone('q', { name: 'Q1', start: '2026-01-05', end: '2026-01-30' });
  return b.toJSON();
};

const spec: EmbedSpec = { name: 'demo', height: 300 };

const embedOf = (body: unknown, over: Partial<EmbedSpec> = {}) => (
  <Embed
    spec={{ ...spec, ...over }}
    apiFetch={vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }))}
    openLink={vi.fn()}
    assetBase=""
    libraryBase=""
    onOpenStudio={vi.fn()}
    theme="light"
  />
);

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

  it("passes the loaded model's style and notation through to DiagramView", async () => {
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

describe('Embed opens the way the published page does', () => {
  it("turns on the plane's preset layers when the fence names none", async () => {
    render(embedOf({ model: presetModel() }));
    expect(await screen.findByText('pages on-call')).toBeDefined();
  });

  it("keeps the fence's own layers when it names them", async () => {
    render(embedOf({ model: presetModel() }, { layers: [] }));
    // the untagged relation is drawn, so the edges are in; the tagged one is not
    await screen.findByText('calls back');
    expect(screen.queryByText('pages on-call')).toBeNull();
  });

  it("turns on the named plane's own preset layers", async () => {
    render(embedOf({ model: twoPresetModel() }, { plane: 'review' }));
    expect(await screen.findByText('logs access')).toBeDefined();
    expect(screen.queryByText('pages on-call')).toBeNull();
  });

  it('opens the default plane when the fence names one the model lacks', async () => {
    render(embedOf({ model: containedModel() }, { plane: 'nope' }));
    expect(await screen.findByText('Shop')).toBeDefined();
    // the default plane's containment holds: the box rests folded, its child inside
    expect(screen.queryByText('Alpha')).toBeNull();
  });

  it("draws the plan's today line at the reader's date", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 0, 20));
    try {
      const { container } = render(embedOf({ model: planModel() }));
      await waitFor(() => expect(container.querySelector('.dg-time-axis-today')).not.toBeNull());
    } finally {
      vi.useRealTimers();
    }
  });
});
