// Named legendRows (not legend) so its filename doesn't collide with Legend.tsx
// under esbuild's case-insensitive directory-entry resolution: esbuild warns
// on `legend.ts`/`Legend.tsx` coexisting ("different-path-case") but then
// resolves an extensionless `./legend` import to whichever of the two its
// case-folded directory cache hits first, which can silently pick the wrong
// file (or hard-error when the wrong file lacks the expected export) —
// reordering resolveExtensions does not help, since it only shifts which of
// the two same-named imports breaks. Vite/tsc resolve both files correctly;
// only apps/obsidian's esbuild bundle (the only whole-graph esbuild consumer
// of this package) is affected — that's where this surfaced.
import {
  buildHierarchy,
  relationLayer,
  scopeToRoot,
  type CompiledView,
  type DiagramLegend,
  type DiagramModel,
  type DiagramNode,
  type DiagramPlane,
  type DiagramRelation,
  type LegendItem,
  type LegendSection,
  type ViewNode,
} from '@diagramming/core';
import { DEFAULT_KIND_STYLES, DEFAULT_TYPE_STYLES, type KindStyle, type Registry, type TypeStyle } from './registry';

/** `draw` is the discriminant — deliberately not `kind`, which already means
 * "relation kind" throughout this module. */
export type LegendSwatch =
  | { draw: 'line'; style: KindStyle; color?: string }
  | { draw: 'shape'; style: TypeStyle; color?: string; icon?: string }
  | { draw: 'chip'; color: string };

export interface LegendRow {
  /** `${section}:${key}` — stable and unique within the returned list */
  id: string;
  section: LegendSection | 'items';
  label: string;
  swatch?: LegendSwatch;
  /** layer rows only: the layer id to toggle */
  layer?: string;
  /** layer rows only */
  active?: boolean;
  /** the freehand-drawings row (not a model layer) */
  drawings?: true;
}

export interface LegendInput {
  model: DiagramModel;
  compiled: CompiledView;
  /** the active plane object (not its id); absent = the implicit single plane */
  plane?: DiagramPlane;
  /** the drill root, when the view is scoped to one node's interior; mirrors
   *  `ViewportState.root` */
  root?: string;
  /** the host's layer choice, or ABSENT when it has none — in which case the
   *  plane's `layers` presets apply. Exactly `ViewportState.activeLayers`, and it
   *  must be passed through with the same nullability: coercing undefined to []
   *  here tells the legend "nothing is on" while compileView draws the presets. */
  activeLayers?: string[];
  /** already notation-composed by the caller (see DiagramView) */
  typeRegistry: Registry<TypeStyle>;
  kindRegistry: Registry<KindStyle>;
  config: DiagramLegend;
  /** can the reader switch layers on and off? False on a published page and in
   *  an export, where inactive layers are omitted rather than greyed — a greyed
   *  row nothing can un-grey is noise, not information. NOT the same question as
   *  "is chrome shown": a chrome-less host can still supply a toggle handler. */
  canToggleLayers: boolean;
  /** present when the active plane has strokes: the Drawings row and whether it is on */
  drawings?: { active: boolean };
}

const DEFAULT_SECTIONS: readonly LegendSection[] = ['layers', 'kinds'];

/** Registry key order first (an authored, meaningful order), then unknown ids
 * alphabetically. Deliberately NOT first-appearance order: that would reshuffle
 * the legend every time a group folded. */
function orderByRegistry(ids: string[], known: readonly string[]): string[] {
  const rank = new Map(known.map((k, i) => [k, i] as const));
  return [...ids].sort((a, b) => {
    const ra = rank.get(a);
    const rb = rank.get(b);
    if (ra !== undefined && rb !== undefined) return ra - rb;
    if (ra !== undefined) return -1;
    if (rb !== undefined) return 1;
    return a.localeCompare(b);
  });
}

/**
 * The nodes and relations this view could draw, resolved exactly the way
 * `compileView` resolves them — never approximated. Two traps live here:
 *
 * - Containment is decided by the DONOR plane when this one borrows it, which is
 *   why the viewport plane goes to `buildHierarchy` and `buildHierarchy` resolves
 *   `containmentOf` itself: filtering this model's containment by the borrowing
 *   plane's own id instead drops every node it has, and with them the layer rows
 *   for arrows that are, visibly, on screen. A `node.plane` scope is matched
 *   against the donor; `hides` is the borrower's own when it declares one.
 * - A drill view draws only the root's interior plus external stubs, so it is
 *   `scopeToRoot` that decides membership there.
 *
 * Deliberately NOT layer-filtered (no `activeLayers` to `buildHierarchy`):
 * relevance is model-derived so that a node-only layer, absent from the compiled
 * view precisely because it is off, still gets a row and therefore a switch.
 */
