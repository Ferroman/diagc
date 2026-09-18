import type { CompiledView, ViewNode } from '@diagramming/core';

/**
 * Which parts of a view can be arranged independently of everything else.
 *
 * elk's layered algorithm has to run the whole tree as ONE graph
 * (`INCLUDE_CHILDREN`) for an edge to see through a container wall — and in that
 * mode it never packs connected components. Anything without an incoming edge
 * simply joins the first layer, so unrelated boxes pile into a single column at
 * every level: the root, and the inside of every container.
 *
 * The plan finds, per level, the groups of siblings no layout edge ties to the
 * rest (`detached`). `layoutView` arranges each such group on its own and packs
 * them (pack.ts); inside a container that an outside edge does reach, the packed
 * block goes back into the run as one fixed-size box, so elk still places it
 * relative to the connected part.
 *
 * Connectivity is read from `layoutEdges` — every relation, including the ones a
 * layer currently hides — for the same reason elk lays out against them:
 * toggling a layer must never move a box.
 */
export interface LevelPlan {
  /** children an edge ties to something outside this level: they stay in the
   * enclosing elk run. Empty when no edge crosses the level's wall (always so
   * for the root) — then the whole inside is arranged separately. */
  attached: ViewNode[];
  /** groups of children connected among themselves and to nothing else, in
   * model order (by each group's first member) */
  detached: ViewNode[][];
}

export interface LayoutPlan {
  /** level owner (`null` = the root graph) → its plan. Only levels with
   * something to pack appear: an absent level is laid out exactly as before. */
  levels: Map<string | null, LevelPlan>;
}

/** stands for "everything outside this level" in a level's union-find */
const OUTSIDE = Symbol('outside');

export function planLayout(view: CompiledView): LayoutPlan {
  // root-first ancestor chain per visible node, itself included
  const chains = new Map<string, string[]>();
  const index = (n: ViewNode, above: string[]) => {
    const chain = [...above, n.id];
    chains.set(n.id, chain);
    if (n.state === 'expanded') n.children.forEach((c) => index(c, chain));
  };
  view.roots.forEach((r) => index(r, []));

  // Per level, the pairs an edge unites: two of the level's children, or a child
  // and the outside. One pass over the edges; each edge touches only the levels
  // on its two ancestor chains.
  const unions = new Map<string | null, [string, string | typeof OUTSIDE][]>();
  const unite = (level: string | null, a: string, b: string | typeof OUTSIDE) => {
    const list = unions.get(level) ?? [];
    list.push([a, b]);
    unions.set(level, list);
  };
  for (const e of view.layoutEdges) {
    const a = chains.get(e.from);
    const b = chains.get(e.to);
    if (a === undefined || b === undefined || e.from === e.to) continue;
    let shared = 0;
    while (shared < a.length && shared < b.length && a[shared] === b[shared]) shared++;
    // At the level where the chains part, the edge joins two siblings.
    const parted = shared < a.length && shared < b.length;
    if (parted) unite(shared === 0 ? null : a[shared - 1]!, a[shared]!, b[shared]!);
    // Below the parting level each chain runs on alone through its own
    // containers, and the edge crosses the wall of every one of them: the child
    // it passes through at that level is tied to the outside.
    //
    // When the chains never part, one endpoint IS the other's ancestor (a
    // container → its own descendant). The ancestor's wall is crossed too — its
    // other end sits ON the wall, not inside it — so the walk starts one level
    // higher, at the ancestor itself.
    const from = parted ? shared : shared - 1;
    for (const chain of [a, b]) {
      for (let i = from; i < chain.length - 1; i++) unite(chain[i]!, chain[i + 1]!, OUTSIDE);
    }
  }

  const levels = new Map<string | null, LevelPlan>();
  const planLevel = (owner: string | null, children: readonly ViewNode[]) => {
    if (children.length >= 2) {
      const parent = new Map<string | typeof OUTSIDE, string | typeof OUTSIDE>();
      const find = (x: string | typeof OUTSIDE): string | typeof OUTSIDE => {
        let root = x;
        while (parent.get(root) !== undefined && parent.get(root) !== root) root = parent.get(root)!;
        return root;
      };
      for (const [x, y] of unions.get(owner) ?? []) parent.set(find(x), find(y));

      const outside = find(OUTSIDE);
      const attached: ViewNode[] = [];
      const groups = new Map<string | typeof OUTSIDE, ViewNode[]>();
      for (const c of children) {
        const root = find(c.id);
        if (root === outside) attached.push(c);
        else groups.set(root, [...(groups.get(root) ?? []), c]);
      }
      // One loose group inside an otherwise connected level is what elk already
      // handles — a single box, or chain, parked in the first layer. Packing
      // earns its keep from the second group on.
      if (groups.size >= 2) levels.set(owner, { attached, detached: [...groups.values()] });
    }
    for (const c of children) if (c.state === 'expanded') planLevel(c.id, c.children);
  };
  planLevel(null, view.roots);
  return { levels };
}
