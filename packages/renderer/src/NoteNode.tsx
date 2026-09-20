import { useEffect, useRef, useState } from 'react';
import {
  isOpen,
  nextThreatStatus,
  STRIDE_NAMES,
  threatTargetKey,
  type Threat,
  type ThreatStatus,
  type ThreatTarget,
} from '@diagc/core';
import { InlineName } from './DiagramNode';
import { NOTE_WIDTH, STATUS_WORD, type Point } from './note-place';
import { tailGeometry } from './note-tail';
import { threatBadgeProps } from './threat-badge';

export { NOTE_WIDTH };

/** the data channel of a threat bubble — one per OPEN element (see DiagramView's
 * note derivation). The threats are the model's own objects (identity), so a
 * bubble re-renders exactly when its element's list does. */
export interface NoteData {
  target: ThreatTarget;
  /** the element's display name — the header, so a bubble dragged away from
   * its element still says what it is about */
  name: string;
  threats: readonly Threat[];
  /** the badge's centre in the same (parent-relative) space as the bubble's
   * position — what the saved offset is measured from (see note-drag.ts) */
  anchor: Point;
  /** the same badge centre in ABSOLUTE flow coordinates — what the tail points
   * at. React Flow hands a node its absolute position, not its parent-relative
   * one, so the tail's arithmetic needs the badge in that frame; the drag's
   * needs `anchor`. One point, two frames. */
  badge: Point;
  editing: boolean;
  /** the row whose title the host wants open for typing (a just-added threat) */
  editingId?: string;
  onAddThreat?: (target: ThreatTarget) => void;
  /** `''` = the field was escaped or emptied — the host decides (a threat still
   * carrying the placeholder title is removed, a named one keeps its name) */
  onRetitleThreat?: (target: ThreatTarget, id: string, title: string) => void;
  onSetThreatStatus?: (target: ThreatTarget, id: string, status: ThreatStatus) => void;
  /** `''` = clear the field */
  onEditThreatText?: (target: ThreatTarget, id: string, field: 'description' | 'mitigation', text: string) => void;
  /** the host-opened row closed (commit or cancel) */
  onEndEdit?: () => void;
}

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

/**
 * A speech bubble beside an element: its threats, readable at a glance and
 * exported with the picture, with title, status and details writable in place.
 * Content, not chrome — only its controls and fields disappear under
 * .dg-no-chrome. A React Flow node so drag, z-order and export come for free;
 * never selectable, so a click selects the element it is about (DiagramView
 * routes it). Drawn in the theme's node colours (see .dg-note): the sticky it
 * replaced fixed a pale fill under the theme's text colour and was unreadable
 * in the dark theme.
 *
 * The tail is an SVG drawn from the bubble's live position and measured size
 * (React Flow's own props), so it tracks a drag frame by frame; it is absent
 * until the first measure, one frame.
 */