function drawableSlice(input: LegendInput): {
  nodes: readonly DiagramNode[];
  relations: readonly DiagramRelation[];
} {
  const m = input.model;
  const hierarchy = buildHierarchy(m, input.plane?.id);
  if (input.root !== undefined && hierarchy.childrenOf.has(input.root)) {
    // Same guard and same call compileView's drill branch makes. A stub node
    // carries no `layer` (scopeToRoot copies only visual identity), so a layer
    // that tags nothing but an off-frame node correctly leaves the key: toggling
    // it here would change nothing on screen.
    const { model: scoped } = scopeToRoot(m, hierarchy, input.root);
    return { nodes: scoped.nodes, relations: scoped.relations };
  }
  const visible = new Set(hierarchy.childrenOf.keys());
  return {
    nodes: m.nodes.filter((n) => visible.has(n.id)),
    relations: m.relations.filter((r) => visible.has(r.from) && visible.has(r.to)),
  };
}

/** Layer ids something drawable carries. Computed from the MODEL, not the
 * compiled view: a node on an inactive layer is absent from `compiled.roots`, so
 * a node-only layer would never be listed and therefore never be switchable. */
function relevantLayerIds(input: LegendInput): Set<string> {
  const { nodes, relations } = drawableSlice(input);
  const ids = new Set<string>();
  for (const n of nodes) if (n.layer !== undefined) ids.add(n.layer);
  // The EFFECTIVE layer — a relation the model's `layerRules` place on a layer
  // counts for that layer's row exactly as one tagged by hand does.
  for (const r of relations) {
    const l = relationLayer(input.model, r);
    if (l !== undefined) ids.add(l);
  }
  return ids;
}

function layerRows(input: LegendInput): LegendRow[] {
  const relevant = relevantLayerIds(input);
  // Exactly compileView's rule, and it must stay exactly it: an absent
  // `activeLayers` falls back to the plane's presets, a present one (even empty)
  // replaces them. This used to union the two, which is how a layer the plane
  // presets came up ON in the key while the host's own switch reported it off.
  const active = new Set(input.activeLayers ?? input.plane?.layers ?? []);
  const out: LegendRow[] = [];
  for (const l of input.model.layers) {
    if (!relevant.has(l.id)) continue;
    const on = active.has(l.id);
    if (!on && !input.canToggleLayers) continue;
    out.push({
      id: `layers:${l.id}`,
      section: 'layers',
      label: l.name,
      swatch: { draw: 'chip', color: l.tint ?? 'var(--dg-edge)' },
      layer: l.id,
      active: on,
    });
  }
  return out;
}

function kindRows(input: LegendInput): LegendRow[] {
  // The canvas strokes an edge with `rel.color ?? tint ?? var(--dg-edge)`
  // (DiagramEdge), and `KindStyle` carries no colour at all — so a swatch built
  // from the registry alone renders grey next to a blue layer arrow. Lift the
  // tint when every drawn edge of the kind agrees on one; when they disagree, or
  // any is on the untinted base sheet, leave it unset rather than guess.
  const tints = new Map<string, string | undefined>();
  const kinds: string[] = [];
  for (const e of input.compiled.edges) {
    if (!tints.has(e.kind)) {
      kinds.push(e.kind);
      tints.set(e.kind, e.tint);
    } else if (tints.get(e.kind) !== e.tint) {
      tints.set(e.kind, undefined);
    }
  }
  // Ranked against DEFAULT_KIND_STYLES' keys, not `input.kindRegistry`: a
  // `Registry` resolves ids but enumerates none, so the live (notation-composed)
  // order is not readable from here. The cost is that a notation profile's own
  // kinds rank as unknown and sort alphabetically after the built-ins instead of
  // in the profile's declared order — an approximation, but a stable one, which
  // is the property that matters (see orderByRegistry).
  return orderByRegistry(kinds, Object.keys(DEFAULT_KIND_STYLES)).map((k) => {
    const tint = tints.get(k);
    return {
      id: `kinds:${k}`,
      section: 'kinds' as const,
      label: k,
      swatch: {
        draw: 'line' as const,
        style: input.kindRegistry.resolve(k),
        ...(tint !== undefined ? { color: tint } : {}),
      },
    };
  });
}

