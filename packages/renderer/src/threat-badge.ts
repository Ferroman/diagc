/** open/total STRIDE threats on one element — the shape `buildNodeData` and
 * `buildEdgeData` both put on the render data under `threats`. */
export interface ThreatCounts {
  open: number;
  total: number;
}

export interface ThreatBadgeProps {
  /** red while anything is open, green once every threat is handled */
  state: 'open' | 'handled';
  /** the number still open, or a tick once none is */
  text: string;
  /** the hover line */
  title: string;
}

/**
 * What a threat badge *says*, derived once for the two places that draw one: a
 * node's corner badge (`DiagramNode`) and a flow's chip (`DiagramEdge`). Only
 * the derivation is shared — the two elements live in different layers (the
 * node's own box, React Flow's edge-label portal) and stay where they are.
 *
 * The wording is exactly what has to be shared: the same counts reading
 * `1 open of 1 threats` on an arrow and something else on a box is the kind of
 * drift nobody files a bug about and everybody notices.
 */
export function threatBadgeProps({ open, total }: ThreatCounts): ThreatBadgeProps {
  return {
    state: open > 0 ? 'open' : 'handled',
    text: open > 0 ? String(open) : '✓',
    // `1 threat`, not `1 threats` — the badge is read at a glance, and a plural
    // that does not agree is the first thing the eye trips on.
    title: `${open} open of ${total} threat${total === 1 ? '' : 's'}`,
  };
}
