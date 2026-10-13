import type { DiagramModel } from '@diagc/core/internal';
import type { Registry, TypeStyle } from '../registry';
import type { StylePreset } from '../sketch/stylePresets';

/** A palette preset's colouring of one model: its colours and each node type's slot in them. */
export interface TypeHues {
  palette: readonly string[];
  /** type id → index into `palette`, wrapping */
  slots: ReadonlyMap<string, number>;
}

/** Each node type's palette slot, by first appearance — the types of nodes that
 * contain nothing first: those are the boxes a reader sees, so they get the
 * palette's lead colours, while a container's type only shows when it is
 * folded. Types the registry fills alike share a slot, so a notation's own
 * grouping survives (every kind of C4 container is one colour). Counted over
 * the whole model, not the view, so drilling in or switching planes never
 * recolours a box. */
export function typeSlots(
  model: Pick<DiagramModel, 'nodes' | 'containment'>,
  registry: Registry<TypeStyle>,
): Map<string, number> {
  const parents = new Set(model.containment.map((e) => e.parent));
  const ordered = [...model.nodes.filter((n) => !parents.has(n.id)), ...model.nodes.filter((n) => parents.has(n.id))];
  const byKey = new Map<string, number>();
  const slots = new Map<string, number>();
  for (const n of ordered) {
    if (n.type === undefined || slots.has(n.type)) continue;
    const key = registry.resolve(n.type).fill ?? `type:${n.type}`;
    const slot = byKey.get(key) ?? byKey.size;
    byKey.set(key, slot);
    slots.set(n.type, slot);
  }
  return slots;
}

/** The preset's colouring of a model; undefined for a preset without a palette. */
export function typeHuesOf(
  preset: StylePreset,
  model: Pick<DiagramModel, 'nodes' | 'containment'>,
  registry: Registry<TypeStyle>,
): TypeHues | undefined {
  if (preset.palette === undefined || preset.palette.length === 0) return undefined;
  return { palette: preset.palette, slots: typeSlots(model, registry) };
}

/** A box's hue under a palette preset: its accent as the author or the notation
 * set it, else its type's palette colour; nothing for an untyped box. */
export function nodeHue(type: string | undefined, accent: string | undefined, hues: TypeHues): string | undefined {
  if (accent !== undefined) return accent;
  const slot = type !== undefined ? hues.slots.get(type) : undefined;
  return slot !== undefined ? hues.palette[slot % hues.palette.length] : undefined;
}

/** Black or white, whichever reads on a `#rgb` / `#rrggbb` hue (the look that
 * fills boxes solid needs it for an author's dark colour); undefined for any
 * other colour syntax, where the look's own text colour stands. */
export function hueInk(hue: string): '#000' | '#fff' | undefined {
  const digits = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hue)?.[1];
  if (digits === undefined) return undefined;
  const hex = digits.length === 3 ? [...digits].map((c) => c + c).join('') : digits;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  // 0.179 is the luminance at which black and white text contrast equally
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179 ? '#000' : '#fff';
}
