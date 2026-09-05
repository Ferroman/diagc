/** '[[Target]]' / '[[Target|alias]]' → the link text Obsidian resolves
 * ('Target', headings kept); null for anything that isn't a wikilink. */
export function parseWikilink(link: string): string | null {
  const m = /^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/.exec(link.trim());
  const target = m?.[1]?.trim();
  return target === undefined || target === '' ? null : target;
}
