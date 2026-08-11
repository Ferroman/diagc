export interface Size { width: number; height: number }

export function pageSize(bounds: Size, opts: { maxWidth: number; padding: number; maxHeight?: number }): Size {
  let w = Math.max(1, Math.round(bounds.width + opts.padding * 2));
  let h = Math.max(1, Math.round(bounds.height + opts.padding * 2));
  if (w > opts.maxWidth) {
    const scale = opts.maxWidth / w;
    w = opts.maxWidth;
    h = Math.max(1, Math.round(h * scale));
  }
  if (opts.maxHeight !== undefined && h > opts.maxHeight) {
    const scale = opts.maxHeight / h;
    h = opts.maxHeight;
    w = Math.max(1, Math.round(w * scale));
  }
  return { width: w, height: h };
}
