/** Compose the type subtitle with an optional technology: `[Container]` +
 * `Java/Spring` → `[Container: Java/Spring]`. An empty label stays empty —
 * glyph types (bars, dots) suppress their subtitle entirely and a technology
 * must not resurrect it. */
export function typeSubtitle(label: string, technology?: string): string {
  if (technology === undefined || label === '') return label;
  return label.endsWith(']') ? `${label.slice(0, -1)}: ${technology}]` : `${label}: ${technology}`;
}
