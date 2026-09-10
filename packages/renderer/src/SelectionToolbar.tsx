import { Panel } from '@xyflow/react';
import type { AlignMode } from './arrange';

export interface SelectionToolbarProps {
  /** the selected node ids; nothing renders below two, and distribute needs three. */
  ids: string[];
  onAlign: (mode: AlignMode) => void;
  onDistribute: (axis: 'x' | 'y') => void;
}

// Unicode glyphs in the corner-controls idiom (no icon dependency); the
// aria-label is the contract tests and screen readers use.
const ALIGN: { mode: AlignMode; glyph: string; label: string }[] = [
  { mode: 'left', glyph: '⇤', label: 'Align left' },
  { mode: 'centerX', glyph: '⇹', label: 'Align centre' },
  { mode: 'right', glyph: '⇥', label: 'Align right' },
  { mode: 'top', glyph: '⤒', label: 'Align top' },
  { mode: 'middle', glyph: '⇳', label: 'Align middle' },
  { mode: 'bottom', glyph: '⤓', label: 'Align bottom' },
];

/**
 * Align/distribute buttons anchored to the top-centre of the canvas whenever
 * two or more nodes are selected. A toolbar attached to the selection's own
 * bounds (React Flow's `NodeToolbar`) is clipped whenever the selection
 * touches the canvas edge — which a `fitView` does by construction on a small
 * canvas — so instead this rides React Flow's screen-space `Panel`, the same
 * anchoring the studio uses for its `⊞ Group` chip. A canvas-anchored bar
 * cannot be occluded by the selection's own position.
 */
export function SelectionToolbar({ ids, onAlign, onDistribute }: SelectionToolbarProps) {
  if (ids.length < 2) return null;
  const canDistribute = ids.length >= 3;
  return (
    <Panel position="top-center" className="dg-selection-toolbar" aria-label="Arrange selection">
      {ALIGN.map((a) => (
        <button key={a.mode} type="button" className="dg-arrange-btn" title={a.label} aria-label={a.label} onClick={() => onAlign(a.mode)}>
          {a.glyph}
        </button>
      ))}
      <span className="dg-arrange-sep" />
      <button
        type="button"
        className="dg-arrange-btn"
        title="Distribute horizontally (3+ nodes)"
        aria-label="Distribute horizontally"
        disabled={!canDistribute}
        onClick={() => onDistribute('x')}
      >
        ⋯
      </button>
      <button
        type="button"
        className="dg-arrange-btn"
        title="Distribute vertically (3+ nodes)"
        aria-label="Distribute vertically"
        disabled={!canDistribute}
        onClick={() => onDistribute('y')}
      >
        ⋮
      </button>
    </Panel>
  );
}
