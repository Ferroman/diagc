// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';
import { createIconRegistry } from '@diagramming/icons';
import { createTypeRegistry } from './registry';
import { notationProfile } from './notations';
import { DiagramNode, type DiagramNodeData } from './DiagramNode';
import { stylePreset } from './stylePresets';
import { seedFrom, sketchNode } from './sketch';

// NodeResizer needs live React Flow store internals a bare ReactFlowProvider
// doesn't have under jsdom — same precedent as the EdgeLabelRenderer mock in
// DiagramEdge.test.tsx.
vi.mock('@xyflow/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@xyflow/react')>();
  return {
    ...actual,
    NodeResizer: (p: {
      isVisible?: boolean;
      onResizeEnd?: (e: unknown, params: { x: number; y: number; width: number; height: number }) => void;
    }) =>
      p.isVisible === false ? null : (
        <button
          type="button"
          data-testid="resizer"
          onClick={() => p.onResizeEnd?.(null, { x: 5, y: 7, width: 300, height: 200 })}
        />
      ),
  };
});

function renderNode(
  partial: Partial<DiagramNodeData>,
  selected?: boolean,
  size?: { width: number; height: number },
) {
  const data: DiagramNodeData = {
    label: 'users',
    typeId: 'table',
    state: 'leaf',
    promoted: false,
    sharedMembers: [],
    hiddenCount: 0,
    typeRegistry: createTypeRegistry(),
    icons: createIconRegistry(),
    ...partial,
  };
  return render(
    <ReactFlowProvider>
      <DiagramNode
        id="n1"
        data={data}
        {...(selected !== undefined ? { selected } : {})}
        {...(size ?? {})}
      />
    </ReactFlowProvider>,
  );
}

