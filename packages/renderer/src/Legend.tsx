import { useEffect, useRef, useState } from 'react';
import type { LegendSection } from '@diagc/core';
import type { IconRegistry } from '@diagc/icons';
import { END_SHAPES, LINE_MARKERS } from './DiagramEdge';
import type { LegendMark, LegendRow, LegendSwatch } from './legendRows';
import type { KindStyle, TypeStyle } from './registry';
import { threatBadgeProps } from './threat-badge';

const SECTION_LABELS: Record<LegendSection | 'items', string> = {
  layers: 'Layers',
  kinds: 'Connections',
  types: 'Elements',
  marks: 'Marks',
  items: 'Notes',
};

const SECTION_ORDER: (LegendSection | 'items')[] = ['layers', 'kinds', 'types', 'marks', 'items'];

/** the canvas's own node stroke — what an outline and a solid glyph are both drawn in */
const NODE_STROKE = 'var(--dg-node-stroke, var(--dg-border))';

/** A marker from the edge's 0..10 box, scaled to the swatch and anchored by its
 * `refX` at a line end, exactly as the SVG `<marker>` anchors it on the canvas.
 * Drawn inline rather than as a `<marker>`: marker ids are document-global, and a
 * legend repeats the same kind on every diagram of a page. */
const MARKER_SCALE = 0.75;

function LineEnd({ name, at, x, color }: { name: string; at: 'start' | 'end'; x: number; color: string }) {
  const shape = END_SHAPES[name];
  if (shape === undefined) return null;
  const flip = at === 'start' ? -MARKER_SCALE : MARKER_SCALE;
  return (
    <g
      transform={`translate(${x} 6) scale(${flip} ${MARKER_SCALE}) translate(${-shape.refX} -5)`}
      // same split as the canvas: an open marker is stroked, a solid one filled only
      {...(LINE_MARKERS.has(name)
        ? { stroke: color, strokeWidth: 1.25, vectorEffect: 'non-scaling-stroke', fill: 'none' }
        : { fill: color })}
    >
      {shape.el}
    </g>
  );
}

function LineSwatch({ style, color }: { style: KindStyle; color: string }) {
  const width = style.width ?? 1.5;
  const dash = style.dashed === true || style.animated === true ? '6 4' : undefined;
  const end = style.endMarker ?? 'arrow';
  const endShape = END_SHAPES[end];
  // A solid head covers the line's end; stop the line inside it, or a heavy stroke
  // shows its square corners either side of the tip.
  const x2 = endShape !== undefined && !LINE_MARKERS.has(end) ? 23 - (endShape.refX - 2) * MARKER_SCALE : 23;
  return (
    <svg className="dg-legend-swatch" viewBox="0 0 24 12" width="24" height="12" aria-hidden="true">
      <line x1="1" y1="6" x2={x2} y2="6" stroke={color} strokeWidth={width} {...(dash !== undefined ? { strokeDasharray: dash } : {})} />
      {style.zigzag === true && <polyline points="8,9 12.5,4.5 10.5,7.5 15,3" fill="none" stroke={color} strokeWidth={1.25} />}
      {style.startMarker !== undefined && <LineEnd name={style.startMarker} at="start" x={1} color={color} />}
      <LineEnd name={end} at="end" x={23} color={color} />
    </svg>
  );
}

/** One drawing per `ShapeId`, in a 24×16 box. A shape with no branch here would be
 * keyed as a plain box, which on an activity diagram is every row saying the same
 * thing — Legend.test pins that each shape gets its own. */
