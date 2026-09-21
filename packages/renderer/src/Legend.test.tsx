// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createIconRegistry } from '@diagc/icons';
import { Legend } from './Legend';
import type { LegendRow } from './legendRows';
import type { KindStyle, ShapeId } from './registry';

const rows: LegendRow[] = [
  { id: 'layers:flow', section: 'layers', label: 'Data flow', layer: 'flow', active: false, swatch: { draw: 'chip', color: '#0ea5e9' } },
  { id: 'kinds:async', section: 'kinds', label: 'async', swatch: { draw: 'line', style: { dashed: true } } },
  { id: 'items:0', section: 'items', label: 'Owned by Payments', swatch: { draw: 'chip', color: '#f59e0b' } },
];

describe('Legend', () => {
  it('renders a row per entry under section headings', () => {
    render(<Legend rows={rows} interactive />);
    expect(screen.getByText('Data flow')).toBeTruthy();
    expect(screen.getByText('async')).toBeTruthy();
    expect(screen.getByText('Owned by Payments')).toBeTruthy();
    expect(screen.getByText('Layers')).toBeTruthy();
    expect(screen.getByText('Connections')).toBeTruthy();
  });

  it('uses the given title, defaulting to Legend', () => {
    const { rerender } = render(<Legend rows={rows} interactive />);
    expect(screen.getByText('Legend')).toBeTruthy();
    rerender(<Legend rows={rows} title="Key" interactive />);
    expect(screen.getByText('Key')).toBeTruthy();
  });

  it('toggles a layer when its row is clicked', () => {
    const onToggleLayer = vi.fn();
    render(<Legend rows={rows} interactive onToggleLayer={onToggleLayer} />);
    const btn = screen.getByRole('button', { name: 'Data flow' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(btn);
    expect(onToggleLayer).toHaveBeenCalledWith('flow');
  });

  it('renders no buttons when not interactive', () => {
    render(<Legend rows={rows} interactive={false} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByText('Data flow')).toBeTruthy();
  });

  it('renders a layer row as a plain element when no handler can answer a click', () => {
    // A published page passes no onToggleLayer. A focusable `aria-pressed`
    // button whose click does nothing is a lie to keyboard and screen-reader
    // users alike, so the row must be inert markup instead.
    const { container } = render(<Legend rows={rows} interactive />);
    expect(screen.queryByRole('button', { name: 'Data flow' })).toBeNull();
    const row = [...container.querySelectorAll('.dg-legend-row')].find(
      (el) => el.textContent === 'Data flow',
    );
    expect(row?.tagName.toLowerCase()).toBe('div');
    // still greyed, so a caller that does show inactive rows reads them as off
    expect(row?.classList.contains('dg-legend-off')).toBe(true);
  });

  it('collapses to the header when the chevron is clicked', () => {
    render(<Legend rows={rows} interactive />);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse legend' }));
    expect(screen.queryByText('async')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Expand legend' }));
    expect(screen.getByText('async')).toBeTruthy();
  });

  it('renders nothing for an empty row list', () => {
    const { container } = render(<Legend rows={[]} interactive />);
    expect(container.querySelector('.dg-legend')).toBeNull();
  });

  it('renders shape swatches for the default box shape and a non-default shape', () => {
    const shapeRows: LegendRow[] = [
      { id: 'types:service', section: 'types', label: 'Service', swatch: { draw: 'shape', style: { shape: 'box' } } },
      { id: 'types:database', section: 'types', label: 'Database', swatch: { draw: 'shape', style: { shape: 'cylinder' } } },
    ];
    const { container } = render(<Legend rows={shapeRows} interactive />);
    // A shape swatch is a span (so an icon can be overlaid) wrapping the svg.
    const svgs = container.querySelectorAll('span.dg-legend-shape > svg');
    expect(svgs).toHaveLength(2);

    // default ('box') branch: a single rect with rx="2", no ellipse
    const boxSvg = svgs[0]!;
    expect(boxSvg.querySelector('rect')?.getAttribute('rx')).toBe('2');
    expect(boxSvg.querySelector('ellipse')).toBeNull();

    // 'cylinder' branch: an ellipse (top) plus a path (body), no rect
    const cylinderSvg = svgs[1]!;
    expect(cylinderSvg.querySelector('ellipse')).not.toBeNull();
    expect(cylinderSvg.querySelector('path')).not.toBeNull();
    expect(cylinderSvg.querySelector('rect')).toBeNull();
  });

  it('renders a bubble swatch as one outline path with the tail, not the box rect', () => {
    const rows: LegendRow[] = [
      { id: 'types:comment', section: 'types', label: 'Comment', swatch: { draw: 'shape', style: { shape: 'bubble' } } },
    ];
    const { container } = render(<Legend rows={rows} interactive />);
    const svg = container.querySelector('span.dg-legend-shape > svg')!;
    expect(svg.querySelector('rect')).toBeNull();
    const d = svg.querySelector('path')?.getAttribute('d') ?? '';
    // the tail dips below the body's bottom edge (y=13 on the 24x16 swatch)
    const ys = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number).filter((_n, i) => i % 2 === 1);
    expect(Math.max(...ys)).toBeGreaterThan(13);
  });

  it('draws the icon on a shape swatch when an icon registry is supplied', () => {
    const iconRows: LegendRow[] = [
      {
        id: 'types:database',
        section: 'types',
        label: 'Database',
        swatch: { draw: 'shape', style: { shape: 'cylinder' }, icon: 'database' },
      },
    ];
    const { container } = render(<Legend rows={iconRows} interactive icons={createIconRegistry()} />);
    expect(container.querySelector('.dg-legend-shape .dg-legend-icon')).not.toBeNull();
  });

  it('draws no icon when no registry is supplied', () => {
    const iconRows: LegendRow[] = [
      {
        id: 'types:database',
        section: 'types',
        label: 'Database',
        swatch: { draw: 'shape', style: { shape: 'cylinder' }, icon: 'database' },
      },
    ];
    const { container } = render(<Legend rows={iconRows} interactive />);
    expect(container.querySelector('.dg-legend-icon')).toBeNull();
  });

  it('renders an empty placeholder swatch when a row has no swatch at all', () => {
    const noSwatchRows: LegendRow[] = [{ id: 'items:0', section: 'items', label: 'Plain note' }];
    const { container } = render(<Legend rows={noSwatchRows} interactive />);
    const placeholder = container.querySelector('.dg-legend-swatch');
    expect(placeholder).not.toBeNull();
    expect(placeholder?.tagName.toLowerCase()).toBe('span');
    expect(placeholder?.classList.contains('dg-legend-chip')).toBe(false);
    expect(placeholder?.querySelector('svg')).toBeNull();
  });

  it('does not call onMeasure again when the measured size is unchanged', () => {
    const onMeasure = vi.fn();
    const { rerender } = render(<Legend rows={rows} interactive onMeasure={onMeasure} />);
    expect(onMeasure).toHaveBeenCalledTimes(1);
    // A fresh array (same values, new identity) mimics a caller that re-derives
    // `rows` inline every render; the effect re-runs but the measured size
    // (unchanged in jsdom) must not trigger a second onMeasure call.
    rerender(<Legend rows={[...rows]} interactive onMeasure={onMeasure} />);
    expect(onMeasure).toHaveBeenCalledTimes(1);
  });

  it('renders the Drawings row as a toggle wired to onToggleDrawings', () => {
    const onToggleDrawings = vi.fn();
    const withDrawings: LegendRow[] = [
      ...rows,
      { id: 'layers:$drawings', section: 'layers', label: 'Drawings', drawings: true, active: true, swatch: { draw: 'line', style: { width: 2.5 }, color: 'var(--dg-ink)' } },
    ];
    render(<Legend rows={withDrawings} interactive onToggleDrawings={onToggleDrawings} />);
    const btn = screen.getByRole('button', { name: 'Drawings' });
    expect(btn.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(btn);
    expect(onToggleDrawings).toHaveBeenCalledTimes(1);
  });

  it('renders the Drawings row inert without a handler', () => {
    render(<Legend rows={[{ id: 'layers:$drawings', section: 'layers', label: 'Drawings', drawings: true, active: true }]} interactive={false} />);
    expect(screen.queryByRole('button', { name: 'Drawings' })).toBeNull();
    expect(screen.getByText('Drawings')).toBeTruthy();
  });

  // ---- swatches that match the canvas ------------------------------------------
  const svgOf = (row: LegendRow): string => {
    const { container, unmount } = render(<Legend rows={[row]} interactive={false} />);
    const html = container.querySelector('.dg-legend-swatch')?.innerHTML ?? '';
    unmount();
    return html;
  };
  const shapeRow = (shape: ShapeId): LegendRow => ({ id: `types:${shape}`, section: 'types', label: shape, swatch: { draw: 'shape', style: { shape } } });
  const lineRow = (style: KindStyle): LegendRow => ({ id: 'kinds:k', section: 'kinds', label: 'k', swatch: { draw: 'line', style } });

  it('gives every canvas shape a swatch of its own, never the box fallback', () => {
    const shapes: ShapeId[] = ['cylinder', 'pill', 'hexagon', 'person', 'table', 'bubble', 'circle', 'rounded', 'diamond', 'bar', 'start-dot', 'end-bullseye', 'send-signal', 'receive-signal', 'note', 'ellipse', 'store'];
    const box = svgOf(shapeRow('box'));
    const drawn = shapes.map((sh) => svgOf(shapeRow(sh)));
    for (const [i, html] of drawn.entries()) expect(html, shapes[i]).not.toBe(box);
    // and no two shapes share one
    expect(new Set(drawn).size).toBe(shapes.length);
  });

  it('fills the solid glyphs and leaves a store open-ended, as the canvas does', () => {
    const { container } = render(<Legend rows={[shapeRow('start-dot'), shapeRow('end-bullseye'), shapeRow('store')]} interactive={false} />);
    const [dot, bullseye, store] = [...container.querySelectorAll('span.dg-legend-shape > svg')];
    expect(dot!.querySelectorAll('circle')).toHaveLength(1);
    expect(dot!.querySelector('circle')?.getAttribute('fill')).not.toBe('var(--dg-surface)');
    expect(bullseye!.querySelectorAll('circle')).toHaveLength(2);
    // a data store is two rules with nothing closing the ends
    expect(store!.querySelectorAll('line')).toHaveLength(2);
    expect(store!.querySelector('rect')).toBeNull();
  });

  it('draws a connection with the ends its kind has', () => {
    const arrow = 'M0,0 L10,5 L0,10 z';
    expect(svgOf(lineRow({}))).toContain(arrow); // the default end is an arrowhead
    expect(svgOf(lineRow({ dashed: true, endMarker: 'none' }))).not.toContain(arrow);
    const fk = svgOf(lineRow({ startMarker: 'crowsfoot', endMarker: 'one' }));
    expect(fk).toContain('M10,1 L0,5 L10,9 M0,5 L10,5'); // the crow's foot
    expect(fk).toContain('M5,1 L5,9'); // the bar
    expect(fk).not.toContain(arrow);
  });

  it('draws the lightning jog of an interrupt', () => {
    expect(svgOf(lineRow({ zigzag: true }))).toContain('<polyline');
    expect(svgOf(lineRow({}))).not.toContain('<polyline');
  });

  it('draws marks under their own heading, as the badge or tag the canvas shows', () => {
    const marks: LegendRow[] = [
      { id: 'marks:threat-open', section: 'marks', label: 'Open threats', swatch: { draw: 'mark', mark: 'threat-open' } },
      { id: 'marks:threat-handled', section: 'marks', label: 'All threats handled', swatch: { draw: 'mark', mark: 'threat-handled' } },
      { id: 'marks:pk', section: 'marks', label: 'Primary key', swatch: { draw: 'mark', mark: 'pk' } },
      { id: 'marks:fk', section: 'marks', label: 'Foreign key column', swatch: { draw: 'mark', mark: 'fk' } },
    ];
    const { container } = render(<Legend rows={marks} interactive={false} />);
    expect(screen.getByText('Marks')).toBeTruthy();
    const drawn = [...container.querySelectorAll('.dg-legend-mark')].map((el) => [el.getAttribute('data-mark'), el.textContent]);
    expect(drawn).toEqual([
      ['threat-open', '1'],
      ['threat-handled', '✓'],
      ['pk', '🔑'],
      ['fk', 'FK'],
    ]);
  });
});
