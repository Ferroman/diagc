import type { ReactElement } from 'react';
import type { NotationProfile } from '../notations';
import type { DiagramEdgeData } from './DiagramEdge';
import { markFrame, type EdgeCurve } from './edge-geometry';
import type { EdgeStroke } from './edge-stroke';

/** how far the polarity glyph sits off the path, along the normal (px) */
const POLARITY_OFFSET = 12;
/** delay mark: half-length of each hash line, along the normal (px) */
const DELAY_HALF_LEN = 6;
/** delay mark: how far apart the two hash lines sit, along the tangent (px) */
const DELAY_GAP = 3;

/** interrupt zigzag: half-length of the lightning jog along the tangent (px) */
const ZIGZAG_HALF = 12;

/** The marks drawn along an edge: a causal link's polarity and delay, and an
 * interrupt's zigzag. Each is placed on the clean curve, so it tracks the arrow
 * rather than a sketch roughening, and drawn beside the end marker, never in its
 * place. */
export function EdgeMarks({
  curve,
  data,
  profile,
  look,
}: {
  curve: EdgeCurve;
  data: DiagramEdgeData;
  profile: NotationProfile;
  look: EdgeStroke;
}): ReactElement {
  // CLD polarity/delay marks: gated on the notation profile *and* the edge
  // actually carrying the datum.
  const showMarks = profile.edge?.marks === true;
  const polarityFrame = showMarks && data.polarity !== undefined ? markFrame(curve, 0.82) : undefined;
  const delayFrame = showMarks && data.delay === true ? markFrame(curve, 0.5) : undefined;

  // UML interrupt flow: a lightning jog at the midpoint. Gated on the KIND
  // style (not the notation profile) — activity edges appear on any canvas.
  const zigzagFrame = look.kind.zigzag === true ? markFrame(curve, 0.5) : undefined;
  return (
    <>
      {polarityFrame !== undefined && data.polarity !== undefined && (
        <text
          className="dg-polarity"
          x={polarityFrame.point.x + polarityFrame.normal.x * POLARITY_OFFSET}
          y={polarityFrame.point.y + polarityFrame.normal.y * POLARITY_OFFSET}
          textAnchor="middle"
          dominantBaseline="central"
          /* The glyph annotates the line, so it takes the line's colour — but
           only where the notation colours by sign; elsewhere it stays text-
           coloured. Inline style, not a `fill` attribute: the stylesheet's
           `.dg-polarity { fill }` outranks presentation attrs. */
          style={look.polarityColor !== undefined ? { fill: look.stroke } : undefined}
        >
          {data.polarity === '-' ? '−' : '+'}
        </text>
      )}
      {delayFrame !== undefined && (
        <g className="dg-delay">
          {[-DELAY_GAP, DELAY_GAP].map((gap) => {
            const cx = delayFrame.point.x + delayFrame.tangent.x * gap;
            const cy = delayFrame.point.y + delayFrame.tangent.y * gap;
            return (
              <line
                key={gap}
                x1={cx - delayFrame.normal.x * DELAY_HALF_LEN}
                y1={cy - delayFrame.normal.y * DELAY_HALF_LEN}
                x2={cx + delayFrame.normal.x * DELAY_HALF_LEN}
                y2={cy + delayFrame.normal.y * DELAY_HALF_LEN}
              />
            );
          })}
        </g>
      )}
      {zigzagFrame !== undefined && (
        <polyline
          className="dg-edge-zigzag"
          points={[
            [-ZIGZAG_HALF, 4],
            [2, -2],
            [-2, 2],
            [ZIGZAG_HALF, -4],
          ]
            .map(([a, b]) => {
              const { point, tangent, normal } = zigzagFrame;
              return `${point.x + a! * tangent.x + b! * normal.x},${point.y + a! * tangent.y + b! * normal.y}`;
            })
            .join(' ')}
          fill="none"
          strokeWidth={1.75}
          stroke={look.stroke}
        />
      )}
    </>
  );
}