function ShapeGlyph({ s, stroke }: { s: TypeStyle; stroke: string }) {
  const outline = { fill: 'var(--dg-surface)', stroke, ...(s.dashed === true ? { strokeDasharray: '4 3' } : {}) };
  switch (s.shape) {
    case 'cylinder':
      return (
        <>
          <ellipse cx="12" cy="4" rx="8" ry="3" fill="var(--dg-surface)" stroke={stroke} />
          <path d="M4 4 v8 a8 3 0 0 0 16 0 v-8" fill="var(--dg-surface)" stroke={stroke} />
        </>
      );
    case 'pill':
      return <rect x="2" y="3" width="20" height="10" rx="5" {...outline} />;
    // Rounder than the canvas's own 14px would scale to: at this size the true
    // radius is a box, and an action beside an object must not read as one.
    case 'rounded':
      return <rect x="2" y="3" width="20" height="10" rx="4.5" {...outline} />;
    case 'hexagon':
      return <polygon points="6,3 18,3 22,8 18,13 6,13 2,8" fill="var(--dg-surface)" stroke={stroke} />;
    case 'bubble':
      return (
        <path d="M 4 3 L 20 3 Q 22 3 22 5 L 22 11 Q 22 13 20 13 L 10 13 L 6 16 L 6 13 L 4 13 Q 2 13 2 11 L 2 5 Q 2 3 4 3 Z" {...outline} />
      );
    case 'person':
      return (
        <>
          <path d="M5 15 v-3 a4 4 0 0 1 4 -4 h6 a4 4 0 0 1 4 4 v3 z" {...outline} />
          <circle cx="12" cy="4.5" r="3" {...outline} />
        </>
      );
    case 'table':
      return (
        <>
          <rect x="2" y="2" width="20" height="12" rx="1.5" {...outline} />
          <path d="M2 6.5 h20 M2 10.25 h20" fill="none" stroke={stroke} />
        </>
      );
    case 'circle':
      return <circle cx="12" cy="8" r="5.5" {...outline} />;
    case 'ellipse':
      return <ellipse cx="12" cy="8" rx="10" ry="5.5" {...outline} />;
    case 'diamond':
      return <polygon points="12,1.5 20,8 12,14.5 4,8" {...outline} />;
    // The three solid glyphs: the canvas paints them in the stroke colour, not the fill.
    case 'bar':
      return <rect x="10.5" y="1" width="3" height="14" rx="1" fill={stroke} />;
    case 'start-dot':
      return <circle cx="12" cy="8" r="5" fill={stroke} />;
    case 'end-bullseye':
      return (
        <>
          <circle cx="12" cy="8" r="6" fill="var(--dg-surface)" stroke={stroke} />
          <circle cx="12" cy="8" r="3.25" fill={stroke} />
        </>
      );
    case 'send-signal':
      return <polygon points="2,3 17,3 22,8 17,13 2,13" {...outline} />;
    case 'receive-signal':
      return <polygon points="2,3 22,3 22,13 2,13 7,8" {...outline} />;
    case 'note':
      return (
        <>
          <polygon points="2,2 17,2 22,7 22,14 2,14" {...outline} />
          <path d="M17 2 v5 h5" fill="none" stroke={stroke} />
        </>
      );
    // a DFD data store: two rules, open at both ends
    case 'store':
      return (
        <>
          <line x1="2" y1="3.5" x2="22" y2="3.5" stroke={stroke} />
          <line x1="2" y1="12.5" x2="22" y2="12.5" stroke={stroke} />
        </>
      );
    case 'box':
      return <rect x="2" y="3" width="20" height="10" rx="2" {...outline} />;
  }
}

/** A badge or column tag, drawn with the text the canvas draws it with. */
function Mark({ mark }: { mark: LegendMark }) {
  const badge = mark === 'threat-open' ? threatBadgeProps({ open: 1, total: 1 }) : mark === 'threat-handled' ? threatBadgeProps({ open: 0, total: 1 }) : undefined;
  return (
    <span className="dg-legend-swatch dg-legend-mark" data-mark={mark} aria-hidden="true">
      {badge !== undefined ? (
        <span className="dg-legend-badge" data-state={badge.state}>{badge.text}</span>
      ) : (
        // the table's own class, so the tag is the colour and weight a column shows
        <span className="dg-table-key">{mark === 'pk' ? '🔑' : 'FK'}</span>
      )}
    </span>
  );
}

/** A 24px sample drawn from the same registry entry and tint the canvas uses,
 * so a swatch tracks the arrow or box it describes. One residual gap: a
 * per-relation `style.color` is an override on a single arrow, not a property of
 * the kind, so it is deliberately not lifted into the kind's row. */
function Swatch({ swatch, icons }: { swatch?: LegendSwatch; icons?: IconRegistry }) {
  if (swatch === undefined) return <span className="dg-legend-swatch" aria-hidden="true" />;
  if (swatch.draw === 'chip') {
    return <span className="dg-legend-swatch dg-legend-chip" style={{ background: swatch.color }} aria-hidden="true" />;
  }
  if (swatch.draw === 'mark') return <Mark mark={swatch.mark} />;
  if (swatch.draw === 'line') return <LineSwatch style={swatch.style} color={swatch.color ?? 'var(--dg-edge)'} />;
  // `IconComponent` accepts only `size`/`className`, so the glyph cannot be a
  // nested <svg> with x/y — it is overlaid on the shape with CSS instead.
  const Icon = swatch.icon !== undefined ? icons?.resolve(swatch.icon) : undefined;
  return (
    <span className="dg-legend-swatch dg-legend-shape">
      <svg viewBox="0 0 24 16" width="24" height="16" aria-hidden="true">
        <ShapeGlyph s={swatch.style} stroke={swatch.color ?? NODE_STROKE} />
      </svg>
      {Icon !== undefined && <Icon size={9} className="dg-legend-icon" />}
    </span>
  );
}

