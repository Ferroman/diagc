/** What an outline is drawn in — a C4 boundary, an AWS group: a line and a
 * title straight on the canvas, with no fill of the node's own behind them. So
 * a colour written for a white page can vanish on the dark canvas, and the
 * theme says how much of it survives: --dg-outline-ink (ThemeTokens.outlineInk)
 * is the share kept, the rest mixed toward --dg-text. Light keeps all of it,
 * which is today's look unchanged. The literal 100% covers a host that applies
 * no theme.
 * A theme token is left alone — a deployment zone's `var(--dg-deploy-…)` is
 * already the theme's colour, with a dark value of its own, and a second lift
 * would wash it out.
 * The legend draws an outline type's swatch through the same function, so the
 * sample stays the colour of the box it describes. */
export const outlineInk = (color: string): string =>
  color.startsWith('var(') ? color : `color-mix(in srgb, ${color} var(--dg-outline-ink, 100%), var(--dg-text))`;
