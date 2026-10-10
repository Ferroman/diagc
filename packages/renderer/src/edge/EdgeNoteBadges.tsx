import { EdgeLabelRenderer } from '@xyflow/react';
import { useContext, useEffect, useRef, type ReactElement } from 'react';
import type { Point } from '@diagc/core/internal';
import { commentBadgeProps } from '../notes/comment-badge';
import { AddThreatButton, NoteBadge } from '../notes/NoteBadge';
import { NoteStateContext, type NoteState } from '../notes/note-state';
import { threatBadgeProps } from '../notes/threat-badge';
import type { NotationProfile } from '../notations';
import type { DiagramEdgeData } from './DiagramEdge';
import { markFrame, type EdgeCurve, type MarkFrame } from './edge-geometry';

/** how far the threat badge sits off the path, along the normal (px) */
const THREAT_OFFSET = 10;
/** how many segments a threat-carrying flow's line is sampled into for the
 * notes' placement — a note is far wider than one step, so it cannot lie
 * across the line between two samples */
const LINE_SAMPLES = 24;

/** Where a badge sits: its frame's point, pushed off the line along the normal.
 * One helper for both badges (threat at t = 0.75, comment at t = 0.25), because
 * the reported note anchor is read back off whichever of the two is drawing —
 * two copies of this sum could disagree and hang a note off nothing. Exported
 * so a test can say where a badge is expected rather than restating the
 * arithmetic. */
export const badgePosition = (f: MarkFrame): Point => ({
  x: f.point.x + f.normal.x * THREAT_OFFSET,
  y: f.point.y + f.normal.y * THREAT_OFFSET,
});

/** A badge's frame, its spot, and the transform that puts it there. */
interface BadgeSpot {
  frame: MarkFrame;
  at: Point;
  transform: string;
}

function badgeSpot(curve: EdgeCurve, t: number): BadgeSpot {
  const frame = markFrame(curve, t);
  const at = badgePosition(frame);
  return { frame, at, transform: `translate(-50%, -50%) translate(${at.x}px, ${at.y}px)` };
}

/** A flow's threat and comment badges, in the HTML label layer, and where its
 * note hangs off them. */
export function EdgeNoteBadges({
  id,
  data,
  curve,
  profile,
}: {
  id: string;
  data: DiagramEdgeData;
  curve: EdgeCurve;
  profile: NotationProfile;
}): ReactElement {
  const { threatBadge, addThreat } = threatOf(data, profile);
  // The count or the offer: exactly one of the two ever draws, so they share
  // one spot. At t = 0.75 rather than the midpoint, so a centred flow label
  // keeps the middle of the line.
  const threatSpot = threatBadge !== undefined || addThreat !== undefined ? badgeSpot(curve, 0.75) : undefined;

  // Comment badge: at t = 0.25, the other side of the label from the threat
  // badge, so a flow that has both shows both. Same passive/toggle split.
  const commentBadge = data.annotations !== undefined ? commentBadgeProps(data.annotations) : undefined;
  const commentSpot = commentBadge !== undefined ? badgeSpot(curve, 0.25) : undefined;

  // Which notes this canvas has open, and the switch the counting badge is —
  // null on a canvas that draws none, where the badge stays passive.
  const notes = useContext(NoteStateContext);
  // Whose note the flow's badges switch: its sole relation's. A bundle names
  // no relation, so its badges stay the passive count.
  const noteTarget = data.threatRelation !== undefined ? { relation: data.threatRelation } : undefined;
  // Where the relation's note hangs off: the threat badge when there is one
  // (it was first), else the comment badge.
  useNotePlacement(notes, {
    relation: threatBadge !== undefined || commentBadge !== undefined ? data.threatRelation : undefined,
    spot: threatBadge !== undefined ? threatSpot : commentSpot,
    curve,
  });
  return (
    <>
      {threatSpot !== undefined && threatBadge !== undefined && (
        <EdgeLabelRenderer>
          {/* `data-edge`: every badge goes into React Flow's single
              EdgeLabelRenderer portal — one flat layer of absolutely positioned
              elements — so without the edge id on the badge itself the only thing
              saying WHICH flow it belongs to is where it happens to sit. The
              value is the view-edge id (`from=>to:layer`), stable across
              re-layouts; state/text/title come from the shared derivation the
              node badge uses, so the two cannot drift apart in what they say. */}
          <NoteBadge
            className="dg-threat-badge dg-edge-threat"
            target={noteTarget}
            edge={id}
            state={threatBadge.state}
            title={threatBadge.title}
            text={threatBadge.text}
            style={{ transform: threatSpot.transform }}
          />
        </EdgeLabelRenderer>
      )}
      {commentSpot !== undefined && commentBadge !== undefined && (
        <EdgeLabelRenderer>
          {/* Same portal, same `data-edge` reasoning as the threat badge above,
              and the same noteTarget, so the two badges never disagree about
              which flows get a switch. */}
          <NoteBadge
            className="dg-comment-badge dg-edge-comment"
            target={noteTarget}
            edge={id}
            title={commentBadge.title}
            text={commentBadge.text}
            style={{ transform: commentSpot.transform }}
          />
        </EdgeLabelRenderer>
      )}
      {threatSpot !== undefined && addThreat !== undefined && (
        <EdgeLabelRenderer>
          {/* `data-edge` for the same reason the counting badge carries it: the
              label portal is one flat layer, so the badge itself must say which
              flow it belongs to. Unlike that badge this one is clickable, so it
              needs pointer events back (the base badge rule turns them off —
              see styles.css) and must keep the press from starting a drag. */}
          <AddThreatButton
            className="dg-threat-badge dg-edge-threat nodrag nopan"
            edge={id}
            state="empty"
            style={{ transform: threatSpot.transform }}
            onAdd={addThreat}
          />
        </EdgeLabelRenderer>
      )}
    </>
  );
}