export interface LegendProps {
  rows: LegendRow[];
  title?: string;
  /** false in export: no collapse control, no hover affordances. Whether a layer
   *  row is a BUTTON is decided by `onToggleLayer`, not by this — a row that
   *  looks clickable but has nothing to call is worse than a plain row. */
  interactive: boolean;
  onToggleLayer?: (id: string) => void;
  onToggleDrawings?: () => void;
  /** resolves `icon` on a shape swatch; without it no glyph is drawn */
  icons?: IconRegistry;
  /** reports the rendered size so the host can reserve space in an export */
  onMeasure?: (size: { width: number; height: number }) => void;
}

export function Legend({ rows, title = 'Legend', interactive, onToggleLayer, onToggleDrawings, icons, onMeasure }: LegendProps) {
  const [collapsed, setCollapsed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const lastSize = useRef<{ width: number; height: number } | null>(null);

  useEffect(() => {
    if (onMeasure === undefined || ref.current === null) return;
    const { width, height } = ref.current.getBoundingClientRect();
    const size = { width: Math.ceil(width), height: Math.ceil(height) };
    const last = lastSize.current;
    // Guard against callers that re-derive `rows` or `onMeasure` inline every
    // render: only report when the measured size actually moved, so an
    // unchanged size can never re-trigger a parent setState → re-render →
    // effect loop, regardless of dependency identity churn.
    if (last !== null && last.width === size.width && last.height === size.height) return;
    lastSize.current = size;
    onMeasure(size);
  }, [onMeasure, rows, collapsed]);

  if (rows.length === 0) return null;

  const sections = SECTION_ORDER.map((s) => [s, rows.filter((r) => r.section === s)] as const).filter(
    ([, rs]) => rs.length > 0,
  );

  return (
    <div className="dg-legend" ref={ref}>
      <div className="dg-legend-head">
        <span className="dg-legend-title">{title}</span>
        {interactive && (
          <button
            type="button"
            className="dg-legend-collapse"
            aria-label={collapsed ? 'Expand legend' : 'Collapse legend'}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((v) => !v)}
          >
            <span aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
          </button>
        )}
      </div>
      {!collapsed && (
        <div className="dg-legend-body">
          {sections.map(([section, rs]) => (
            <div className="dg-legend-section" key={section}>
              <div className="dg-legend-section-title">{SECTION_LABELS[section]}</div>
              {rs.map((r) => {
                const swatch = (
                  <Swatch {...(r.swatch !== undefined ? { swatch: r.swatch } : {})} {...(icons !== undefined ? { icons } : {})} />
                );
                const layer = r.layer;
                if (r.drawings === true && onToggleDrawings !== undefined) {
                  return (
                    <button
                      type="button"
                      key={r.id}
                      className={`dg-legend-row dg-legend-toggle${r.active === true ? '' : ' dg-legend-off'}`}
                      aria-pressed={r.active === true}
                      onClick={onToggleDrawings}
                    >
                      {swatch}
                      <span className="dg-legend-label">{r.label}</span>
                    </button>
                  );
                }
                // A layer row is a button only where a handler exists to answer
                // it. On a published page there is none, so the row is inert
                // markup rather than a focusable control that does nothing.
                if (layer !== undefined && onToggleLayer !== undefined) {
                  return (
                    <button
                      type="button"
                      key={r.id}
                      className={`dg-legend-row dg-legend-toggle${r.active === true ? '' : ' dg-legend-off'}`}
                      aria-pressed={r.active === true}
                      onClick={() => onToggleLayer(layer)}
                    >
                      {swatch}
                      <span className="dg-legend-label">{r.label}</span>
                    </button>
                  );
                }
                return (
                  <div
                    key={r.id}
                    className={`dg-legend-row${(layer !== undefined || r.drawings === true) && r.active !== true ? ' dg-legend-off' : ''}`}
                  >
                    {swatch}
                    <span className="dg-legend-label">{r.label}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
