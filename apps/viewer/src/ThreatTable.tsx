import type { CSSProperties } from 'react';
import {
  crossingLabel,
  crossings,
  STRIDE_NAMES,
  threatRegister,
  threatSummary,
  type DiagramModel,
} from '@diagc/core';

/** A register worth a strip of the page: one the model actually has threats for,
 * on a page a reader can scroll. Export renders are excluded — see Viewer.tsx. */
export function showsThreatTable(model: DiagramModel, expandAll: boolean): boolean {
  return !expandAll && threatRegister(model).length > 0;
}

const HEADINGS = ['Element', 'Crosses', 'STRIDE', 'Threat', 'Severity', 'Status', 'Mitigation'] as const;

// Chrome styling, matched to the viewer's own picker (Viewer.tsx `pickerStyle`):
// the theme's surface tokens and 12px system-ui, inline rather than a stylesheet
// because the published page is a single inlined file with no CSS of its own.
const wrapStyle: CSSProperties = {
  // The canvas takes the rest of the column; the register keeps its natural
  // height up to a share of the page, and scrolls inside itself after that, so a
  // long list never squeezes the diagram out of view.
  flex: 'none',
  maxHeight: '40%',
  overflowY: 'auto',
  borderTop: '1px solid var(--dg-border)',
  background: 'var(--dg-node-fill)',
  color: 'var(--dg-text)',
  padding: '6px 10px 8px',
  font: '400 12px system-ui, sans-serif',
};

const summaryStyle: CSSProperties = {
  cursor: 'pointer',
  color: 'var(--dg-text-muted)',
  fontWeight: 600,
  padding: '2px 0',
};

const tableStyle: CSSProperties = { borderCollapse: 'collapse', width: '100%', textAlign: 'left' };

const thStyle: CSSProperties = {
  color: 'var(--dg-text-muted)',
  fontWeight: 600,
  textAlign: 'left',
  padding: '4px 8px',
  borderBottom: '1px solid var(--dg-border)',
  whiteSpace: 'nowrap',
};

const tdStyle: CSSProperties = { padding: '4px 8px', borderTop: '1px solid var(--dg-border)', verticalAlign: 'top' };

/**
 * The published page's threat register: every threat in the model as one table,
 * the artefact a STRIDE review is actually read from. Derived, never authored —
 * the rows come from core's `threatRegister` and the crossings from `crossings`,
 * so the table cannot disagree with the drawing above it or with the studio's
 * own panel.
 */
export function ThreatTable({ model, plane }: { model: DiagramModel; plane?: string }) {
  const rows = threatRegister(model);
  // Which boundaries a flow's ends sit in is a fact about the plane being drawn,
  // so the table follows the plane the reader picked.
  const cross = crossings(model, plane);
  const { open, total } = threatSummary(rows.map((r) => r.threat));

  return (
    <details open className="dg-threat-table" style={wrapStyle}>
      <summary style={summaryStyle}>
        Threats: {open} open of {total}
      </summary>
      <table style={tableStyle} aria-label="Threat register">
        <thead>
          <tr>
            {HEADINGS.map((h) => (
              <th key={h} scope="col" style={thStyle}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const t = row.threat;
            // Only a relation can cross a boundary, and only one that actually
            // does is in the map; a node's cell stays empty rather than saying
            // something true but useless about where it sits.
            const c = 'relation' in row.target ? cross.get(row.target.relation) : undefined;
            return (
              // The index is in the key because a published page also renders
              // models validation rejects — repeated threat ids among them.
              <tr key={`${'node' in row.target ? row.target.node : row.target.relation}:${t.id}:${index}`}>
                <td style={tdStyle}>{row.name}</td>
                {/* the flow reads between its ends, this between the boundaries
                    those ends sit in — hence the other arrow. Worded in core, so
                    this cell and the studio panel's sub-line cannot drift. */}
                <td style={tdStyle}>{c === undefined ? '' : crossingLabel(model, c)}</td>
                <td style={tdStyle}>{`${t.category} · ${STRIDE_NAMES[t.category]}`}</td>
                <td style={tdStyle}>{t.title}</td>
                <td style={tdStyle}>{t.severity ?? '—'}</td>
                {/* an unset status IS open (isOpen), so it reads as the word it
                    means rather than as a blank the reader must interpret */}
                <td style={tdStyle}>{t.status ?? 'open'}</td>
                <td style={tdStyle}>{t.mitigation ?? ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </details>
  );
}
