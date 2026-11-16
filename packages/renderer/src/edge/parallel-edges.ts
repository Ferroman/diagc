import type { BowSide, EdgeShape } from './edge-geometry';

/** how much further out each further edge between one pair of nodes bows (px) */
export const PARALLEL_STEP = 32;

/**
 * How far each edge that shares its two nodes with another bows off the straight
 * line, in px: positive to the left of its own travel, negative to the right. A
 * floating edge runs between the borders that face the other node, so two of
 * them between the same pair would draw one curve with their labels on top of
 * each other. The edges of a pair, in edge order and whichever way each runs,
 * take the slots 0, +k, -k, +2k, -2k, … measured on one side of the pair, then
 * turned into the edge's own frame. Slot 0, a lone edge and a self-loop are
 * left out, so they draw exactly as before.
 */
export function parallelBows(edges: readonly { id: string; from: string; to: string }[]): Map<string, number> {
  const pairs = new Map<string, { id: string; forward: boolean }[]>();
  for (const e of edges) {
    if (e.from === e.to) continue;
    const forward = e.from < e.to;
    const key = forward ? `${e.from}\0${e.to}` : `${e.to}\0${e.from}`;
    const pair = pairs.get(key) ?? [];
    pair.push({ id: e.id, forward });
    pairs.set(key, pair);
  }
  const bows = new Map<string, number>();
  for (const pair of pairs.values()) {
    pair.forEach(({ id, forward }, slot) => {
      if (slot === 0) return;
      const onPair = Math.ceil(slot / 2) * PARALLEL_STEP * (slot % 2 === 1 ? 1 : -1);
      bows.set(id, forward ? onPair : -onPair);
    });
  }
  return bows;
}

/** the control-point offset that puts a bow's crown `bow` px off the line (a
 * cubic whose two inner points sit `h` out peaks at three quarters of `h`) */
export const parallelBulge = (bow: number): number => (Math.abs(bow) * 4) / 3;

/**
 * Whether a floating edge bows, to which side and by how much (undefined: what its
 * curvature gives). A notation that bows its edges keeps its own bow: its two
 * directions already bow apart, and `bow` parts a same-way pair. Otherwise an
 * edge sharing its pair bows by its own amount, so the two stop drawing one
 * curve. A straight or step line stays as asked.
 */
export function bowOf(edge: {
  shape: EdgeShape;
  profileBows: boolean;
  side: BowSide | undefined;
  parallelBow: number | undefined;
}): { bowed: boolean; side: BowSide; bulge: number | undefined } {
  const curved = edge.shape === 'curved';
  const parallel = curved && !edge.profileBows ? (edge.parallelBow ?? 0) : 0;
  if (parallel !== 0) return { bowed: true, side: parallel > 0 ? 'left' : 'right', bulge: parallelBulge(parallel) };
  return { bowed: curved && edge.profileBows, side: edge.side ?? 'left', bulge: undefined };
}
