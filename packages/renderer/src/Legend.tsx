import { useEffect, useRef, useState } from 'react';
import type { LegendSection } from '@diagramming/core';
import type { IconRegistry } from '@diagramming/icons';
import type { LegendRow, LegendSwatch } from './legendRows';

const SECTION_LABELS: Record<LegendSection | 'items', string> = {
  layers: 'Layers',
  kinds: 'Connections',
  types: 'Elements',
  items: 'Notes',
};

const SECTION_ORDER: (LegendSection | 'items')[] = ['layers', 'kinds', 'types', 'items'];

/** A 24px sample drawn from the same registry entry and tint the canvas uses,
 * so a swatch tracks the arrow or box it describes. One residual gap: a
 * per-relation `style.color` is an override on a single arrow, not a property of
 * the kind, so it is deliberately not lifted into the kind's row. */
function Swatch({ swatch, icons }: { swatch?: LegendSwatch; icons?: IconRegistry }) {
  if (swatch === undefined) return <span className="dg-legend-swatch" aria-hidden="true" />;
  if (swatch.draw === 'chip') {
    return <span className="dg-legend-swatch dg-legend-chip" style={{ background: swatch.color }} aria-hidden="true" />;
  }
  if (swatch.draw === 'line') {
    const width = swatch.style.width ?? 1.5;
    const dash = swatch.style.dashed === true || swatch.style.animated === true ? '6 4' : undefined;
    return (
      <svg className="dg-legend-swatch" viewBox="0 0 24 12" width="24" height="12" aria-hidden="true">
        <line
          x1="1"
          y1="6"
          x2="23"
          y2="6"
          stroke={swatch.color ?? 'var(--dg-edge)'}
          strokeWidth={width}
          {...(dash !== undefined ? { strokeDasharray: dash } : {})}
        />
      </svg>
    );
  }
  const s = swatch.style;
  const stroke = swatch.color ?? 'var(--dg-node-border, var(--dg-border))';
  const dashed = s.dashed === true ? '4 3' : undefined;
  // `IconComponent` accepts only `size`/`className`, so the glyph cannot be a
  // nested <svg> with x/y — it is overlaid on the shape with CSS instead.
  const Icon = swatch.icon !== undefined ? icons?.resolve(swatch.icon) : undefined;
  return (
    <span className="dg-legend-swatch dg-legend-shape">
      <svg viewBox="0 0 24 16" width="24" height="16" aria-hidden="true">
        {s.shape === 'cylinder' ? (
          <>
            <ellipse cx="12" cy="4" rx="8" ry="3" fill="var(--dg-surface)" stroke={stroke} />
            <path d="M4 4 v8 a8 3 0 0 0 16 0 v-8" fill="var(--dg-surface)" stroke={stroke} />
          </>
        ) : s.shape === 'pill' ? (
          <rect x="2" y="3" width="20" height="10" rx="5" fill="var(--dg-surface)" stroke={stroke} {...(dashed !== undefined ? { strokeDasharray: dashed } : {})} />
        ) : s.shape === 'hexagon' ? (
          <polygon points="6,3 18,3 22,8 18,13 6,13 2,8" fill="var(--dg-surface)" stroke={stroke} />
        ) : s.shape === 'bubble' ? (
          <path
            d="M 4 3 L 20 3 Q 22 3 22 5 L 22 11 Q 22 13 20 13 L 10 13 L 6 16 L 6 13 L 4 13 Q 2 13 2 11 L 2 5 Q 2 3 4 3 Z"
            fill="var(--dg-surface)"
            stroke={stroke}
            {...(dashed !== undefined ? { strokeDasharray: dashed } : {})}
          />
        ) : (
          <rect x="2" y="3" width="20" height="10" rx="2" fill="var(--dg-surface)" stroke={stroke} {...(dashed !== undefined ? { strokeDasharray: dashed } : {})} />
        )}
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
