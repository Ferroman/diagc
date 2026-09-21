function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

export interface GalleryEntry {
  /** the diagram's path under the source root, no extension — also its page URL */
  name: string;
  /** the model's display name */
  title: string;
  hasImage: boolean;
}

function card(e: GalleryEntry): string {
  const thumb = e.hasImage
    ? `<img src="../static/${esc(e.name)}.png" alt="${esc(e.title)}" loading="lazy" />`
    : '';
  // The path is what `diagc publish <name>` and the page URL use, so it stays on the
  // card — unless the model has no name of its own and the two would just repeat.
  const path = e.title === e.name ? '' : `<span class="path">${esc(e.name)}</span>`;
  return `<a class="card" href="${esc(e.name)}.html">${thumb}<span>${esc(e.title)}</span>${path}</a>`;
}

export interface GalleryOptions {
  /** an address to link from the header — a project's repository, say */
  link?: string;
}

/**
 * The header link's href and text. http(s) only: the address is written into an href,
 * where a `javascript:` one would run. It is shown as the address it goes to, which needs
 * no label to be invented and tells the reader where they are about to land.
 */
export function galleryLink(raw: string): { href: string; text: string } {
  const url = URL.canParse(raw) ? new URL(raw) : undefined;
  if (url === undefined || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
    throw new Error(`link must be an http(s) URL, got '${raw}'`);
  }
  return { href: url.href, text: `${url.host}${url.pathname}`.replace(/\/$/, '') };
}

export function buildGallery(entries: GalleryEntry[], opts: GalleryOptions = {}): string {
  // One section per source folder, in path order, root diagrams first and unheaded:
  // a flat grid of sixty path names is not a front page. ('' sorts ahead of every
  // folder name, which is what puts the root first.)
  const groups = new Map<string, GalleryEntry[]>();
  for (const e of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
    const slash = e.name.lastIndexOf('/');
    const folder = slash < 0 ? '' : e.name.slice(0, slash);
    groups.set(folder, [...(groups.get(folder) ?? []), e]);
  }
  const sections = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([folder, es]) => {
      const heading = folder === '' ? '' : `<h2>${esc(folder)}</h2>\n`;
      return `${heading}<div class="grid">\n${es.map(card).join('\n')}\n</div>`;
    })
    .join('\n');
  // Opt-in, like everything else on this page that is not the diagrams: the index belongs
  // to whoever published it.
  const link = opts.link === undefined ? undefined : galleryLink(opts.link);
  const linkHtml = link === undefined ? '' : `<a class="link" href="${esc(link.href)}">${esc(link.text)} ↗</a>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Diagrams</title>
<style>
body{font-family:system-ui,sans-serif;margin:24px;background:#fafafa}
header{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:0 16px}
h1{font-size:18px}
.link{font-size:13px;color:#555;text-decoration:none}
.link:hover{text-decoration:underline}
h2{font-size:14px;margin:28px 0 12px;color:#555;font-weight:600}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px}
.card{display:flex;flex-direction:column;gap:8px;padding:12px;border:1px solid #ddd;border-radius:8px;text-decoration:none;color:#222;background:#fff}
.card img{width:100%;height:140px;object-fit:contain;background:#f4f4f4;border-radius:4px}
.card .path{font-size:12px;color:#777}
</style></head>
<body><header><h1>Diagrams</h1>${linkHtml}</header>
${sections}
</body></html>`;
}
