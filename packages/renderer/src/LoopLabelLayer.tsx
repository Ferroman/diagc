import { useContext, useMemo } from 'react';
import { useNodes, ViewportPortal } from '@xyflow/react';
import {
  absoluteRects,
  findLoops,
  placeLoopLabels,
  type LoopEdgeInput,
  type LoopLabelPlacement,
  type NodeRect,
} from './loops';
import { LoopHighlightContext } from './loop-highlight';
import { seedFrom, sketchCircle } from './sketch';
import type { RoughStyle } from './stylePresets';

export interface LoopLabelLayerProps {
  edges: readonly LoopEdgeInput[];
  /** rough params — draw the badge outline hand-drawn (absent = crisp circle) */
  rough?: RoughStyle;
  /** view-mode node focus: when set, only render badges for loops containing
   * this node id (null/undefined = show every loop) */
  nodeFilter?: string | null;
}

const BADGE_SIZE = 48;
const CENTER = BADGE_SIZE / 2;
const CIRCLE_R = 15;
// A 270° arc from the top, sweeping clockwise to the left (large-arc, positive
// sweep — clockwise on screen since SVG's y axis points down). 'ccw' mirrors
// this path with a CSS transform instead of computing a second arc.
const ARC_PATH = `M ${CENTER} ${CENTER - CIRCLE_R} A ${CIRCLE_R} ${CIRCLE_R} 0 1 1 ${CENTER - CIRCLE_R} ${CENTER}`;

function LoopBadge({
  placement,
  rough,
  active,
  dimmed,
  onSelect,
}: {
  placement: LoopLabelPlacement;
  rough?: RoughStyle;
  active: boolean;
  dimmed: boolean;
  onSelect?: () => void;
}) {
  const sketchPaths = useMemo(
    () => (rough !== undefined ? sketchCircle(CENTER, CENTER, CIRCLE_R * 2, seedFrom(placement.key), rough) : null),
    [placement.key, rough],
  );
  const label = placement.kind === 'unknown' ? '?' : placement.kind;
  // A confident rotation arrow only makes sense once both the loop's sign
  // (kind) and its screen winding (direction) are known.
  const showArc = placement.kind !== 'unknown' && placement.direction !== 'none';
  const markerId = `dg-loop-arrow-${placement.key.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

  return (
    <div
      className={`dg-loop-badge${active ? ' active' : ''}${dimmed ? ' dimmed' : ''}`}
      data-kind={placement.kind}
      role="button"
      aria-pressed={active}
      title="Highlight this loop"
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.();
      }}
      style={{
        position: 'absolute',
        transform: `translate(${placement.x - CENTER}px, ${placement.y - CENTER}px)`,
        pointerEvents: 'auto',
      }}
    >
      <svg width={BADGE_SIZE} height={BADGE_SIZE} viewBox={`0 0 ${BADGE_SIZE} ${BADGE_SIZE}`} aria-hidden="true">
        {showArc && (
          <defs>
            <marker
              id={markerId}
              viewBox="0 0 10 10"
              refX="5"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" fill="var(--dg-text-muted)" />
            </marker>
          </defs>
        )}
        {sketchPaths !== null ? (
          <>
            {sketchPaths.fill !== '' ? (
              <path className="dg-loop-badge-fill" d={sketchPaths.fill} />
            ) : (
              // Non-solid fill styles (hachure/zigzag) put their geometry in `hatch` as
              // stroked lines with nothing in `fill` — fall back to a plain opaque disc
              // rather than rendering the hatch bucket: the badge stays a solid disc
              // under hatch-fill presets because the texture is unreadable at badge size.
              <circle className="dg-loop-badge-fill" cx={CENTER} cy={CENTER} r={CIRCLE_R} />
            )}
            <path className="dg-loop-badge-circle" d={sketchPaths.stroke} />
          </>
        ) : (
          <circle className="dg-loop-badge-circle" cx={CENTER} cy={CENTER} r={CIRCLE_R} />
        )}
        {showArc && (
          <path
            className="dg-loop-badge-arc"
            d={ARC_PATH}
            markerEnd={`url(#${markerId})`}
            {...(placement.direction === 'ccw'
              ? { style: { transform: 'scale(-1,1)', transformOrigin: `${CENTER}px ${CENTER}px` } }
              : {})}
          />
        )}
        <text x={CENTER} y={CENTER} textAnchor="middle" dominantBaseline="central">
          {label}
        </text>
      </svg>
    </div>
  );
}

/** overlay of R/B/? feedback-loop badges over the causal-loop-diagram canvas
 * (must be mounted inside <ReactFlow> — it reads node positions via the store) */
export function LoopLabelLayer({ edges, rough, nodeFilter }: LoopLabelLayerProps) {
  const { loops } = useMemo(() => findLoops(edges), [edges]);
  // View-mode node focus: show only the loops the selected node is part of.
  const shown = useMemo(
    () => (nodeFilter != null ? loops.filter((l) => l.nodes.includes(nodeFilter)) : loops),
    [loops, nodeFilter],
  );
  const loopByKey = useMemo(() => new Map(shown.map((l) => [l.key, l])), [shown]);
  const highlight = useContext(LoopHighlightContext);
  const nodes = useNodes();
  const rects = useMemo(() => absoluteRects(nodes), [nodes]);
  // Expanded containers are transparent frames a label may sit inside; only
  // leaf/collapsed nodes block a placement.
  const obstacles: NodeRect[] = useMemo(
    () =>
      nodes
        .filter((n) => (n.data as { state?: string }).state !== 'expanded')
        .map((n) => rects.get(n.id))
        .filter((r): r is NodeRect => r !== undefined),
    [nodes, rects],
  );
  // Space badges by their FULL rendered footprint (the 48px SVG, incl. the
  // direction arc), not just the R/B circle — otherwise adjacent badges' arcs
  // and boxes collide even though the circles technically clear.
  const placements = useMemo(
    () => placeLoopLabels(shown, rects, { obstacles, labelRadius: CENTER, minLabelGap: BADGE_SIZE + 8 }),
    [shown, rects, obstacles],
  );

  return (
    <ViewportPortal>
      <div className="dg-loop-layer">
        {placements.map((p) => {
          const loop = loopByKey.get(p.key);
          return (
            <LoopBadge
              key={p.key}
              placement={p}
              rough={rough}
              active={highlight.activeKey === p.key}
              dimmed={highlight.active && highlight.activeKey !== p.key}
              {...(loop !== undefined
                ? { onSelect: () => highlight.toggle(p.key, loop.nodes, loop.edgeIds) }
                : {})}
            />
          );
        })}
      </div>
    </ViewportPortal>
  );
}
