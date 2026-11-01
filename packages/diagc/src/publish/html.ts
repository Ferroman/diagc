import { SOURCE_URL } from '@diagc/core/internal';

export const DG_DATA_SENTINEL = '"__DG_DIAGRAM_DATA__"';

export { SOURCE_URL };

/**
 * AGPL section 13 offer, carried by every published page.
 *
 * A published page inlines the whole viewer bundle, so publishing one distributes
 * AGPL-licensed code and owes its recipients an offer of the corresponding source. The
 * bundle `publish` stamps is unmodified, so pointing upstream discharges that — the
 * author of the diagram has nothing to do, which is the point: compliance should not be
 * something they can forget.
 *
 * A comment rather than visible chrome, deliberately. The page belongs to whoever drew
 * the diagram; a banner on their work would be a tax, and nothing in the licence asks
 * for one.
 *
 * Must contain no `--` (ends an HTML comment early) and no `</script>` (the data
 * sentinel's own test asserts the page holds exactly one).
 */
export const SOURCE_NOTICE = `<!--
  Rendered by diagc — ${SOURCE_URL}

  This page embeds the diagc viewer, free software under the GNU Affero General
  Public License, version 3 (AGPL-3.0-only). The complete corresponding source of
  the viewer is available at the address above.

  The diagram on this page is not covered by that licence. See the additional
  permissions under section 7 in the project's LICENSE file.
-->`;

/**
 * Anchored at the start: only a leading doctype counts. The notice has to land *after*
 * it — an HTML comment ahead of the doctype puts the document into quirks mode in every
 * browser, which would silently change how the viewer lays out.
 */
const LEADING_DOCTYPE = /^\s*<!doctype html>/i;

/** Insert the source offer without disturbing the doctype. */
export function withSourceNotice(shell: string): string {
  return LEADING_DOCTYPE.test(shell)
    ? shell.replace(LEADING_DOCTYPE, (m) => `${m}\n${SOURCE_NOTICE}`)
    : `${SOURCE_NOTICE}\n${shell}`;
}

export function stampHtml(shell: string, data: unknown): string {
  return withSourceNotice(shell).replace(DG_DATA_SENTINEL, () => dataJson(data));
}

/** The data as a page carries it: JSON with every `<` escaped, so nothing in a
 * diagram can close the script tag it sits in. */
const dataJson = (data: unknown): string => JSON.stringify(data).replace(/</g, '\\u003c');

/** The folder `publish` writes the shared viewer into, beside the pages. No leading
 * underscore or dot: a Jekyll-served Pages branch would drop one, and a diagram is
 * unlikely to take the name. */
export const VIEWER_DIR = 'diagc-viewer';

/** The path a page at `name` (`team/app`) reaches `VIEWER_DIR` by: `../diagc-viewer`. */
export function viewerRelFor(name: string): string {
  const dir = name.includes('/') ? name.slice(0, name.lastIndexOf('/')) : '';
  const up = dir === '' ? [] : dir.split('/').map(() => '..');
  return up.length === 0 ? `./${VIEWER_DIR}` : `${up.join('/')}/${VIEWER_DIR}`;
}

/** The offer for a page that loads the viewer from beside it rather than embedding
 * it: the folder it loads is the same unmodified bundle, so the same address
 * discharges it. Same constraints as SOURCE_NOTICE. */
const LINKED_SOURCE_NOTICE = `<!--
  Rendered by diagc — ${SOURCE_URL}

  This page loads the diagc viewer from the ${VIEWER_DIR}/ folder beside it, free
  software under the GNU Affero General Public License, version 3 (AGPL-3.0-only).
  The complete corresponding source of the viewer is available at the address above.

  The diagram on this page is not covered by that licence. See the additional
  permissions under section 7 in the project's LICENSE file.
-->`;

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * A page that shares the viewer: the diagram's data inline (a page must open from
 * `file://`, where a fetch is refused), the viewer's stylesheet and script linked
 * from `viewerRel` as classic resources (a module script is refused there too).
 * The head is the single-file shell's, so the two kinds of page open alike.
 */
export function linkedPageHtml(data: unknown, viewerRel: string, title: string): string {
  return `<!doctype html>
${LINKED_SOURCE_NOTICE}
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)}</title>
    <meta name="color-scheme" content="light dark">
    <style>html,body,#root{margin:0;height:100%;width:100%}</style>
    <link rel="stylesheet" href="${viewerRel}/viewer.css">
  </head>
  <body>
    <div id="root"></div>
    <script id="dg-data" type="application/json">${dataJson(data)}</script>
    <script src="${viewerRel}/viewer.js"></script>
  </body>
</html>
`;
}
