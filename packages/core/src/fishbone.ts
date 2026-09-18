import type { DiagramModel } from './types';

/** The notation id a plane (or the model) declares to be drawn as a fish. */
export const FISHBONE_NOTATION = 'fishbone' as const;
export const FB_EFFECT_TYPE = 'fb-effect' as const;
export const FB_CATEGORY_TYPE = 'fb-category' as const;
/** A cause and a sub-cause are ONE type: which it is comes from where it hangs
 * (see fishboneTree), so promoting a sub-cause is a relation edit, not a type
 * change, and nothing about a node can disagree with its place on the fish. */
export const FB_CAUSE_TYPE = 'fb-cause' as const;
export const FISHBONE_TYPES: readonly string[] = [FB_EFFECT_TYPE, FB_CATEGORY_TYPE, FB_CAUSE_TYPE];
/** The kind the builder and the studio create — from the cause TO what it
 * explains. The derivation below does NOT filter by it (see fishboneTree). */
export const FB_CAUSE_OF_KIND = 'cause-of' as const;

export const isFishboneNode = (n: { type?: string }): boolean => n.type !== undefined && FISHBONE_TYPES.includes(n.type);

export type FishbonePreset = 'Software' | '6M' | '4S';
/** Category sets an author can start from. Software first: it is what this
 * tool is mostly used for; the classic manufacturing (6M) and service (4S) sets
 * follow. The order of names is the order of bones. */
export const FISHBONE_PRESETS: Record<FishbonePreset, readonly string[]> = {
  Software: ['People', 'Process', 'Requirements', 'Code', 'Infrastructure', 'Dependencies'],
  '6M': ['Man', 'Machine', 'Method', 'Material', 'Measurement', 'Environment'],
  '4S': ['Surroundings', 'Suppliers', 'Systems', 'Skills'],
};
export const FISHBONE_PRESET_NAMES: readonly FishbonePreset[] = ['Software', '6M', '4S'];
/** node id for a preset category name: 'Infrastructure' → 'infrastructure' */
export const presetId = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export interface FishboneCause {
  id: string;
  /** sub-causes, in relation order */
  subs: string[];
}
export interface FishboneCategory {
  id: string;
  /** causes, in relation order */
  causes: FishboneCause[];
}
export interface FishboneTree {
  /** the head; absent when the model has none — with several, the first in node order (validation flags the rest) */
  effect?: string;
  /** major bones, in relation order */
  categories: FishboneCategory[];
  /** fishbone nodes NOT on the fish, in node order: no parent, a chain that never
   * reaches the effect (a cycle included), a wrong-typed parent, a fourth level,
   * a second effect. Validation says which; the layout only needs "on or off". */
  unattached: string[];
}

/**
 * The one definition of "hangs on": a fishbone node's parent is the `to` of
 * its FIRST relation (declaration order) whose other end is also a fishbone
 * node — any kind, so restyling an arrow can never drop a cause off its bone.
 * Self-loops are skipped, and a relation whose ends aren't both fishbone
 * nodes doesn't count as a parent pick. Shared by fishboneTree and
 * validateFishbone (validate.ts) so the rule is defined exactly once.
 */
export function fishboneParents(model: DiagramModel): ReadonlyMap<string, string> {
  const typeOf = new Map(model.nodes.filter(isFishboneNode).map((n) => [n.id, n.type]));
  const parentOf = new Map<string, string>();
  for (const r of model.relations) {
    if (r.from === r.to || !typeOf.has(r.from) || !typeOf.has(r.to) || parentOf.has(r.from)) continue;
    parentOf.set(r.from, r.to);
  }
  return parentOf;
}

/**
 * What hangs where. This is the ONE place that answers it, so the layout, the
 * colour hooks, the studio panel and validation cannot disagree.
 *
 * Reads a node's parent via fishboneParents, then reads the fish top-down from
 * the effect with the types checked at each level: only a category hangs on
 * the effect, only a cause on a category, only a cause on a cause, and a
 * sub-cause has no children.
 *
 * Reads the MODEL's relations, never drawn edges: toggling a layer must not
 * move a box. Never throws.
 */
export function fishboneTree(model: DiagramModel): FishboneTree {
  const nodes = model.nodes.filter(isFishboneNode);
  const typeOf = new Map(nodes.map((n) => [n.id, n.type]));
  const effect = nodes.find((n) => n.type === FB_EFFECT_TYPE)?.id;

  const parentOf = fishboneParents(model);
  // Map iteration is insertion order, so each child list is in relation order.
  const childrenOf = new Map<string, string[]>();
  for (const [child, parent] of parentOf) {
    const list = childrenOf.get(parent);
    if (list === undefined) childrenOf.set(parent, [child]);
    else list.push(child);
  }
  const kids = (id: string, type: string): string[] => (childrenOf.get(id) ?? []).filter((c) => typeOf.get(c) === type);

  const placed = new Set<string>();
  const categories: FishboneCategory[] = [];
  if (effect !== undefined) {
    placed.add(effect);
    for (const c of kids(effect, FB_CATEGORY_TYPE)) {
      placed.add(c);
      const causes: FishboneCause[] = [];
      for (const cause of kids(c, FB_CAUSE_TYPE)) {
        placed.add(cause);
        const subs = kids(cause, FB_CAUSE_TYPE);
        for (const s of subs) placed.add(s);
        causes.push({ id: cause, subs });
      }
      categories.push({ id: c, causes });
    }
  }
  return {
    ...(effect !== undefined ? { effect } : {}),
    categories,
    unattached: nodes.map((n) => n.id).filter((id) => !placed.has(id)),
  };
}
