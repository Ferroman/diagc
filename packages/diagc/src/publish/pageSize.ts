export interface Size { width: number; height: number }

/**
 * The capture frame for a diagram: the content at the largest scale that fits
 * the caps, plus padding, plus an unscaled `reserve` for the legend.
 *
 * `reserve` is in SCREEN px and is deliberately NOT part of `bounds`. The
 * content is scaled to fit the frame; the legend is a fixed-size overlay and is
 * not. Adding the legend's height to `bounds.height` shrinks it by the same
 * factor as the graph, so the frame comes out short by `reserve * (1 - scale)`
 * — and the fit, which still pays the legend in full, draws the graph at a
 * fraction of the intended size with the rest of the frame left blank.
 */
export function pageSize(
  bounds: Size,
  opts: { maxWidth: number; padding: number; maxHeight?: number; reserve?: number },
): Size {
  const pad = opts.padding * 2;
  // Cap the reserve at half the frame, mirroring the viewer's legendPadding: a
  // legend taller than the frame must not leave the graph nothing to sit in.
  const reserve =
    opts.maxHeight === undefined
      ? Math.max(0, opts.reserve ?? 0)
      : Math.min(Math.max(0, opts.reserve ?? 0), Math.floor(opts.maxHeight / 2));
  const fit = (avail: number, extent: number): number => (extent <= 0 ? 1 : avail / extent);
  const scale = Math.min(
    1, // never upscale: a small diagram is captured at 1:1, as it always was
    fit(opts.maxWidth - pad, bounds.width),
    opts.maxHeight === undefined ? 1 : fit(opts.maxHeight - pad - reserve, bounds.height),
  );
  return {
    width: Math.max(1, Math.round(bounds.width * scale) + pad),
    height: Math.max(1, Math.round(bounds.height * scale) + pad + reserve),
  };
}
