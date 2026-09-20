import { DEFAULT_STROKE_WIDTH, type Stroke } from '@diagc/core';

/** SVG `d` for a flat point list. Midpoint-quadratic smoothing: each interior
 * point is a control point and the curve passes through segment midpoints, which
 * reads as a pen line at any zoom without a fitting pass. A single point draws
 * a zero-length segment — round caps turn it into a dot. */
export function strokePath(points: number[]): string {
  const n = points.length / 2;
  if (n === 0) return '';
  const x = (i: number): number => points[2 * i]!;
  const y = (i: number): number => points[2 * i + 1]!;
  if (n === 1) return `M ${x(0)} ${y(0)} L ${x(0)} ${y(0)}`;
  if (n === 2) return `M ${x(0)} ${y(0)} L ${x(1)} ${y(1)}`;
  const parts = [`M ${x(0)} ${y(0)}`];
  for (let i = 1; i < n - 1; i++) {
    parts.push(`Q ${x(i)} ${y(i)} ${(x(i) + x(i + 1)) / 2} ${(y(i) + y(i + 1)) / 2}`);
  }
  parts.push(`L ${x(n - 1)} ${y(n - 1)}`);
  return parts.join(' ');
}

/** Ramer–Douglas–Peucker on a flat point list, in flow units. Run once at
 * pointer-up: pointer events arrive at 60–120 Hz, and a sidecar of raw samples
 * would be ten times the size for no visible difference. */
export function simplifyStroke(points: number[], epsilon = 0.75): number[] {
  const n = points.length / 2;
  if (n <= 2) return points;
  const keep = new Array<boolean>(n).fill(false);
  keep[0] = true;
  keep[n - 1] = true;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length > 0) {
    const [a, b] = stack.pop()!;
    const ax = points[2 * a]!, ay = points[2 * a + 1]!, bx = points[2 * b]!, by = points[2 * b + 1]!;
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy);
    let worst = -1, worstDist = epsilon;
    for (let i = a + 1; i < b; i++) {
      const px = points[2 * i]!, py = points[2 * i + 1]!;
      const dist = len === 0 ? Math.hypot(px - ax, py - ay) : Math.abs(dy * px - dx * py + bx * ay - by * ax) / len;
      if (dist > worstDist) { worst = i; worstDist = dist; }
    }
    if (worst !== -1) { keep[worst] = true; stack.push([a, worst], [worst, b]); }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(points[2 * i]!, points[2 * i + 1]!);
  return out;
}

/** Bounding box of the strokes, padded by half of each stroke's width so the
 * export frame includes the ink's edge, not just its centreline. */
export function strokesBounds(
  strokes: readonly Stroke[],
): { x: number; y: number; width: number; height: number } | undefined {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of strokes) {
    const pad = (s.width ?? DEFAULT_STROKE_WIDTH) / 2;
    for (let i = 0; i < s.points.length; i += 2) {
      const x = s.points[i]!, y = s.points[i + 1]!;
      minX = Math.min(minX, x - pad); maxX = Math.max(maxX, x + pad);
      minY = Math.min(minY, y - pad); maxY = Math.max(maxY, y + pad);
    }
  }
  if (minX === Infinity) return undefined;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
