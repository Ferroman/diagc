import type { ReactElement } from 'react';
import { Handle, Position } from '@xyflow/react';
import { notationProfile } from '../notations';
import { commentBadgeProps } from '../notes/comment-badge';
import { AddThreatButton, NoteBadge } from '../notes/NoteBadge';
import { threatBadgeProps } from '../notes/threat-badge';
import type { QuickAddSide } from '../canvas/view-types';
import type { DiagramNodeData } from './DiagramNode';

// One connect point per side, all type="source": with the canvas in loose
// connection mode a drag can start and end on any of them, so the gesture's
// start node is always the relation's `from` (direction follows the drag).
export const sideHandles = (
  <>
    <Handle id="top" type="source" position={Position.Top} className="dg-handle" />
    <Handle id="right" type="source" position={Position.Right} className="dg-handle" />
    <Handle id="bottom" type="source" position={Position.Bottom} className="dg-handle" />
    <Handle id="left" type="source" position={Position.Left} className="dg-handle" />
  </>
);

/** Corner badge for a node whose model carries `link` (see DiagramNodeData.link) —
 * shared by every node shape that draws one (and by TableNode) so the click
 * semantics live in exactly one place instead of a copy per shape. Renders
 * nothing when the node has no link. */
export function LinkBadge({ data }: { data: DiagramNodeData }): ReactElement | null {
  if (data.link === undefined) return null;
  const link = data.link;
  return (
    <button
      type="button"
      className="dg-link-badge"
      title={link}
      aria-label={`Open ${link}`}
      onClick={(e) => {
        // The badge is the navigation affordance; a plain node click keeps
        // meaning "select", so the canvas must never see this one.
        e.stopPropagation();
        if (data.onOpenLink !== undefined) data.onOpenLink(link);
        else if (/^https?:/.test(link)) window.open(link, '_blank', 'noopener');
      }}
    >
      🔗
    </button>
  );
}

/** The open-threat count (red) or a green tick once every threat is handled.
 * Stays in exports (no .dg-no-chrome rule): the PNG is where a reviewer sees
 * at a glance what is still open. Where there is nothing to count yet, the same
 * corner offers the first threat instead — chrome, so THAT state is dropped
 * from exports. */
export function ThreatBadge({ id, data }: { id: string; data: DiagramNodeData }): ReactElement | null {
  const t = data.threats;
  if (t === undefined || t.total === 0) {
    // Edit mode, where the notation offers threats (profile.offersThreats):
    // the first threat is one click away on the canvas, so the register can
    // be written without opening the panel.
    if (data.onAddThreat === undefined || notationProfile(data.notation).offersThreats !== true) return null;
    const add = data.onAddThreat;
    return <AddThreatButton className="dg-threat-badge nodrag" state="empty" onAdd={() => add({ node: id })} />;
  }
  // state/text/title come from the shared derivation so this badge and the
  // flow's badge cannot drift apart in what they say (see threat-badge.ts).
  const { state, text, title } = threatBadgeProps(t);
  return (
    <NoteBadge className="dg-threat-badge" target={noteTarget(id, data)} state={state} title={title} text={text} />
  );
}

/** The comment count (or a link glyph) at the opposite corner from the threat
 * badge. Stays in exports like the threat count: a reviewer reading the PNG
 * should see that there is something to read. Never offers a `+` — comments
 * are written in the panel. */
export function CommentBadge({ id, data }: { id: string; data: DiagramNodeData }): ReactElement | null {
  const badge = data.annotations !== undefined ? commentBadgeProps(data.annotations) : undefined;
  if (badge === undefined) return null;
  // text/title come from the shared derivation so this badge and the flow's
  // badge cannot drift apart in what they say (see comment-badge.ts).
  return <NoteBadge className="dg-comment-badge" target={noteTarget(id, data)} title={badge.title} text={badge.text} />;
}

/** Whose note a node's badge switches. An external stub's badges stay passive:
 * it stands in for a node this drill view does not draw, and the note
 * derivation skips externals for exactly that reason — the note belongs to
 * the view that draws the node, so a switch here would flip a state nothing
 * on this canvas can show. */
const noteTarget = (id: string, data: DiagramNodeData) => (data.external === true ? undefined : { node: id });

/** The `+` a selected node offers in edit mode: what the host would add on it
 * (a cause on a bone, a flow to a new process, a connected sibling …), named
 * so the offer is legible before the click. Selected-only, so a busy diagram
 * shows one `+`, and mouse events stop here: the canvas must not read the
 * click as "select" nor the press as the start of a drag. Not exported to
 * PNGs (.dg-no-chrome). Keyboard users have Tab, the same action. */
export function QuickAddButton({
  id,
  data,
  selected,
  side,
}: {
  id: string;
  data: DiagramNodeData;
  selected: boolean | undefined;
  /** an edge-anchored offer (activity lanes: one above, one below); only the
   * lower one shares Tab's action, so only it names the key */
  side?: QuickAddSide;
}): ReactElement | null {
  if (selected !== true || data.quickAdd === undefined) return null;
  const label = data.quickAdd.label(id, side);
  if (label === undefined) return null;
  const run = data.quickAdd.run;
  return (
    <button
      type="button"
      className="dg-quick-add nodrag"
      title={side === 'before' ? label : `${label} (Tab)`}
      aria-label={label}
      data-side={side}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        if (side === undefined) run(id);
        else run(id, side);
      }}
    >
      +
    </button>
  );
}

/** A part of the chrome a body may draw (see NodeChrome). */
export type ChromePart = 'link' | 'threat' | 'comment' | 'quickAdd' | 'handles';

/** The chrome a body uses, always in this order: the link badge, the threat
 * and comment badges, the quick-add button, the connect handles. A body that
 * draws something between two parts uses two of these. */
export function NodeChrome({
  id,
  data,
  selected,
  uses,
}: {
  id: string;
  data: DiagramNodeData;
  selected: boolean | undefined;
  uses: readonly ChromePart[];
}): ReactElement {
  return (
    <>
      {uses.includes('link') && <LinkBadge data={data} />}
      {uses.includes('threat') && <ThreatBadge id={id} data={data} />}
      {uses.includes('comment') && <CommentBadge id={id} data={data} />}
      {uses.includes('quickAdd') && <QuickAddButton id={id} data={data} selected={selected} />}
      {uses.includes('handles') && sideHandles}
    </>
  );
}
