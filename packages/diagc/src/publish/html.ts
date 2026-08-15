import { SOURCE_URL } from '@diagramming/core';

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
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return withSourceNotice(shell).replace(DG_DATA_SENTINEL, () => json);
}