function typeRows(input: LegendInput): LegendRow[] {
  const types = new Set<string>();
  const walk = (nodes: ViewNode[]): void => {
    for (const v of nodes) {
      if (v.node.type !== undefined) types.add(v.node.type);
      walk(v.children);
    }
  };
  walk(input.compiled.roots);
  return orderByRegistry([...types], Object.keys(DEFAULT_TYPE_STYLES)).map((t) => {
    const style = input.typeRegistry.resolve(t);
    // Some registry entries set `label: ''` to suppress the node's own subtitle
    // (the activity leaf shapes read fine unlabeled on the canvas) — that empty
    // string is not a legend caption, so an opt-in types legend must still fall
    // back to the type id rather than render a blank swatch row.
    const label = style.label;
    return {
      id: `types:${t}`,
      section: 'types' as const,
      label: label === undefined || label === '' ? t : label,
      swatch: {
        draw: 'shape' as const,
        style,
        ...(style.icon !== undefined ? { icon: style.icon } : {}),
      },
    };
  });
}

function swatchOf(item: LegendItem, input: LegendInput): LegendSwatch | undefined {
  if (item.kind !== undefined) {
    return { draw: 'line', style: input.kindRegistry.resolve(item.kind), ...(item.color !== undefined ? { color: item.color } : {}) };
  }
  if (item.type !== undefined) {
    const style = input.typeRegistry.resolve(item.type);
    const icon = item.icon ?? style.icon;
    return {
      draw: 'shape',
      style,
      ...(item.color !== undefined ? { color: item.color } : {}),
      ...(icon !== undefined ? { icon } : {}),
    };
  }
  if (item.color !== undefined) return { draw: 'chip', color: item.color };
  return undefined;
}

/** The tracing-paper switch, listed with the layers because that is where a
 * reader looks for "what can I turn off". Not a model layer, so it is namespaced
 * with a `$`: `validate()` puts no character rule on a layer id (KEY_PATTERN
 * governs `node.key` only), so a collision is merely improbable rather than
 * impossible — the `$` keeps a layer literally named `drawings` from sharing
 * this row's React key. Routing does not depend on the id either way: Legend
 * dispatches on `row.drawings === true`, not on a string match. */
function drawingsRow(input: LegendInput): LegendRow[] {
  if (input.drawings === undefined) return [];
  return [
    {
      id: 'layers:$drawings',
      section: 'layers',
      label: 'Drawings',
      swatch: { draw: 'line', style: { width: 2.5 }, color: 'var(--dg-ink)' },
      drawings: true,
      active: input.drawings.active,
    },
  ];
}

export function legendRows(input: LegendInput): LegendRow[] {
  const sections = input.config.show ?? DEFAULT_SECTIONS;
  const derived: LegendRow[] = [
    ...(sections.includes('layers') ? [...layerRows(input), ...drawingsRow(input)] : []),
    ...(sections.includes('kinds') ? kindRows(input) : []),
    ...(sections.includes('types') ? typeRows(input) : []),
  ];
  const extras: LegendRow[] = [];
  (input.config.items ?? []).forEach((item, i) => {
    // An item naming an already-derived kind/type renames that row in place,
    // keeping its position and its real swatch — that is how you caption
    // 'async' as 'fire-and-forget event' without maintaining the list.
    const targetId =
      item.kind !== undefined ? `kinds:${item.kind}` : item.type !== undefined ? `types:${item.type}` : undefined;
    const hit = targetId !== undefined ? derived.find((r) => r.id === targetId) : undefined;
    if (hit !== undefined) {
      hit.label = item.label;
      if (item.color !== undefined && hit.swatch !== undefined && hit.swatch.draw !== 'chip') {
        hit.swatch = { ...hit.swatch, color: item.color };
      }
      // An icon only means anything on a shape swatch, but it must survive the
      // recaption path too — otherwise `{ label, type, icon }` silently loses
      // the icon precisely when the type already had a derived row.
      if (item.icon !== undefined && hit.swatch !== undefined && hit.swatch.draw === 'shape') {
        hit.swatch = { ...hit.swatch, icon: item.icon };
      }
      return;
    }
    const swatch = swatchOf(item, input);
    extras.push({
      id: `items:${i}`,
      section: 'items',
      label: item.label,
      ...(swatch !== undefined ? { swatch } : {}),
    });
  });
  return [...derived, ...extras];
}
