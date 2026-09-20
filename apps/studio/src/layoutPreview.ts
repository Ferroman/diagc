import { layoutPlaneKey, type DiagramModel, type LayoutOverlay, type LayoutSettings } from '@diagc/core';

/**
 * Merge a settings patch into one plane's preview. A field set to `undefined`
 * clears it, and a plane left with no fields drops out of the record entirely —
 * so "is anything previewed here?" stays a plain key lookup, which is what the
 * Reset chip's visibility keys off.
 */
export function mergePreview(
  preview: Record<string, LayoutSettings>,
  key: string,
  patch: Partial<LayoutSettings>,
): Record<string, LayoutSettings> {
  const next: LayoutSettings = { ...preview[key] };
  for (const [field, value] of Object.entries(patch)) {
    if (value === undefined) delete next[field as keyof LayoutSettings];
    else (next as Record<string, unknown>)[field] = value;
  }
  const out = { ...preview };
  if (Object.keys(next).length === 0) delete out[key];
  else out[key] = next;
  return out;
}

/**
 * Overlay a viewer's momentary layout choice on the diagram's own sidecar.
 *
 * Composition, not replacement: a hand-written `direction: DOWN` stays the
 * baseline and picking Force overrides only `algorithm`.
 *
 * Returns `layout` UNCHANGED when there is nothing to preview. That identity
 * matters — DiagramView memoizes its layout settings on the layout object
 * (DiagramView.tsx:536), and handing it a fresh object every render would
 * invalidate that memo and re-run elk on every render.
 */
export function withLayoutPreview(
  layout: LayoutOverlay | undefined,
  model: DiagramModel | undefined,
  plane: string | undefined,
  preview: Record<string, LayoutSettings>,
): LayoutOverlay | undefined {
  if (model === undefined) return layout;
  const key = layoutPlaneKey(model, plane);
  const patch = preview[key];
  if (patch === undefined || Object.keys(patch).length === 0) return layout;
  const base: LayoutOverlay = layout ?? { version: 1, planes: {} };
  return {
    ...base,
    settings: { ...base.settings, [key]: { ...base.settings?.[key], ...patch } },
  };
}
