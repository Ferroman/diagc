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

export function buildGallery(entries: GalleryEntry[]): string {
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
  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Diagrams</title>
<style>
body{font-family:system-ui,sans-serif;margin:24px;background:#fafafa}
h1{font-size:18px}
h2{font-size:14px;margin:28px 0 12px;color:#555;font-weight:600}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px}
.card{display:flex;flex-direction:column;gap:8px;padding:12px;border:1px solid #ddd;border-radius:8px;text-decoration:none;color:#222;background:#fff}
.card img{width:100%;height:140px;object-fit:contain;background:#f4f4f4;border-radius:4px}
.card .path{font-size:12px;color:#777}
</style></head>
<body><h1>Diagrams</h1>
${sections}
</body></html>`;
}