describe('DiagramNode', () => {
  it('renders label, resolved shape class and icon for a leaf', () => {
    const { container } = renderNode({ icon: 'postgres' });
    expect(screen.getByText('users')).toBeDefined();
    expect(container.querySelector('.dg-shape-cylinder')).not.toBeNull();
    expect(container.querySelector('svg.lucide')).not.toBeNull();
  });

  it('shows hidden count and a fold chip on a collapsed container; the click asks to expand', () => {
    const onToggleExpand = vi.fn();
    renderNode({ state: 'collapsed', typeId: 'system', hiddenCount: 4, onToggleExpand });
    expect(screen.getByText('4')).toBeDefined();
    const chip = screen.getByTestId('fold-chip');
    expect(chip.textContent).toBe('▸');
    expect(chip.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(chip);
    expect(onToggleExpand).toHaveBeenCalledWith('n1', 'expanded');
  });

  it('an open container\'s fold chip asks to collapse, whatever opened it', () => {
    const onToggleExpand = vi.fn();
    renderNode({ state: 'expanded', typeId: 'system', onToggleExpand });
    const chip = screen.getByTestId('fold-chip');
    expect(chip.textContent).toBe('▾');
    fireEvent.click(chip);
    expect(onToggleExpand).toHaveBeenCalledWith('n1', 'collapsed');
  });

  it('marks promoted and shared nodes', () => {
    renderNode({ promoted: true, sharedMembers: ['a', 'b'] });
    expect(screen.getByTestId('promoted-marker')).toBeDefined();
    expect(screen.getByTestId('shared-badge').textContent).toContain('2');
  });

  it('renders an external stub through the normal type-aware path as a ghost (dashed, ↗), not a generic chip', () => {
    const { container } = renderNode({ external: true, typeId: 'table', icon: 'postgres' });
    // same visual as the original entity: cylinder shape class + icon survive
    expect(container.querySelector('.dg-shape-cylinder')).not.toBeNull();
    expect(container.querySelector('svg.lucide')).not.toBeNull();
    // ghost treatment replaces the old generic chip
    expect(container.querySelector('.dg-ghost')).not.toBeNull();
    expect(container.querySelector('.dg-external')).toBeNull();
    expect(container.querySelector('.dg-external-arrow')?.textContent).toContain('↗');
  });

  it('ghosts an external silhouette (shape) node the same way', () => {
    const { container } = renderNode({
      external: true,
      typeId: 'person',
      shape: '/library/shapes/person.svg',
      color: '#42a5f5',
    });
    expect(container.querySelector('.dg-shape-node')).not.toBeNull();
    expect(container.querySelector('.dg-ghost')).not.toBeNull();
    expect(container.querySelector('.dg-external-arrow')?.textContent).toContain('↗');
  });

  it('renders expanded containers as group shells', () => {
    const { container } = renderNode({ state: 'expanded', typeId: 'system', label: 'billing' });
    expect(container.querySelector('.dg-group')).not.toBeNull();
    expect(screen.getByText('billing')).toBeDefined();
  });

  it('shows meta badges on the node', () => {
    renderNode({ metaBadges: ['nestjs', 'typescript'] });
    expect(screen.getByText('nestjs')).toBeDefined();
    expect(screen.getByText('typescript')).toBeDefined();
  });

  it('applies the node accent color to border and background', () => {
    const { container } = renderNode({ color: '#e05d5d' });
    const style = (container.querySelector('.dg-node') as HTMLElement).style;
    // jsdom parses the border color but drops color-mix() backgrounds — the
    // background half is covered by the browser smoke check.
    expect(style.borderColor).toBe('rgb(224, 93, 93)'); // jsdom normalizes hex to rgb
  });

  it('renders an in-place rename input when labelEditing (group header, non-box path)', () => {
    const onLabelCommit = vi.fn();
    renderNode({ state: 'expanded', typeId: 'system', labelEditing: true, onLabelCommit });
    const input = screen.getByLabelText('Rename') as HTMLInputElement;
    expect(input.value).toBe('users');
    fireEvent.change(input, { target: { value: 'accounts' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onLabelCommit).toHaveBeenCalledWith('accounts');
  });

  it('renders the rich label editor in place of the plain label on a box node when labelEditing', () => {
    const onRichCommit = vi.fn();
    const { container } = renderNode({ labelEditing: true, onRichCommit });
    const input = container.querySelector('.dg-rich-input') as HTMLElement;
    expect(input).not.toBeNull();
    expect(screen.queryByLabelText('Rename')).toBeNull();
    input.innerHTML = 'accounts';
    fireEvent.blur(input);
    expect(onRichCommit).toHaveBeenCalledWith([{ text: 'accounts' }]);
  });

  it('exposes a connect handle on each of the four sides (leaf and group)', () => {
    const leaf = renderNode({});
    expect(leaf.container.querySelectorAll('.dg-handle')).toHaveLength(4);
    leaf.unmount();
    const group = renderNode({ state: 'expanded', typeId: 'system' });
    expect(group.container.querySelectorAll('.dg-handle')).toHaveLength(4);
    const positions = [...group.container.querySelectorAll('.dg-handle')].map((h) =>
      ['top', 'right', 'bottom', 'left'].find((p) => h.classList.contains(`react-flow__handle-${p}`)),
    );
    expect(positions.sort()).toEqual(['bottom', 'left', 'right', 'top']);
  });

  it('icon nodes carry no accent fill so the background stays transparent', () => {
    const { container } = renderNode({ image: 'a3f9c2d4e5f6.png', color: '#e05d5d' });
    const node = container.querySelector('.dg-image-node') as HTMLElement;
    expect(node.style.background).toBe('');
    expect(node.style.borderColor).toBe('');
  });

  it('still applies textColor to an icon node (caption tint)', () => {
    const { container } = renderNode({ image: 'a3f9c2d4e5f6.png', textColor: '#e05d5d' });
    const node = container.querySelector('.dg-image-node') as HTMLElement;
    expect(node.style.color).toBe('rgb(224, 93, 93)');
  });

  it('renders an image body with caption instead of the type chrome', () => {
    renderNode({ label: 'logo', image: 'a3f9c2d4e5f6.png', assetBase: '/api/assets/' });
    const img = screen.getByRole('img', { name: 'logo' });
    expect(img.getAttribute('src')).toBe('/api/assets/a3f9c2d4e5f6.png');
    expect(screen.getByText('logo')).toBeDefined(); // caption
    expect(screen.queryByText('table')).toBeNull(); // no type label
  });

  it('shows a link badge on an image-leaf node and reports its click (AWS-icon linking target)', () => {
    const onOpenLink = vi.fn();
    const { container } = renderNode({ image: 'a3f9c2d4e5f6.png', link: '[[Note]]', onOpenLink });
    const badge = container.querySelector('.dg-link-badge');
    expect(badge).not.toBeNull();
    fireEvent.click(badge!);
    expect(onOpenLink).toHaveBeenCalledWith('[[Note]]');
  });

  it('shows the resizer only when resizing is wired and the node is selected', () => {
    const onResize = vi.fn();
    renderNode({ image: 'a3f9c2d4e5f6.png', onResize }, true);
    expect(screen.getByTestId('resizer')).toBeDefined();
    cleanup();
    renderNode({ image: 'a3f9c2d4e5f6.png' }, true); // view mode: no onResize wired
    expect(screen.queryByTestId('resizer')).toBeNull();
  });

  it('hides the resizer when the node is not selected even if resizing is wired', () => {
    const onResize = vi.fn();
    renderNode({ image: 'a3f9c2d4e5f6.png', onResize }); // selected not set
    expect(screen.queryByTestId('resizer')).toBeNull();
  });

  it('reports the final size through onResize when a resize ends', () => {
    const onResize = vi.fn();
    renderNode({ image: 'a3f9c2d4e5f6.png', onResize }, true);
    fireEvent.click(screen.getByTestId('resizer'));
    expect(onResize).toHaveBeenCalledWith('n1', 300, 200, { x: 5, y: 7 });
  });

  it('renders a typeless node as a bare label with no type text or icon', () => {
    const { container } = renderNode({ label: 'Trust', typeId: undefined });
    expect(screen.getByText('Trust')).toBeDefined();
    expect(container.querySelector('.dg-type')).toBeNull();
    expect(container.querySelector('svg.lucide')).toBeNull();
  });

  it('shows a header thumbnail on an expanded container that carries an image', () => {
    const { container } = renderNode({
      state: 'expanded',
      typeId: 'system',
      image: 'a3f9c2d4e5f6.png',
      assetBase: '/api/assets/',
    });
    expect(container.querySelector('.dg-image-thumb')).not.toBeNull();
    expect(container.querySelector('.dg-image-node')).toBeNull(); // not the image-body variant
  });

  it('an outline group type renders a colored border with no tint fill when expanded', () => {
    const registry = createTypeRegistry({ grp: { shape: 'box', outline: true, dashed: true } });
    const { container } = renderNode({ state: 'expanded', typeId: 'grp', color: '#7aa116', typeRegistry: registry });
    const group = container.querySelector('.dg-group') as HTMLElement;
    expect(group.classList.contains('dg-group-outline')).toBe(true);
    expect(group.style.borderColor).toBe('rgb(122, 161, 22)');
    expect(group.style.background).toBe(''); // no accent tint — CSS keeps it transparent
  });

  it('a cornerBadge group renders its image flush at the corner, not in the padded header', () => {
    const registry = createTypeRegistry({ grp: { shape: 'box', outline: true, cornerBadge: true } });
    const { container } = renderNode({
      state: 'expanded',
      typeId: 'grp',
      color: '#7aa116',
      image: '/library/aws-groups/virtual-private-cloud-vpc.svg',
      typeRegistry: registry,
    });
    expect(container.querySelector('.dg-group-corner')).not.toBeNull();
    const badge = container.querySelector('.dg-corner-badge') as HTMLImageElement;
    expect(badge.getAttribute('src')).toBe('/library/aws-groups/virtual-private-cloud-vpc.svg');
    expect(container.querySelector('.dg-image-thumb')).toBeNull(); // replaces the header thumb
  });

  it('a leaf of a cornerBadge type keeps the typed-box look instead of the image body', () => {
    const registry = createTypeRegistry({ grp: { shape: 'box', outline: true, cornerBadge: true } });
    const { container } = renderNode({
      label: 'VPC',
      typeId: 'grp',
      image: '/library/aws-groups/virtual-private-cloud-vpc.svg',
      typeRegistry: registry,
    });
    expect(container.querySelector('.dg-image-node')).toBeNull();
    expect(container.querySelector('.dg-image-thumb')).not.toBeNull(); // inline thumb in the box row
    expect(screen.getByText('VPC')).toBeDefined();
  });

  it('renders a rough sketch shape behind the node in sketch mode', () => {
    const { container } = renderNode(
      { label: 'orders', stylePreset: stylePreset('sketch') },
      undefined,
      { width: 160, height: 80 },
    );
    const svg = container.querySelector('svg.dg-sketch-shape');
    expect(svg).not.toBeNull();
    const stroke = svg!.querySelector('.dg-sketch-stroke') as SVGPathElement | null;
    expect((stroke?.getAttribute('d') ?? '').length).toBeGreaterThan(0);
    expect(screen.getByText('orders')).toBeDefined();
  });

  it('renders a comment as a bubble, crisp and sketched, with the tail hanging below the box', () => {
    const crisp = renderNode({ label: 'legacy', typeId: 'comment' }, undefined, { width: 160, height: 80 });
    expect(crisp.container.querySelector('.dg-shape-bubble')).not.toBeNull();
    cleanup();
    const { container } = renderNode(
      { label: 'legacy', typeId: 'comment', stylePreset: stylePreset('sketch') },
      undefined,
      { width: 160, height: 80 },
    );
    expect(container.querySelector('.dg-shape-bubble')).not.toBeNull();
    const d = container.querySelector('svg.dg-sketch-shape .dg-sketch-stroke')?.getAttribute('d') ?? '';
    const ys = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number).filter((_n, i) => i % 2 === 1);
    expect(Math.max(...ys)).toBeGreaterThan(86); // a plain box would stop at ~80
  });

  it('renders no sketch shape in clean mode', () => {
    const { container } = renderNode({ label: 'orders' }, undefined, { width: 160, height: 80 });
    expect(container.querySelector('svg.dg-sketch-shape')).toBeNull();
  });

  it('renders no sketch shape for a preset without rough params', () => {
    const { container } = renderNode(
      { label: 'orders', stylePreset: stylePreset('blueprint') },
      undefined,
      { width: 160, height: 80 },
    );
    expect(container.querySelector('.dg-sketch-shape')).toBeNull();
  });

  it('renders hatch fill lines for a hachure preset', () => {
    const { container } = renderNode(
      { label: 'orders', stylePreset: stylePreset('hand-drawn') },
      undefined,
      { width: 160, height: 80 },
    );
    expect(container.querySelector('.dg-sketch-hatch')).not.toBeNull();
  });

  it('drops the inline accent chrome on a colored node in sketch mode (the rough shape carries color instead)', () => {
    const { container } = renderNode(
      { label: 'orders', color: '#e05d5d', stylePreset: stylePreset('sketch') },
      undefined,
      { width: 160, height: 80 },
    );
    const node = container.querySelector('.dg-node');
    expect(node?.getAttribute('style') ?? '').not.toContain('background');
    expect(container.querySelector('svg.dg-sketch-shape')).not.toBeNull();
  });

  it('renders a typeless leaf under the CLD notation as borderless text, even in sketch mode', () => {
    const { container } = renderNode(
      { label: 'Trust', typeId: undefined, notation: 'causal-loop', stylePreset: stylePreset('sketch') },
      undefined,
      { width: 160, height: 80 },
    );
    expect(screen.getByText('Trust')).toBeDefined();
    expect(container.querySelector('.dg-text-node')).not.toBeNull();
    expect(container.querySelector('.dg-shape-box')).toBeNull();
    expect(container.querySelector('svg.dg-sketch-shape')).toBeNull();
  });

  it('stays borderless for a colored typeless CLD node (no accent box)', () => {
    const { container } = renderNode(
      { label: 'Trust', typeId: undefined, notation: 'causal-loop', color: '#e05d5d' },
      undefined,
      { width: 140, height: 48 },
    );
    const node = container.querySelector('.dg-text-node') as HTMLElement | null;
    expect(node).not.toBeNull();
    // accentStyle must not apply an inline border/background that would beat the
    // .dg-text-node transparent rule (same gating as sketch mode)
    const style = node?.getAttribute('style') ?? '';
    expect(style).not.toContain('background');
    expect(style).not.toContain('border-color');
  });

  it('keeps the normal shape box for a typed node under the CLD notation', () => {
    const { container } = renderNode({ label: 'Trust', typeId: 'table', notation: 'causal-loop' });
    expect(container.querySelector('.dg-shape-cylinder')).not.toBeNull();
    expect(container.querySelector('.dg-text-node')).toBeNull();
  });

  it('renders a collapsed typeless container as a plain CLD variable (not a box)', () => {
    const { container } = renderNode({
      label: 'dev work time',
      typeId: undefined,
      notation: 'causal-loop',
      state: 'collapsed',
      hiddenCount: 2,
    });
    expect(container.querySelector('.dg-text-node')).not.toBeNull();
    expect(container.querySelector('.dg-shape-box')).toBeNull();
    expect(container.querySelector('.dg-count')).toBeNull(); // count dropped for CLD groups
    expect(container.querySelector('.dg-disclose')?.textContent).toBe('▸'); // collapsed = expand symbol
  });

  it('a collapsed CLD group has only the disclosure toggle (no pin/enter chips)', () => {
    const { container } = renderNode({
      label: 'dev work time',
      typeId: undefined,
      notation: 'causal-loop',
      state: 'collapsed',
      hiddenCount: 2,
      onEnterNode: () => {},
    });
    expect(container.querySelector('.dg-disclose')?.textContent).toBe('▸');
    expect(container.querySelector('[data-testid="fold-chip"]')).toBeNull();
    expect(container.querySelector('[data-testid="enter-chip"]')).toBeNull();
  });

  it('the disclosure toggle expands via onToggleExpand', () => {
    const onToggleExpand = vi.fn();
    const { container } = renderNode({
      label: 'dev work time', typeId: undefined, notation: 'causal-loop', state: 'collapsed', onToggleExpand,
    });
    fireEvent.click(container.querySelector('.dg-disclose')!);
    expect(onToggleExpand).toHaveBeenCalled();
  });

  it('an expanded CLD group renders a name tag and no group box', () => {
    const { container } = renderNode({
      label: 'dev work time', typeId: undefined, notation: 'causal-loop', state: 'expanded',
    });
    expect(container.querySelector('.dg-group')).toBeNull(); // no bordered box
    expect(container.querySelector('.dg-group-tag')?.textContent).toContain('dev work time');
    expect(container.querySelector('.dg-disclose')?.textContent).toBe('▾'); // expanded = collapse symbol
  });

  it('a typed (non-CLD) expanded container still renders the group box', () => {
    const { container } = renderNode({ label: 'svc', typeId: 'system', state: 'expanded' });
    expect(container.querySelector('.dg-group')).not.toBeNull();
    expect(container.querySelector('.dg-group-tag')).toBeNull();
  });

  it('renders a bundled (absolute) image ref un-prefixed by assetBase', () => {
    const { container } = renderNode({ label: 'Lambda', image: '/library/aws/lambda.svg', assetBase: '/api/assets/' });
    const img = container.querySelector('.dg-image') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('/library/aws/lambda.svg');
  });

  it('still prefixes a bare asset ref with assetBase', () => {
    const { container } = renderNode({ label: 'logo', image: 'a3f9c2d4e5f6.png', assetBase: '/api/assets/' });
    const img = container.querySelector('.dg-image') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('/api/assets/a3f9c2d4e5f6.png');
  });

  it('leaves an image node unaffected by the CLD notation', () => {
    const { container } = renderNode({
      label: 'logo',
      image: 'a3f9c2d4e5f6.png',
      assetBase: '/api/assets/',
      notation: 'causal-loop',
    });
    expect(container.querySelector('.dg-image-node')).not.toBeNull();
    expect(container.querySelector('.dg-text-node')).toBeNull();
  });

  it('shows the type-style label and an outline (colored border + text, no fill) for a C4 box type', () => {
    const { container } = renderNode({ label: 'Web App', typeId: 'c4-system', color: '#1168bd' });
    expect(container.querySelector('.dg-type')?.textContent).toBe('[Software System]');
    const box = container.querySelector('.dg-node') as HTMLElement;
    expect(box.className).toContain('dg-c4-outline');
    expect(box.style.color).not.toBe(''); // colored text
    expect(box.style.borderColor).not.toBe(''); // colored border
    expect(box.style.background).toBe(''); // no fill (not the solid bg, not the color-mix tint)
    expect(box.className).not.toContain('dg-solid'); // outline, not solid
  });

  it('composes the technology into the type subtitle', () => {
    const { container } = renderNode({ label: 'API', typeId: 'c4-container', technology: 'Java/Spring' });
    expect(container.querySelector('.dg-type')?.textContent).toBe('[Container: Java/Spring]');
  });

  it('lets an explicit textColor override the label color, independent of the accent', () => {
    // C4 outline box: border keeps the accent, text takes textColor
    const box = renderNode({ label: 'Web App', typeId: 'c4-system', color: '#1168bd', textColor: '#ff8800' }).container.querySelector('.dg-node') as HTMLElement;
    expect(box.style.color).not.toBe('');
    expect(box.style.color).not.toBe(box.style.borderColor); // text differs from the border/accent
    // shape node: the label span carries the text color
    const label = renderNode({ label: 'Actor', typeId: 'c4-person', color: '#08427b', shape: '/library/shapes/person.svg', textColor: '#ff8800' }).container.querySelector('.dg-shape-label') as HTMLElement;
    expect(label.style.color).not.toBe('');
    expect(label.style.color).not.toBe('rgb(8, 66, 123)'); // not the shape color (#08427b)
  });

  it('a TypeStyle fill paints a solid body with legible text when the node has no accent', () => {
    const typeRegistry = createTypeRegistry({
      'c4-system': { shape: 'box', fill: '#1168bd', textOn: '#ffffff' },
    });
    const { container } = renderNode({ label: 'Web App', typeId: 'c4-system', typeRegistry });
    const box = container.querySelector('.dg-node') as HTMLElement;
    expect(box.style.background).toBe('rgb(17, 104, 189)'); // jsdom normalizes hex to rgb
    expect(box.style.borderColor).toBe('rgb(17, 104, 189)');
    expect(box.style.color).toBe('rgb(255, 255, 255)');
    expect(box.className).toContain('dg-solid');

    // rough/sketch mode deliberately omits the inline solid style (the rough
    // shape carries the fill instead) — the class must not survive either, or
    // the subtitle flips from muted to inherited full-opacity text with no
    // solid fill behind it (styles.css `.dg-solid .dg-type { color: inherit }`)
    const rough = renderNode({
      label: 'Web App',
      typeId: 'c4-system',
      typeRegistry,
      stylePreset: stylePreset('sketch'),
    }).container.querySelector('.dg-node') as HTMLElement;
    expect(rough.style.background).toBe('');
    expect(rough.className).not.toContain('dg-solid');
  });

  it('an explicit node color still beats the TypeStyle fill', () => {
    const typeRegistry = createTypeRegistry({
      'c4-system': { shape: 'box', fill: '#1168bd', textOn: '#ffffff' },
    });
    const { container } = renderNode({ label: 'Web App', typeId: 'c4-system', typeRegistry, color: '#ff0000' });
    const box = container.querySelector('.dg-node') as HTMLElement;
    expect(box.style.borderColor).toBe('rgb(255, 0, 0)'); // the accent color, not the registry fill
    // the accent path's color-mix() background, not the solid registry fill
    expect(box.style.background).not.toBe('rgb(17, 104, 189)');
  });

  it('the c4 notation profile paints a c4-system leaf with the solid C4 blue (profile → registry → solid look)', () => {
    const typeRegistry = createTypeRegistry(notationProfile('c4').typeStyles);
    const { container } = renderNode({ label: 'Web App', typeId: 'c4-system', typeRegistry });
    const box = container.querySelector('.dg-node') as HTMLElement;
    expect(box.style.background).toBe('rgb(17, 104, 189)'); // #1168bd, jsdom normalizes hex to rgb
  });

  it('renders a shape node as a masked silhouette with the label, not an image', () => {
    const { container } = renderNode({
      label: 'Actor',
      typeId: 'c4-person',
      color: '#08427b',
      shape: '/library/shapes/person.svg',
      image: 'a3f9c2d4e5f6.png', // present too: shape must win
    });
    const fill = container.querySelector('.dg-shape-fill') as HTMLElement;
    expect(fill).not.toBeNull();
    expect(fill.style.maskImage || fill.style.getPropertyValue('-webkit-mask-image')).toContain('/library/shapes/person.svg');
    expect(container.querySelector('img.dg-image')).toBeNull(); // shape precedence
    expect(container.querySelector('.dg-shape-label')?.textContent).toContain('Actor');
    expect(container.querySelector('.dg-type')?.textContent).toBe('[Person]');
  });

  it('shows a link badge on a shape (silhouette) node and reports its click', () => {
    const onOpenLink = vi.fn();
    const { container } = renderNode({
      label: 'Actor',
      typeId: 'c4-person',
      shape: '/library/shapes/person.svg',
      link: 'https://x.test',
      onOpenLink,
    });
    const badge = container.querySelector('.dg-link-badge');
    expect(badge).not.toBeNull();
    fireEvent.click(badge!);
    expect(onOpenLink).toHaveBeenCalledWith('https://x.test');
  });

  it('composes the technology into the type subtitle on the shape (silhouette) path', () => {
    const { container } = renderNode({
      label: 'Actor',
      typeId: 'c4-person',
      shape: '/library/shapes/person.svg',
      technology: 'Go',
    });
    expect(container.querySelector('.dg-type')?.textContent).toBe('[Person: Go]');
  });

  it('prefixes a bare shape ref with assetBase in the mask', () => {
    const { container } = renderNode({ label: 'S', shape: 'abc123.svg', assetBase: '/api/assets/' });
    const fill = container.querySelector('.dg-shape-fill') as HTMLElement;
    const mask = fill.style.maskImage || fill.style.getPropertyValue('-webkit-mask-image');
    expect(mask).toContain('/api/assets/abc123.svg');
  });

  it('resolves /library/ refs against libraryBase when set', () => {
    const { container } = renderNode({ label: 'S', shape: '/library/aws/ec2.svg', libraryBase: 'app://x/lib/' });
    const fill = container.querySelector('.dg-shape-fill') as HTMLElement;
    const mask = fill.style.maskImage || fill.style.getPropertyValue('-webkit-mask-image');
    expect(mask).toContain('app://x/lib/aws/ec2.svg');
    cleanup();

    // absent libraryBase: today's behavior, byte-for-byte — the /library/ ref passes through verbatim
    const { container: containerNoBase } = renderNode({ label: 'S', shape: '/library/aws/ec2.svg' });
    const fillNoBase = containerNoBase.querySelector('.dg-shape-fill') as HTMLElement;
    const maskNoBase = fillNoBase.style.maskImage || fillNoBase.style.getPropertyValue('-webkit-mask-image');
    expect(maskNoBase).toContain('/library/aws/ec2.svg');
  });

  it('renders rich runs as bold/italic spans on a box', () => {
    const { container } = renderNode({
      typeId: undefined, label: 'Web Server',
      rich: [{ text: 'Web ' }, { text: 'Server', bold: true }],
    });
    expect(container.querySelector('.dg-label b')?.textContent).toBe('Server');
  });
  it('applies align and font-scale to a box label', () => {
    const { container } = renderNode({ typeId: undefined, label: 'a', textAlign: 'center', fontScale: 'lg' });
    const label = container.querySelector('.dg-label') as HTMLElement;
    expect(label.style.textAlign).toBe('center');
    expect(container.querySelector('.dg-fs-lg')).toBeTruthy();
  });
  it('renders plain name when no rich is present (unchanged)', () => {
    const { container } = renderNode({ typeId: undefined, label: 'Plain' });
    expect(container.querySelector('.dg-label')?.textContent).toBe('Plain');
    expect(container.querySelector('.dg-label b')).toBeNull();
  });

  it('renders a link badge only for linked nodes and reports clicks', () => {
    const onOpenLink = vi.fn();
    const outerClick = vi.fn();
    // The badge's own container click handler stands in for "the node's
    // selection mechanism" (real usage: react-flow's onNodeClick, which lives
    // above DiagramNode and isn't reachable from here) — stopPropagation on
    // the badge must keep this outer handler from firing.
    const { container } = render(
      <div onClick={outerClick}>
        <ReactFlowProvider>
          <DiagramNode
            id="n1"
            data={{
              label: 'users',
              typeId: 'table',
              state: 'leaf',
              promoted: false,
              sharedMembers: [],
              hiddenCount: 0,
              typeRegistry: createTypeRegistry(),
              icons: createIconRegistry(),
              link: '[[Note]]',
              onOpenLink,
            }}
          />
        </ReactFlowProvider>
      </div>,
    );
    const badge = container.querySelector('.dg-link-badge');
    expect(badge).not.toBeNull();
    fireEvent.click(badge!);
    expect(onOpenLink).toHaveBeenCalledTimes(1);
    expect(onOpenLink).toHaveBeenCalledWith('[[Note]]');
    expect(outerClick).not.toHaveBeenCalled();
    cleanup();

    // no onOpenLink host callback: an http(s) link falls back to window.open
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { container: fallback } = renderNode({ link: 'https://x.test' });
    fireEvent.click(fallback.querySelector('.dg-link-badge')!);
    expect(openSpy).toHaveBeenCalledWith('https://x.test', '_blank', 'noopener');
    openSpy.mockRestore();
    cleanup();

    // a node without a link renders no badge at all
    const { container: noLink } = renderNode({});
    expect(noLink.querySelector('.dg-link-badge')).toBeNull();
  });

  it('a person-shaped type carries the dg-shape-person class', () => {
    const typeRegistry = createTypeRegistry({ 'c4-person': { shape: 'person', label: '[Person]' } });
    const { container } = renderNode({ label: 'Customer', typeId: 'c4-person', typeRegistry });
    expect(container.querySelector('.dg-shape-person')).not.toBeNull();
  });
});

describe('activity diagram nodes', () => {
  it.each([
    ['activity-action', 'dg-shape-rounded'],
    ['activity-decision', 'dg-shape-diamond'],
    ['activity-bar', 'dg-shape-bar'],
    ['activity-start', 'dg-shape-start-dot'],
    ['activity-end', 'dg-shape-end-bullseye'],
    ['activity-send', 'dg-shape-send-signal'],
    ['activity-receive', 'dg-shape-receive-signal'],
    ['activity-note', 'dg-shape-note'],
  ])('renders %s with class %s', (type, cls) => {
    const { container } = renderNode({ typeId: type }, undefined, { width: 80, height: 64 });
    expect(container.querySelector(`.${cls}`)).not.toBeNull();
  });

  it('renders no type subtitle on a UML glyph — the registry label is empty, not absent', () => {
    const { container } = renderNode({ typeId: 'activity-action', label: 'Fill order' }, undefined, { width: 120, height: 44 });
    expect(screen.getByText('Fill order')).toBeDefined();
    expect(container.querySelector('.dg-type')).toBeNull();
  });

  it('ignores node.color on a bar glyph — UML draws it in the fixed neutral stroke', () => {
    const { container } = renderNode({ typeId: 'activity-bar', color: '#ff0000' }, undefined, { width: 8, height: 100 });
    const bar = container.querySelector('.dg-shape-bar') as HTMLElement;
    expect(bar).not.toBeNull();
    expect(bar.style.background).toBe('');
    expect(bar.style.borderColor).toBe('');
  });

  it('renders activity-decision in rough mode with a sketch shape svg', () => {
    const { container } = renderNode(
      { typeId: 'activity-decision', stylePreset: stylePreset('sketch') },
      undefined,
      { width: 48, height: 48 },
    );
    const svg = container.querySelector('svg.dg-sketch-shape');
    expect(svg).not.toBeNull();
    // Presence alone is vacuous because the box fallback also renders the svg;
    // the path identity is what proves the mapping.
    const renderedPath = svg!.querySelector('.dg-sketch-stroke')?.getAttribute('d') ?? '';
    const rough = stylePreset('sketch').rough!;
    const diamondPath = sketchNode('diamond', 48, 48, seedFrom('n1'), rough, 0).stroke;
    const boxPath = sketchNode('box', 48, 48, seedFrom('n1'), rough, 0).stroke;
    expect(renderedPath).toBe(diamondPath);
    expect(renderedPath).not.toBe(boxPath);
  });
});

describe('activity container chrome', () => {
  it('renders an activity lane as a chrome band even when leaf (empty lane)', () => {
    const { container } = renderNode({ typeId: 'activity-lane', label: 'Orders', state: 'leaf' });
    expect(container.querySelector('.dg-activity-lane')).not.toBeNull();
    expect(container.querySelector('.dg-node')).toBeNull();
    expect(screen.queryByTestId('enter-chip')).toBeNull();
    expect(screen.queryByTestId('fold-chip')).toBeNull();
    const strip = container.querySelector('.dg-activity-strip');
    expect(strip).not.toBeNull();
    expect(strip!.querySelector('.dg-activity-name')?.textContent).toBe('Orders');
  });

  it('renders the frame with its rotated title strip', () => {
    const { container } = renderNode({ typeId: 'activity-frame', label: 'Checkout', state: 'expanded' });
    expect(container.querySelector('.dg-activity-frame')).not.toBeNull();
    expect(container.querySelector('.dg-node')).toBeNull();
    expect(screen.queryByTestId('enter-chip')).toBeNull();
    expect(screen.queryByTestId('fold-chip')).toBeNull();
    const strip = container.querySelector('.dg-activity-strip');
    expect(strip).not.toBeNull();
    expect(strip!.querySelector('.dg-activity-name')?.textContent).toBe('Checkout');
  });

  it('renders a region with its name, without fold chrome', () => {
    const { container } = renderNode({ typeId: 'activity-region', label: 'Fulfillment', state: 'expanded' });
    expect(container.querySelector('.dg-activity-region')).not.toBeNull();
    expect(container.querySelector('.dg-node')).toBeNull();
    expect(container.querySelector('.dg-activity-region-name')?.textContent).toBe('Fulfillment');
    expect(screen.queryByTestId('enter-chip')).toBeNull();
    expect(screen.queryByTestId('fold-chip')).toBeNull();
    expect(screen.queryByTestId('disclose-chip')).toBeNull();
  });

  it('a region with no label renders no name span', () => {
    const { container } = renderNode({ typeId: 'activity-region', label: '', state: 'leaf' });
    expect(container.querySelector('.dg-activity-region')).not.toBeNull();
    expect(container.querySelector('.dg-activity-region-name')).toBeNull();
  });

  it('a lane color reaches the band via the --dg-act-accent custom property', () => {
    const { container } = renderNode({ typeId: 'activity-lane', label: 'Orders', state: 'leaf', color: '#7ba7d9' });
    const band = container.querySelector('.dg-activity-lane') as HTMLElement;
    expect(band.style.getPropertyValue('--dg-act-accent')).toBe('#7ba7d9');
  });

  it('a lane without color sets no --dg-act-accent property', () => {
    const { container } = renderNode({ typeId: 'activity-lane', label: 'Orders', state: 'leaf' });
    const band = container.querySelector('.dg-activity-lane') as HTMLElement;
    expect(band.style.getPropertyValue('--dg-act-accent')).toBe('');
  });
});

describe('git graph nodes', () => {
  const gitTypes = createTypeRegistry({ commit: { shape: 'circle' }, branch: { shape: 'box' } });
  const base = (over: Partial<DiagramNodeData>): DiagramNodeData => ({
    label: '',
    state: 'leaf',
    promoted: false,
    sharedMembers: [],
    hiddenCount: 0,
    typeRegistry: gitTypes,
    icons: createIconRegistry(),
    notation: 'git-graph',
    ...over,
  });

  it('a commit is a circle with its tag above, coloured like its lane', () => {
    const { container } = renderNode(base({ typeId: 'commit', label: '1.0', color: '#7ba7d9' }));
    const circle = container.querySelector('.dg-node.dg-circle-node') as HTMLElement;
    expect(circle).not.toBeNull();
    expect(circle.style.borderColor).toBe('rgb(123, 167, 217)'); // jsdom normalizes hex to rgb (#7ba7d9)
    const tag = container.querySelector('.dg-commit-tag') as HTMLElement;
    expect(tag.textContent).toBe('1.0');
    expect(tag.style.color).toBe('rgb(123, 167, 217)');
    expect(container.querySelector('.dg-type')).toBeNull();
  });

  it('shows a link badge on a commit circle too (its own early-return container, not the default box)', () => {
    const onOpenLink = vi.fn();
    const { container } = renderNode(base({ typeId: 'commit', label: '1.0', link: '[[Note]]', onOpenLink }));
    const badge = container.querySelector('.dg-link-badge');
    expect(badge).not.toBeNull();
    fireEvent.click(badge!);
    expect(onOpenLink).toHaveBeenCalledWith('[[Note]]');
  });

  it('an untagged commit draws no tag', () => {
    const { container } = renderNode(base({ typeId: 'commit', label: '' }));
    expect(container.querySelector('.dg-commit-tag')).toBeNull();
  });

  it('a lane is a transparent band with its name boxed at the right and no group chrome', () => {
    const { container } = renderNode(base({ typeId: 'branch', label: 'Master', state: 'expanded', color: '#7ba7d9', onEnterNode: () => {} }));
    expect(container.querySelector('.dg-lane')).not.toBeNull();
    const label = container.querySelector('.dg-lane-label') as HTMLElement;
    expect(label.textContent).toBe('Master');
    expect(label.style.borderColor).toBe('rgb(123, 167, 217)'); // jsdom normalizes hex to rgb (#7ba7d9)
    expect(container.querySelector('.dg-group-header')).toBeNull();
    expect(screen.queryByLabelText('Enter node')).toBeNull();
    expect(screen.queryByTestId('disclose-chip')).toBeNull();
  });

  it('an empty lane (leaf state, no commits yet) still renders as a band, not a leaf box', () => {
    const { container } = renderNode(base({ typeId: 'branch', label: 'Master', state: 'leaf', color: '#7ba7d9' }));
    expect(container.querySelector('.dg-lane')).not.toBeNull();
    const label = container.querySelector('.dg-lane-label') as HTMLElement;
    expect(label.textContent).toBe('Master');
    expect(container.querySelector('.dg-node')).toBeNull();
    expect(container.querySelector('.dg-group')).toBeNull();
  });

  it('a git stage is a titled frame, not a box: no icon, subtitle or fold chrome', () => {
    const { container } = renderNode(base({ typeId: 'git-stage', label: 'Release candidates', state: 'leaf', color: '#e0a030' }));
    const frame = container.querySelector('.dg-git-stage') as HTMLElement;
    expect(frame).not.toBeNull();
    expect(frame.style.getPropertyValue('--dg-stage')).toBe('#e0a030');
    expect(container.querySelector('.dg-git-stage-name')?.textContent).toBe('Release candidates');
    expect(container.querySelector('.dg-node')).toBeNull();
    expect(container.querySelector('.dg-type')).toBeNull();
    expect(screen.queryByTestId('fold-chip')).toBeNull();
  });

  it('outside the git notation a branch-typed container is an ordinary group', () => {
    const { container } = renderNode({ ...base({ typeId: 'branch', label: 'Master', state: 'expanded' }), notation: undefined });
    expect(container.querySelector('.dg-lane')).toBeNull();
    expect(container.querySelector('.dg-group')).not.toBeNull();
  });
});

describe('fishbone looks', () => {
  it('draws the effect as a spine with the head box at its right end', () => {
    const { container } = renderNode({ label: 'Late deliveries', typeId: 'fb-effect', notation: 'fishbone' });
    const head = container.querySelector('.dg-fb-head');
    expect(head).not.toBeNull();
    expect(head?.querySelector('.dg-fb-spine')).not.toBeNull();
    expect(head?.querySelector('.dg-fb-head-box')?.textContent).toBe('Late deliveries');
    expect(container.querySelector('.dg-node')).toBeNull();
  });
  it('draws a cause as bare text, tinted by textColor only', () => {
    const { container } = renderNode({ label: 'No checklist', typeId: 'fb-cause', notation: 'fishbone', color: '#abc', textColor: '#123' });
    const el = container.querySelector('.dg-fb-cause') as HTMLElement;
    expect(el.textContent).toBe('No checklist');
    expect(el.style.color).toBe('rgb(17, 34, 51)'); // jsdom normalizes hex to rgb (#123)
    expect(el.style.borderColor).toBe('');
    expect(container.querySelector('.dg-node')).toBeNull();
  });
  it('keeps a category on the ordinary box path', () => {
    const { container } = renderNode({ label: 'Method', typeId: 'fb-category', notation: 'fishbone' });
    expect(container.querySelector('.dg-node')).not.toBeNull();
    expect(container.querySelector('.dg-fb-cause')).toBeNull();
  });
});
