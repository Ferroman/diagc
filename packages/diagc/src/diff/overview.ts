import { THEME_HEAD_SCRIPT, THEME_SWITCH, themeCss } from '../publish/pageTheme';
import type { DiagramDiff } from './compare';
import { describeDiff } from './describe';
import type { DiagramSet } from './load';

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The colours the pictures outline a change in, which the key's swatches show. The
 * renderer draws with its own copy, `.dg-canvas`'s `--dg-diff-*` in
 * packages/renderer/src/styles.css; the CLI cannot import the renderer, so
 * overview.test.ts holds the two together.
 */
export const DIFF_MARK_COLORS = { added: '#16a34a', removed: '#dc2626', changed: '#d97706' } as const;

// The overview's two palettes. The frames are export renders and stay light in both, and
// so do the swatches of the key, which show the outline colours drawn in those pictures.
const OVERVIEW_LIGHT =
  '--bg:#fff;--card:#fff;--border:#d0d7de;--text:#1f2328;--muted:#57606a;--faint:#8c959f;' +
  '--add:#16a34a;--del:#dc2626;--chg:#b45309';
const OVERVIEW_DARK =
  '--bg:#12161b;--card:#1b222b;--border:#2d3743;--text:#e6ebf0;--muted:#a3afbb;--faint:#8b98a5;' +
  '--add:#4ade80;--del:#f87171;--chg:#fbbf24';

// The overview's own rules, after the theme's: an entry per line of the stylesheet.
const OVERVIEW_CSS = [
  'body { font: 14px/1.45 system-ui, sans-serif; margin: 0 auto; padding: 16px 24px 48px; max-width: 1800px; ' +
    'color: var(--text); background: var(--bg); }',
  'header { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }',
  'h1 { font-size: 20px; } h2 { font-size: 16px; margin: 32px 0 6px; } ' +
    'h3 { font-size: 13px; margin: 0 0 6px; color: var(--muted); }',
  'ul { margin: 0 0 12px; padding-left: 18px; font-family: ui-monospace, monospace; font-size: 12.5px; }',
  'li.add { color: var(--add); } li.del { color: var(--del); } li.chg { color: var(--chg); }',
  '.key span { display: inline-block; margin-right: 14px; } ' +
    '.key i { display: inline-block; width: 12px; height: 12px; border: 3px solid; border-radius: 3px; ' +
    'vertical-align: -2px; margin-right: 4px; }',
  '.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }',
  '.side iframe { width: 100%; height: 70vh; border: 1px solid var(--border); border-radius: 6px; }',
  '.side.empty p { height: 70vh; margin: 0; display: grid; place-items: center; ' +
    'border: 1px dashed var(--border); border-radius: 6px; color: var(--faint); }',
  '@media (max-width: 900px) { .pair { grid-template-columns: 1fr; } }',
]
  .map((line) => `  ${line}`)
  .join('\n');

/** One swatch of the key: a box with the border `style` gives it, and what that means. */
const swatch = (style: string, meaning: string): string => `<span><i style="${style}"></i>${meaning}</span>`;

const KEY = `<p class="key">${[
  swatch(`border-color:${DIFF_MARK_COLORS.added}`, 'added'),
  swatch(`border-color:${DIFF_MARK_COLORS.removed};border-style:dashed`, 'removed'),
  swatch(`border-color:${DIFF_MARK_COLORS.changed}`, 'changed'),
  swatch(
    `border-color:${DIFF_MARK_COLORS.changed};border-style:dashed`,
    'holds a change (folded box, on the linked pages)',
  ),
].join('')}</p>`;

export function indexHtml(
  diffs: readonly DiagramDiff[],
  files: Map<string, { before?: string; after?: string }>,
  before: DiagramSet,
  after: DiagramSet,
): string {
  const from = before.label;
  const to = after.label;
  // The frames load each page unfolded (`?export=1`, the PNG's own mode): side by
  // side, the whole picture is the point. The headings link the interactive pages.
  const side = (rel: string | undefined, label: string) => {
    const heading = escapeHtml(label);
    if (rel === undefined) return `<div class="side empty"><h3>${heading}</h3><p>not present</p></div>`;
    const page = `${escapeHtml(rel)}.html`;
    const frame = `<iframe src="${page}?export=1" title="${heading}"></iframe>`;
    return `<div class="side"><h3><a href="${page}">${heading}</a></h3>${frame}</div>`;
  };
  // A diagram that did not compile has no pictures, but is listed as the summary lists it.
  const sections = diffs.flatMap((d) => {
    if (d.status === 'unchanged') return [];
    if (d.status === 'error')
      return [`<section><h2>${escapeHtml(d.name)}</h2><p>Not compared: ${escapeHtml(d.error)}</p></section>`];
    const f = files.get(d.name) ?? {};
    const list = describeDiff(d)
      .map((l) => `<li class="${l[0] === '+' ? 'add' : l[0] === '-' ? 'del' : 'chg'}">${escapeHtml(l)}</li>`)
      .join('');
    const pair = `<div class="pair">${side(f.before, `Before · ${from}`)}${side(f.after, `After · ${to}`)}</div>`;
    return [`<section><h2>${escapeHtml(d.name)}</h2><ul>${list}</ul>${pair}</section>`];
  });
  const warnings = [...before.warnings, ...after.warnings];
  const notes = warnings.length === 0 ? '' : `<ul>${warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>\n`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Diagram diff ${escapeHtml(from)} → ${escapeHtml(to)}</title>
${THEME_HEAD_SCRIPT}
<style>
${themeCss(OVERVIEW_LIGHT, OVERVIEW_DARK)}
${OVERVIEW_CSS}
</style></head><body>
<header><h1>Diagram diff · ${escapeHtml(from)} → ${escapeHtml(to)}</h1>${THEME_SWITCH}</header>
${KEY}
${notes}${sections.length > 0 ? sections.join('\n') : '<p>No diagram changed.</p>'}
</body></html>
`;
}
