import { THEME_HEAD_SCRIPT, THEME_SWITCH, themeCss } from '../publish/pageTheme';
import type { DiagramDiff } from './compare';
import { diffLines, type DiffLine } from './describe';
import type { DiagramSet } from './load';
import type { DiagramFiles } from './pages';

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
  // A diagram's section: its change list in a column of its own beside the picture, so
  // a long list scrolls there and never pushes the picture off the screen.
  '.diagram { display: grid; grid-template-columns: minmax(240px, 360px) 1fr; gap: 16px; align-items: start; }',
  '.diagram > ul { max-height: 78vh; overflow: auto; margin: 22px 0 0; padding-left: 0; list-style: none; }',
  '.diagram li { margin-bottom: 4px; padding: 1px 4px; overflow-wrap: anywhere; }',
  'li button { font: inherit; color: inherit; background: none; border: none; padding: 0; text-align: left; ' +
    'cursor: pointer; }',
  'li button:hover, li button:focus-visible { text-decoration: underline; }',
  'li.at { background: color-mix(in srgb, currentColor 12%, transparent); border-radius: 3px; }',
  'li dl { margin: 2px 0 6px; color: var(--muted); display: grid; grid-template-columns: auto 1fr; gap: 0 8px; }',
  'li dt { grid-column: 1 / -1; color: var(--faint); } li dd { margin: 0; grid-column: 1 / -1; }',
  'li dd.was { text-decoration: line-through; text-decoration-color: var(--del); }',
  '.views { display: flex; gap: 4px; margin: 0 0 6px; }',
  '.views button { font: inherit; font-size: 12px; padding: 2px 10px; border: 1px solid var(--border); ' +
    'border-radius: 6px; background: var(--card); color: var(--muted); cursor: pointer; }',
  '.views button[aria-pressed=true] { color: var(--text); font-weight: 600; border-color: var(--muted); }',
  '.combined iframe { width: 100%; height: 78vh; border: 1px solid var(--border); border-radius: 6px; }',
  '[hidden] { display: none !important; }',
  '.key span { display: inline-block; margin-right: 14px; } ' +
    '.key i { display: inline-block; width: 12px; height: 12px; border: 3px solid; border-radius: 3px; ' +
    'vertical-align: -2px; margin-right: 4px; }',
  '.pair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }',
  '.side iframe { width: 100%; height: 70vh; border: 1px solid var(--border); border-radius: 6px; }',
  '.side.empty p { height: 70vh; margin: 0; display: grid; place-items: center; ' +
    'border: 1px dashed var(--border); border-radius: 6px; color: var(--faint); }',
  '@media (max-width: 900px) { .pair, .diagram { grid-template-columns: 1fr; } .diagram > ul { max-height: 40vh; } }',
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

/**
 * The page's behaviour, the same for every section:
 *
 * - the two view buttons show the combined picture or the two sides. The sides
 *   load on first use (their frames carry `data-src`), so a page of many diagrams
 *   does not lay out three pictures of each;
 * - a change's button asks the combined page to bring that element into view
 *   (apps/viewer/src/diff-view.tsx answers the message), switching to it first.
 */
export const OVERVIEW_SCRIPT = `<script>(function(){
function show(section,view){
  section.querySelectorAll('[data-view]').forEach(function(el){el.hidden=el.dataset.view!==view});
  section.querySelectorAll('[data-show]').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.show===view))});
  if(view==='sides')section.querySelectorAll('iframe[data-src]').forEach(function(f){f.src=f.dataset.src;f.removeAttribute('data-src')});
}
document.addEventListener('click',function(e){
  var el=e.target instanceof Element?e.target:null;
  var section=el&&el.closest('section');
  if(!section)return;
  var view=el.closest('[data-show]');
  if(view){show(section,view.dataset.show);return}
  var change=el.closest('[data-focus]');
  var frame=section.querySelector('.combined iframe');
  if(!change||!frame)return;
  show(section,'combined');
  section.querySelectorAll('li.at').forEach(function(li){li.classList.remove('at')});
  change.closest('li').classList.add('at');
  var message=JSON.parse(change.dataset.focus);
  message.type='diagc-diff-focus';
  frame.contentWindow.postMessage(message,'*');
});
})();</script>`;

