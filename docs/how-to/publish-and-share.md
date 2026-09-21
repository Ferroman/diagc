# Publish and share

Turn diagrams into things other people can open: images for your README, interactive pages for a website.

## One-time setup

The exporter stamps your model into a pre-built viewer shell. Build it once:

```bash
pnpm build:cli
```

Without it, `publish` exits with `viewer shell not built`.

## Export

```bash
pnpm publish-diagrams              # everything
pnpm publish-diagrams acme shop    # only these, by diagram name
pnpm publish-diagrams --no-images  # HTML only
```

Three outputs:

| Path | What it is | Commit? |
| --- | --- | --- |
| `.diagrams/html/<name>.html` | Self-contained interactive page — model, layout and every image inlined. No server needed. | no |
| `.diagrams/html/index.html` | A gallery linking them all: one section per source folder, each card titled with its model's name. | no |
| `.diagrams/static/<name>.png` | Flat image, sized to the diagram. | **yes** |

Freehand drawings (`<name>.drawings.json`) ship with the page and are included in the PNG; the export frame grows to fit a stroke drawn outside the boxes.

## Put an image in your docs

```markdown
![Shop](.diagrams/static/shop.png)
```

That is a normal repo path — it works on GitHub with no Pages setup.

**Three things about the exported image**, each of which will surprise you once:

- **Every group is unfolded.** The PNG is a flat overview, not the folded resting state. A diagram that reads beautifully folded can be dense as an image. A view with hundreds of leaves can name the groups to keep folded in its layout overlay — `"export": { "collapsed": ["big-group", "other-group"] }` — which the image honours and the interactive page ignores. Fold rather than hide: a folded box still anchors its hidden children's edges, where a plane-hidden node drops them.
- **No layer is switched on interactively** — but a plane's preset `layers` *are* active, because the view compiler unions the two. So an overlay reaches a committed image only if the exported plane presets it.
- **A declared legend is baked in.** If the diagram calls `m.legend()`, the key travels with the image, and the capture frame **grows** by the panel's height so it never covers the diagram. Layers that are off are dropped rather than greyed — neither an image nor a published page offers a layer switch, so the rows that remain are plain rows rather than dead buttons. An undeclared legend — the on-demand key an activity, threat-model or ER page offers — is not: the page has the `▤` button, the image stays clean. See [Add a legend](add-a-legend.md).

Design a diagram intended for a README accordingly: keep it shallow, and either keep what matters unlayered or export a plane that presets the layers you want. Exporting one model as several images is a matter of declaring the plane you want first — [Use planes and layers](use-planes-and-layers.md) does exactly that for its three figures.

Two more, smaller:

- A node's `description` never renders — only `name` does.
- The image renders in the **light** theme regardless of your studio setting.

## When PNGs do not appear

The PNG step drives a real headless browser. If none is found you get:

```
No Chrome found — writing HTML only; install Chrome / set CHROME_PATH, or use --no-images.
```

Point it at any Chrome or Chromium:

```bash
CHROME_PATH=/path/to/chrome pnpm publish-diagrams
```

Checked automatically: `/usr/bin/google-chrome`, `/usr/bin/google-chrome-stable`, `/usr/bin/chromium`, `/usr/bin/chromium-browser`, `/snap/bin/chromium`, `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.

## Share an interactive page

`.diagrams/html/<name>.html` is a single file with everything inlined. Email it, drop it in Slack, open it from disk — it folds and unfolds exactly like the studio, it just cannot save.

Pages with several planes get a plane picker at the top; the PNG always shows the first plane.

Presenting the page on a call? Press `L` (or the `◉` corner control) for a laser pointer: drag to draw a red trail that fades out after a second, so people can see what you are pointing at. It never touches the diagram, and `Esc` switches it off. The studio has the same control.

## Publish to GitHub Pages

Pages cannot serve a dot-folder, so push the *contents* of `.diagrams/html` to a `gh-pages` branch:

```bash
pnpm publish-diagrams
pnpm publish-site      # gh-pages -d .diagrams/html
```

The first run creates the branch. `main` is never touched. Then enable **Settings → Pages → Deploy from branch → gh-pages**.

Or let CI deploy on every push: this repo's [`pages.yml`](../../.github/workflows/pages.yml) builds the viewer, runs `publish`, and hands the result to GitHub's Pages actions (**Settings → Pages → Source: GitHub Actions**) — it is what serves the [live examples](../examples/README.md). One thing to copy from it: the index reaches its thumbnails as `../static/<name>.png`, so ship `static/` beside `html/` if you want them; `html/` alone gives an index of titles only.

To send visitors of the index back to the repository, publish with `--link https://github.com/<you>/<repo>` — `pages.yml` does. The link sits in the index header only; diagram pages stay bare.

README images in `.diagrams/static` need none of this.

## What to commit

```gitignore
.diagrams/.artifacts/
.diagrams/html/
```

Commit `.diagrams/src/` and `.diagrams/static/*.png`. The artifacts and the HTML are build output — one command regenerates them.

## Keeping images fresh

Nothing regenerates a committed PNG automatically. Re-run `pnpm publish-diagrams` when a diagram changes, and commit the image with the source change so the two never drift.

## See also

- [`diagc` reference](../reference/cli.md)
- [Set up diagc in another repo](set-up-in-another-repo.md)