export function NoteNode({
  data,
  positionAbsoluteX,
  positionAbsoluteY,
  width,
  height,
}: {
  id: string;
  data: NoteData;
  positionAbsoluteX?: number;
  positionAbsoluteY?: number;
  width?: number;
  height?: number;
}): import('react').ReactElement {
  // Which row this bubble opened by itself (double-click). The host's editingId
  // is the other way in, and a local edit wins while it is open so a stale
  // host row cannot fight the one under the cursor.
  const [localEdit, setLocalEdit] = useState<string | null>(null);
  const editingId = data.editing ? (localEdit ?? data.editingId) : undefined;
  // Which rows show their details. Session state on purpose: an export shows
  // rows collapsed, and reopening the diagram starts compact.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  // Leaving edit mode drops the half-finished rename with it. Without the
  // reset the row is only *hidden* by the guard above, and the next Edit click
  // would reopen the field the user walked away from.
  useEffect(() => {
    if (!data.editing) setLocalEdit(null);
  }, [data.editing]);
  const open = data.threats.filter(isOpen).length;
  const counts = threatBadgeProps({ open, total: data.threats.length });
  const done = () => {
    setLocalEdit(null);
    data.onEndEdit?.();
  };
  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  // The badge in the bubble's own space. Unmeasured (the first frame) draws
  // no tail rather than one aimed from a guessed size.
  const tail =
    width !== undefined && height !== undefined && width > 0 && height > 0
      ? tailGeometry({ x: data.badge.x - (positionAbsoluteX ?? 0), y: data.badge.y - (positionAbsoluteY ?? 0) }, { width, height })
      : null;
  return (
    <div className="dg-note" data-target={threatTargetKey(data.target)} style={{ width: NOTE_WIDTH }}>
      {tail !== null && (
        <svg className="dg-note-tail" data-side={tail.side} aria-hidden="true">
          {/* open path: the fill closes it across the base, the stroke draws
              only the two long sides — and the base sits inside the border,
              so the fill covers the border line and the tail merges with the
              box, the way a drawn bubble does */}
          <path d={`M${tail.base[0].x} ${tail.base[0].y} L${tail.tip.x} ${tail.tip.y} L${tail.base[1].x} ${tail.base[1].y}`} />
        </svg>
      )}
      <div className="dg-note-head">
        <span className="dg-note-name">{data.name}</span>
        {/* the header reads `open / total`, not the badge's single number: a
            bubble has the room, and the denominator is what says how much of
            the element has been thought about */}
        <span className="dg-note-count" data-state={counts.state} title={counts.title}>
          {`${open} / ${data.threats.length}`}
        </span>
      </div>
      <ul className="dg-note-rows">
        {data.threats.map((t) => {
          const status = t.status ?? 'open';
          const word = STATUS_WORD[status];
          const hasDetails = (t.description ?? '') !== '' || (t.mitigation ?? '') !== '';
          // `expanded` is session state that outlives edit mode, and in edit
          // mode a row with no text still has two textareas to show. Leaving
          // edit mode takes those away, so the same expanded row would render
          // an empty block (and export as a gap) — gate it on the same
          // condition the ▸ button is gated on.
          const isExpanded = expanded.has(t.id) && (data.editing || hasDetails);
          return (
            <li key={t.id} className="dg-note-row" data-open={isOpen(t) ? 'true' : 'false'}>
              <div className="dg-note-line">
                <span className="dg-stride" data-category={t.category} title={STRIDE_NAMES[t.category]}>{t.category}</span>
                {editingId === t.id ? (
                  <span className="nodrag nopan" onMouseDown={stop} onPointerDown={stop}>
                    <InlineName
                      label={t.title}
                      ariaLabel="Rename threat"
                      onCommit={(v) => {
                        // Escape hands back null and an emptied field hands back
                        // '': both are "no title", and the host decides what that
                        // means for a threat that was just added.
                        data.onRetitleThreat?.(data.target, t.id, v === null ? '' : v.trim());
                        done();
                      }}
                    />
                  </span>
                ) : (
                  <span
                    className="dg-note-title"
                    onDoubleClick={data.editing ? (e) => { e.stopPropagation(); setLocalEdit(t.id); } : undefined}
                  >
                    {t.title}
                  </span>
                )}
                {data.editing && data.onSetThreatStatus !== undefined ? (
                  <button
                    type="button"
                    className="dg-note-status nodrag nopan"
                    data-status={status}
                    aria-label="Set status"
                    title={`Status: ${word} — click to change`}
                    onMouseDown={stop}
                    onPointerDown={stop}
                    onClick={(e) => { e.stopPropagation(); data.onSetThreatStatus?.(data.target, t.id, nextThreatStatus(t)); }}
                  >
                    {word}
                  </button>
                ) : (
                  <span className="dg-note-status" data-status={status}>{word}</span>
                )}
                {(data.editing || hasDetails) && (
                  <button
                    type="button"
                    className="dg-note-expand nodrag nopan"
                    aria-expanded={isExpanded}
                    aria-label={isExpanded ? 'Hide details' : 'Show details'}
                    onMouseDown={stop}
                    onPointerDown={stop}
                    onClick={(e) => { e.stopPropagation(); toggleExpanded(t.id); }}
                  >
                    {isExpanded ? '▾' : '▸'}
                  </button>
                )}
              </div>
              {isExpanded && (
                <div className="dg-note-details">
                  {data.editing && data.onEditThreatText !== undefined ? (
                    <>
                      <DetailField
                        label="Description"
                        value={t.description ?? ''}
                        onCommit={(text) => data.onEditThreatText?.(data.target, t.id, 'description', text)}
                      />
                      <DetailField
                        label="Mitigation"
                        value={t.mitigation ?? ''}
                        onCommit={(text) => data.onEditThreatText?.(data.target, t.id, 'mitigation', text)}
                      />
                    </>
                  ) : (
                    <>
                      {(t.description ?? '') !== '' && <p className="dg-note-text">{t.description}</p>}
                      {(t.mitigation ?? '') !== '' && (
                        <p className="dg-note-text">
                          <span className="dg-note-text-label">Mitigation</span> {t.mitigation}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {data.editing && data.onAddThreat !== undefined && (
        <button
          type="button"
          className="dg-note-add nodrag nopan"
          aria-label="Add a threat"
          title="Add a threat"
          onMouseDown={stop}
          onPointerDown={stop}
          onClick={(e) => { e.stopPropagation(); data.onAddThreat?.(data.target); }}
        >
          +
        </button>
      )}
    </div>
  );
}

/**
 * One details textarea. Local draft, committed on blur when it differs from the
 * model (trimmed) — a keystroke-per-command would flood the undo stack and the
 * 300ms autosave. Escape restores the model's text; the blur that follows then
 * has nothing to say.
 */
function DetailField({ label, value, onCommit }: { label: string; value: string; onCommit: (text: string) => void }) {
  const [draft, setDraft] = useState(value);
  // A commit elsewhere (the panel) changes `value` under an idle field; follow
  // it — a `value` change while the field is idle replaces the draft. Nothing
  // else writes the field while it has focus: every path to the panel blurs it
  // first, and that blur commits.
  useEffect(() => { setDraft(value); }, [value]);
  // Escape restores and blurs in one tick — the blur below still sees the typed
  // draft in its closure, so it needs telling that this one is a cancel.
  const escaped = useRef(false);
  return (
    <textarea
      className="dg-note-field nodrag nopan"
      aria-label={label}
      placeholder={label}
      rows={2}
      value={draft}
      onMouseDown={stop}
      onPointerDown={stop}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          setDraft(value);
          escaped.current = true;
          (e.target as HTMLTextAreaElement).blur();
        }
      }}
      onBlur={() => {
        if (escaped.current) {
          escaped.current = false;
          return;
        }
        const text = draft.trim();
        if (text !== value.trim()) onCommit(text);
      }}
    />
  );
}