/** One line of the change list. A line that points at something is a button that
 * brings it into view on the combined picture; a changed field shows old and new. */
function lineHtml(line: DiffLine, focusable: boolean): string {
  const text = escapeHtml(`${line.sign} ${line.text}`);
  const head =
    focusable && line.target !== undefined
      ? `<button type="button" data-focus="${escapeHtml(JSON.stringify(line.target))}">${text}</button>`
      : text;
  const values = (line.values ?? [])
    .map(
      (v) =>
        `<dt>${escapeHtml(v.field)}</dt><dd class="was">${escapeHtml(v.before)}</dd><dd>${escapeHtml(v.after)}</dd>`,
    )
    .join('');
  const cls = line.sign === '+' ? 'add' : line.sign === '-' ? 'del' : 'chg';
  return `<li class="${cls}">${head}${values !== '' ? `<dl>${values}</dl>` : ''}</li>`;
}

export function indexHtml(
  diffs: readonly DiagramDiff[],
  files: Map<string, Omit<DiagramFiles, 'png'>>,
  before: DiagramSet,
  after: DiagramSet,
): string {
  const from = before.label;
  const to = after.label;
  // The side frames load each page unfolded (`?export=1`, the PNG's own mode): side by
  // side, the whole picture is the point. The headings link the interactive pages.
  // Beside a combined picture the sides wait for their button (`lazy`).
  const side = (rel: string | undefined, label: string, lazy: boolean) => {
    const heading = escapeHtml(label);
    if (rel === undefined) return `<div class="side empty"><h3>${heading}</h3><p>not present</p></div>`;
    const page = `${escapeHtml(rel)}.html`;
    const frame = `<iframe ${lazy ? 'data-src' : 'src'}="${page}?export=1" title="${heading}"></iframe>`;
    return `<div class="side"><h3><a href="${page}">${heading}</a></h3>${frame}</div>`;
  };
  // A diagram that did not compile has no pictures, but is listed as the summary lists it.
  const sections = diffs.flatMap((d) => {
    if (d.status === 'unchanged') return [];
    if (d.status === 'error')
      return [`<section><h2>${escapeHtml(d.name)}</h2><p>Not compared: ${escapeHtml(d.error)}</p></section>`];
    const f: Omit<DiagramFiles, 'png'> = files.get(d.name) ?? {};
    const combined = f.combined;
    const list = diffLines(d, f.removedIds)
      .map((l) => lineHtml(l, combined !== undefined))
      .join('');
    const pair = (lazy: boolean) =>
      `<div class="pair"${lazy ? ' data-view="sides" hidden' : ''}>` +
      `${side(f.before, `Before · ${from}`, lazy)}${side(f.after, `After · ${to}`, lazy)}</div>`;
    if (combined === undefined)
      return [
        `<section><h2>${escapeHtml(d.name)}</h2><div class="diagram"><ul>${list}</ul>${pair(false)}</div></section>`,
      ];
    const page = `${escapeHtml(combined)}.html`;
    const views =
      '<div class="views"><button type="button" data-show="combined" aria-pressed="true">Combined</button>' +
      '<button type="button" data-show="sides" aria-pressed="false">Side by side</button></div>';
    const one =
      `<div class="combined" data-view="combined"><iframe src="${page}" ` +
      `title="${escapeHtml(`${from} → ${to}`)}"></iframe></div>`;
    return [
      `<section><h2>${escapeHtml(d.name)}</h2>` +
        `<div class="diagram"><ul>${list}</ul><div>${views}${one}${pair(true)}</div></div></section>`,
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
${OVERVIEW_CSS}
</style></head><body>
<header><h1>Diagram diff · ${escapeHtml(from)} → ${escapeHtml(to)}</h1>${THEME_SWITCH}</header>
${KEY}
${notes}${sections.length > 0 ? sections.join('\n') : '<p>No diagram changed.</p>'}
${OVERVIEW_SCRIPT}
</body></html>
`;
}
