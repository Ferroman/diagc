function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

export function buildGallery(entries: { name: string; hasImage: boolean }[]): string {
  const cards = entries
    .map((e) => {
      const thumb = e.hasImage
        ? `<img src="../static/${esc(e.name)}.png" alt="${esc(e.name)}" loading="lazy" />`
        : '';
      return `<a class="card" href="${esc(e.name)}.html">${thumb}<span>${esc(e.name)}</span></a>`;
    })
    .join('\n');
  return `<!doctype html>
<html lang="en"><head><meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Diagrams</title>
<style>
body{font-family:system-ui,sans-serif;margin:24px;background:#fafafa}
h1{font-size:18px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px}
.card{display:flex;flex-direction:column;gap:8px;padding:12px;border:1px solid #ddd;border-radius:8px;text-decoration:none;color:#222;background:#fff}
.card img{width:100%;height:140px;object-fit:contain;background:#f4f4f4;border-radius:4px}
</style></head>
<body><h1>Diagrams</h1><div class="grid">
${cards}
</div></body></html>`;
}
