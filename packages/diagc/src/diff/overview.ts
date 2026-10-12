import { THEME_HEAD_SCRIPT, THEME_SWITCH, themeCss } from '../publish/pageTheme';
import type { DiagramDiff } from './compare';
import { describeDiff } from './describe';
import type { DiagramSet } from './load';

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// The frames load each page unfolded (`?export=1`, the PNG's own mode): side by
// side, the whole picture is the point. The headings link the interactive pages.
// The overview's two palettes. The frames are export renders and stay light in both, and
// so do the swatches of the key, which show the outline colours drawn in those pictures.
const OVERVIEW_LIGHT =
  '--bg:#fff;--card:#fff;--border:#d0d7de;--text:#1f2328;--muted:#57606a;--faint:#8c959f;--add:#16a34a;--del:#dc2626;--chg:#b45309';
const OVERVIEW_DARK =
  '--bg:#12161b;--card:#1b222b;--border:#2d3743;--text:#e6ebf0;--muted:#a3afbb;--faint:#8b98a5;--add:#4ade80;--del:#f87171;--chg:#fbbf24';

export function indexHtml(
  diffs: readonly DiagramDiff[],
  files: Map<string, { before?: string; after?: string }>,
  before: DiagramSet,
  after: DiagramSet,
): string {
  const from = before.label;
  const to = after.label;
  const side = (rel: string | undefined, label: string) =>
    rel === undefined
      ? `<div class="side empty"><h3>${escapeHtml(label)}</h3><p>not present</p></div>`
      : `<div class="side"><h3><a href="${escapeHtml(rel)}.html">${escapeHtml(label)}</a></h3><iframe src="${escapeHtml(rel)}.html?export=1" title="${escapeHtml(label)}"></iframe></div>`;
  // A diagram that did not compile has no pictures, but is listed as the summary lists it.
  const sections = diffs.flatMap((d) => {
    if (d.status === 'unchanged') return [];
    if (d.status === 'error')
      return [`<section><h2>${escapeHtml(d.name)}</h2><p>Not compared: ${escapeHtml(d.error ?? '')}</p></section>`];
    const f = files.get(d.name) ?? {};
    const list = describeDiff(d)
      .map((l) => `<li class="${l[0] === '+' ? 'add' : l[0] === '-' ? 'del' : 'chg'}">${escapeHtml(l)}</li>`)
      .join('');
    return [
      `<section><h2>${escapeHtml(d.name)}</h2><ul>${list}</ul><div class="pair">${side(f.before, `Before · ${from}`)}${side(f.after, `After · ${to}`)}</div></section>`,
    ];
  });
  const warnings = [...before.warnings, ...after.warnings];
  const notes = warnings.length === 0 ? '' : `<ul>${warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul>\n`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Diagram diff ${escapeHtml(from)} → ${escapeHtml(to)}</title>
${THEME_HEAD_SCRIPT}
<style>
${themeCss(OVERVIEW_LIGHT, OVERVIEW_DARK)}
  body { font: 14px/1.45 system-ui, sans-serif; margin: 0 auto; padding: 16px 24px 48px; max-width: 1800px; color: var(--text); background: var(--bg); }
  header { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; }
  h1 { font-size: 20px; } h2 { font-size: 16px; margin: 32px 0 6px; } h3 { font-size: 13px; margin: 0 0 6px; color: var(--muted); }
  ul { margin: 0 0 12px; padding-left: 18px; font-family: ui-monospace, monospace; font-size: 12.5px; }
  li.add { color: var(--add); } li.del { color: var(--del); } li.chg { color: var(--chg); }
  .key span { display: inline-block; margin-right: 14px; } .key i { display: inline-block; width: 12px; height: 12px; border: 3px solid; border-radius: 3px; vertical-align: -2px; margin-right: 4px; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .side iframe { width: 100%; height: 70vh; border: 1px solid var(--border); border-radius: 6px; }
  .side.empty p { height: 70vh; margin: 0; display: grid; place-items: center; border: 1px dashed var(--border); border-radius: 6px; color: var(--faint); }
  @media (max-width: 900px) { .pair { grid-template-columns: 1fr; } }
</style></head><body>
<header><h1>Diagram diff · ${escapeHtml(from)} → ${escapeHtml(to)}</h1>${THEME_SWITCH}</header>
<p class="key"><span><i style="border-color:#16a34a"></i>added</span><span><i style="border-color:#dc2626;border-style:dashed"></i>removed</span><span><i style="border-color:#d97706"></i>changed</span><span><i style="border-color:#d97706;border-style:dashed"></i>holds a change (folded box, on the linked pages)</span></p>
${notes}${sections.length > 0 ? sections.join('\n') : '<p>No diagram changed.</p>'}
</body></html>
`;
}