/** The flow's threat badge: the count where it carries threats, else (edit
 * mode) the offer of a first one. */
function threatOf(
  data: DiagramEdgeData,
  profile: NotationProfile,
): { threatBadge: ReturnType<typeof threatBadgeProps> | undefined; addThreat: (() => void) | undefined } {
  // Gated on the edge carrying threats, not on the notation — a flow can be
  // threat-modelled on any plane. An empty register is not a clean bill of
  // health, so `total === 0` draws nothing — the same rule ThreatBadge states
  // for a node.
  const threats = data.threats !== undefined && data.threats.total > 0 ? data.threats : undefined;
  // Where there is nothing to count yet, the same spot offers the flow's first
  // threat instead — the offer the node badge makes (see ThreatBadge), gated
  // the same way: a host listening (edit mode) where the notation offers threats.
  const addThreat =
    threats === undefined && data.onAddThreat !== undefined && profile.offersThreats === true
      ? data.onAddThreat
      : undefined;
  return { threatBadge: threats !== undefined ? threatBadgeProps(threats) : undefined, addThreat };
}

/** Reports up where a relation's note hangs off: the reporting badge's spot,
 * the side it was pushed to, and the line, sampled end to end so the notes can
 * keep off it. Only the edge knows the routed curve. The same numbers the
 * reporting badge's own transform is written from, so the two cannot disagree.
 * A bundle names no relation and both its badges are passive, so it reports
 * nothing. */
function useNotePlacement(
  notes: NoteState | null,
  badge: { relation: string | undefined; spot: BadgeSpot | undefined; curve: EdgeCurve },
): void {
  const { relation: badgeRelation, curve } = badge;
  const anchorX = badge.spot?.at.x;
  const anchorY = badge.spot?.at.y;
  const anchorNx = badge.spot?.frame.normal.x;
  const anchorNy = badge.spot?.frame.normal.y;
  // The curve is rebuilt every render, so the samples are keyed by their
  // rounded coordinates: the effect re-reports only when the line moved.
  const lineRef = useRef<Point[]>([]);
  let lineKey = '';
  if (notes !== null && badgeRelation !== undefined) {
    lineRef.current = Array.from({ length: LINE_SAMPLES + 1 }, (_, k) => {
      const p = curve.point(k / LINE_SAMPLES);
      return { x: Math.round(p.x), y: Math.round(p.y) };
    });
    lineKey = lineRef.current.map((p) => `${p.x},${p.y}`).join(';');
  }
  useEffect(() => {
    if (
      notes !== null &&
      badgeRelation !== undefined &&
      anchorX !== undefined &&
      anchorY !== undefined &&
      anchorNx !== undefined &&
      anchorNy !== undefined
    )
      notes.placeBadge(badgeRelation, { x: anchorX, y: anchorY }, { x: anchorNx, y: anchorNy }, lineRef.current);
    // lineKey stands in for lineRef.current, which is rebuilt every render
  }, [notes, badgeRelation, anchorX, anchorY, anchorNx, anchorNy, lineKey]);
}
