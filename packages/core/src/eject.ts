import type { DiagramLayer, DiagramModel, DiagramNode, DiagramPlane, DiagramRelation } from './types';

/**
 * Two-directional, non-distributive key-set equality check (mirrors
 * NodeKeyCoverage in mutate.ts): wrapping each side in a tuple `[...]`
 * defeats TS's distributive conditional types over a union, which would
 * otherwise let one missing/extra member hide behind the others in the
 * union (`true | never` normalizes to `true`).
 */
type SameKeys<A extends string, B extends string> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** JS reserved words plus the two bindings the emitted file itself declares. */
const RESERVED = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
  'delete', 'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for',
  'function', 'if', 'import', 'in', 'instanceof', 'new', 'null', 'return',
  'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var', 'void',
  'while', 'with', 'let', 'static', 'yield', 'await',
  'm', 'model',
]);

/**
 * Deterministic node-id → TS identifier assignment, first-come order.
 * Separators camelCase the following segment; an id that cannot start an
 * identifier is prefixed with 'n'; collisions and reserved words take the
 * first free numeric suffix starting at 2.
 */
export function identifiersFor(ids: readonly string[]): Map<string, string> {
  const taken = new Set<string>();
  const out = new Map<string, string>();
  for (const id of ids) {
    const segments = id.split(/[^A-Za-z0-9]+/).filter((s) => s !== '');
    let base = segments
      .map((s, i) => (i === 0 ? s : (s[0] ?? '').toUpperCase() + s.slice(1)))
      .join('');
    if (base === '' || /^[0-9]/.test(base)) base = `n${base}`;
    let ident = base;
    for (let n = 2; RESERVED.has(ident) || taken.has(ident); n++) ident = `${base}${n}`;
    taken.add(ident);
    out.set(id, ident);
  }
  return out;
}

const IDENT_KEY = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
/** How wide an inline object/array may render before it breaks across lines. */
const INLINE_LIMIT = 72;

function quote(s: string): string {
  return `'${s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')}'`;
}

/**
 * A model value as TS source. Strings single-quoted; objects/arrays inline
 * while their one-line form fits INLINE_LIMIT, multi-line (two-space steps,
 * trailing commas) beyond it. Deterministic: key order is the object's own.
 */
