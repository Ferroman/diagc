/** An axis-aligned box in ABSOLUTE flow coordinates — the shape the pure
 * geometry helpers (guides, arrange) work on. Parent-relative positions are
 * converted at the DiagramView boundary and never enter these modules. */
export interface Box {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}