export function tsLiteral(value: unknown, indent: number): string {
  if (typeof value === 'string') return quote(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null) return 'null';
  const pad = '  '.repeat(indent);
  const inner = '  '.repeat(indent + 1);
  if (Array.isArray(value)) {
    const items = value.map((v) => tsLiteral(v, indent + 1));
    const inline = `[${items.join(', ')}]`;
    if (inline.length <= INLINE_LIMIT && !inline.includes('\n')) return inline;
    return `[\n${items.map((i) => `${inner}${i},`).join('\n')}\n${pad}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([k, v]) => `${IDENT_KEY.test(k) ? k : quote(k)}: ${tsLiteral(v, indent + 1)}`,
    );
    if (entries.length === 0) return '{}';
    const inline = `{ ${entries.join(', ')} }`;
    if (inline.length <= INLINE_LIMIT && !inline.includes('\n')) return inline;
    return `{\n${entries.map((e) => `${inner}${e},`).join('\n')}\n${pad}}`;
  }
  // null is handled above — it round-trips: pruneUndefined (builder.ts) strips
  // only `undefined`, so a null survives the object spread and deep-equal
  // holds. undefined never round-trips (JSON has no undefined), so it still
  // throws here; a caller that can legitimately produce it (e.g. a missing
  // required field in hand-edited JSON) must guard before calling tsLiteral.
  throw new Error(`ejectSource: cannot emit a ${typeof value} literal`);
}

function quoted(s: string): string {
  return tsLiteral(s, 0);
}

/** NodeOpts emission order — mirrors the interface declaration in builder.ts. */
const NODE_OPT_KEYS = [
  'type', 'name', 'icon', 'shape', 'image', 'color', 'textColor', 'technology',
  'description', 'rich', 'textAlign', 'fontScale', 'metadata', 'key', 'include',
  'plane', 'layer', 'columns',
] as const;

// Drift guard: a field added to DiagramNode without a matching entry above
// fails this line at `pnpm typecheck` — a future model field silently
// dropped by the emitter used to surface only as a runtime verify mismatch
// (or, pre-I2b, a crash) at eject time. `id` is emitted explicitly, ahead of
// the opts object, so it is excluded here.
const _nodeOptCoverage: SameKeys<Exclude<keyof DiagramNode, 'id'>, (typeof NODE_OPT_KEYS)[number]> = true;
void _nodeOptCoverage;

/** RelateOpts emission order (after the always-first `kind` and conditional `id`)
 * — mirrors the interface declaration in builder.ts. */
const RELATE_OPT_KEYS = [
  'label', 'labels', 'style', 'description', 'layer', 'polarity', 'delay',
  'fromColumn', 'toColumn',
] as const;

// Drift guard, same shape as _nodeOptCoverage above. `id` and `kind` are
// emitted explicitly ahead of the opts object; `from`/`to` are the node refs
// the call is built from, never opts entries — all four are excluded here.
const _relateOptCoverage: SameKeys<
  Exclude<keyof DiagramRelation, 'id' | 'from' | 'to' | 'kind'>,
  (typeof RELATE_OPT_KEYS)[number]
> = true;
void _relateOptCoverage;

/** plane() opts emission order — mirrors ModelBuilder.plane's opts parameter. */
const PLANE_OPT_KEYS = [
  'name', 'containmentOf', 'layers', 'baseRelations', 'notation', 'hides', 'hidesTree',
] as const;

// Drift guard, same shape as _nodeOptCoverage above. `id` is emitted
// explicitly, ahead of the opts object.
const _planeOptCoverage: SameKeys<Exclude<keyof DiagramPlane, 'id'>, (typeof PLANE_OPT_KEYS)[number]> = true;
void _planeOptCoverage;

/** layer() opts emission order — mirrors ModelBuilder.layer's opts parameter. */
const LAYER_OPT_KEYS = ['name', 'tint'] as const;

// Drift guard, same shape as _nodeOptCoverage above. `id` is emitted
// explicitly, ahead of the opts object.
const _layerOptCoverage: SameKeys<Exclude<keyof DiagramLayer, 'id'>, (typeof LAYER_OPT_KEYS)[number]> = true;
void _layerOptCoverage;

/** Renders a trailing options object for a call, eliding it entirely when empty. */
function opts(entries: [string, unknown][]): string {
  if (entries.length === 0) return '';
  const rendered = entries.map(([k, v]) => `${k}: ${tsLiteral(v, 1)}`);
  const inline = `{ ${rendered.join(', ')} }`;
  if (inline.length <= INLINE_LIMIT && !inline.includes('\n')) return `, ${inline}`;
  return `, {\n${rendered.map((r) => `  ${r},`).join('\n')}\n}`;
}

function nodeOpts(n: DiagramNode): [string, unknown][] {
  const out: [string, unknown][] = [];
  for (const k of NODE_OPT_KEYS) {
    if (k === 'name') {
      // A validate-clean node can lack `name` (validate() does not require
      // it, even though DiagramNode's TS type does) — a hand-edited JSON,
      // typically. Emit without a name opt rather than pushing `undefined`;
      // the builder then rebuilds `name: id`, and the deep-compare refuses
      // honestly instead of the emitter crashing.
      if (n.name !== undefined && n.name !== n.id) out.push(['name', n.name]);
      continue;
    }
    const v = (n as unknown as Record<string, unknown>)[k];
    if (v !== undefined) out.push([k, v]);
  }
  return out;
}

/**
 * The model as an idiomatic builder module. Sections in a fixed order, each in
 * model-array order — exactly what ModelBuilder.toJSON() reassembles, so the
 * emitted file reproduces the model through the builder.
 */
export function ejectSource(model: DiagramModel): string {
  const referenced = new Set<string>();
  for (const c of model.containment) {
    referenced.add(c.parent);
    referenced.add(c.child);
  }
  for (const r of model.relations) {
    referenced.add(r.from);
    referenced.add(r.to);
  }
  const idents = identifiersFor(model.nodes.filter((n) => referenced.has(n.id)).map((n) => n.id));

  const sections: string[][] = [];

  if (model.planes.length > 0)
    sections.push(
      model.planes.map((p) => {
        const o: [string, unknown][] = [];
        for (const k of PLANE_OPT_KEYS) {
          if (k === 'name') {
            if (p.name !== p.id) o.push(['name', p.name]);
            continue;
          }
          const v = (p as unknown as Record<string, unknown>)[k];
          if (v !== undefined) o.push([k, v]);
        }
        return `m.plane(${quoted(p.id)}${opts(o)});`;
      }),
    );

  if (model.layers.length > 0)
    sections.push(
      model.layers.map((l) => {
        const o: [string, unknown][] = [];
        for (const k of LAYER_OPT_KEYS) {
          if (k === 'name') {
            if (l.name !== l.id) o.push(['name', l.name]);
            continue;
          }
          const v = (l as unknown as Record<string, unknown>)[k];
          if (v !== undefined) o.push([k, v]);
        }
        return `m.layer(${quoted(l.id)}${opts(o)});`;
      }),
    );

  if (model.nodes.length > 0)
    sections.push(
      model.nodes.map((n) => {
        const ident = idents.get(n.id);
        const call = `m.node(${quoted(n.id)}${opts(nodeOpts(n))});`;
        return ident !== undefined ? `const ${ident} = ${call}` : call;
      }),
    );

  if (model.containment.length > 0) {
    const groups: { parent: string; plane: string | undefined; children: string[] }[] = [];
    for (const c of model.containment) {
      const last = groups[groups.length - 1];
      if (last !== undefined && last.parent === c.parent && last.plane === c.plane) last.children.push(c.child);
      else groups.push({ parent: c.parent, plane: c.plane, children: [c.child] });
    }
    sections.push(
      groups.map((g) => {
        const kids = g.children.map((c) => idents.get(c)!).join(', ');
        const plane = g.plane !== undefined ? `, { plane: ${quoted(g.plane)} }` : '';
        return `${idents.get(g.parent)!}.contains(${kids}${plane});`;
      }),
    );
  }

  if (model.relations.length > 0) {
    const counters = new Map<string, number>();
    sections.push(
      model.relations.map((r) => {
        const pair = `${r.from}->${r.to}`;
        const n = counters.get(pair) ?? 0;
        counters.set(pair, n + 1);
        const o: [string, unknown][] = [['kind', r.kind]];
        if (r.id !== `${pair}#${n}`) o.push(['id', r.id]);
        for (const k of RELATE_OPT_KEYS) {
          const v = (r as unknown as Record<string, unknown>)[k];
          if (v !== undefined) o.push([k, v]);
        }
        // relate() requires opts (kind is mandatory), so opts() never returns ''.
        return `m.relate(${idents.get(r.from)!}, ${idents.get(r.to)!}${opts(o)});`;
      }),
    );
  }

  const setters: string[] = [];
  if (model.typeColors !== undefined) setters.push(`m.typeColors(${tsLiteral(model.typeColors, 0)});`);
  if (model.layerRules !== undefined) setters.push(`m.layerRules(${tsLiteral(model.layerRules, 0)});`);
  if (model.legend !== undefined) setters.push(`m.legend(${tsLiteral(model.legend, 0)});`);
  if (model.notation !== undefined) setters.push(`m.notation(${quoted(model.notation)});`);
  if (model.style !== undefined) setters.push(`m.style(${quoted(model.style)});`);
  if (setters.length > 0) sections.push(setters);

  const header = `const m = model(${quoted(model.id)}${model.name !== model.id ? `, { name: ${tsLiteral(model.name, 0)} }` : ''});`;
  return [
    ["import { model } from '@diagramming/core';"],
    [header],
    ...sections,
    ['export default m;'],
  ]
    .map((s) => s.join('\n'))
    .join('\n\n')
    .concat('\n');
}
