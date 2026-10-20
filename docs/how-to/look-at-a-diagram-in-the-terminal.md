# Look at a diagram in the terminal

Print a diagram as text, or browse it full-screen, without a browser. Both draw the same view the studio and the published pages draw: the same folds, planes, layers and aggregated arrows, in boxes and lines made of characters.

## Print a diagram

```bash
diagc show shop
```

`shop` is the diagram's name, the path under `.diagrams/src` without `.diagram.ts`. A path works too: `diagc show .diagrams/src/shop.diagram.ts`.

```
          ╭──────────╮
          │ Customer │
          │  person  │
          ╰─────┬────╯
                │
        Browses │
                │
┌╌ Shop system ╌┼╌╌╌╌╌╌╌┐
╎               ▼       ╎
╎        ┌────────────┐ ╎
╎        │ Storefront │ ╎
╎        │  service   │ ╎
╎        └──────┬─────┘ ╎
╎               │       ╎
╎ Places orders │       ╎
╎               ▼       ╎
╎        ┌────────────┐ ╎
╎        │ Orders API │ ╎
╎        │  service   │ ╎
╎        └──────┬─────┘ ╎
╎               ┃       ╎
╎    Order rows ┃       ╎
╎               ▼       ╎
╎         ╭───────────╮ ╎
╎         ├───────────┤ ╎
╎         │ Orders DB │ ╎
╎         │ database  │ ╎
╎         ╰───────────╯ ╎
└╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┘
```

(The picture is the basic starter that `diagc init` writes, with a few empty rows taken out.)

- Every group is open, as in the PNG `diagc publish` makes. A group listed in the layout's `export.collapsed` stays folded, as it does in the PNG.
- `show` reads the source, not the compiled artifact, so it shows the diagram as it is now. You do not have to compile first.
- The flow runs the way the plane's layout settings say (`direction` in `<name>.layout.json`); without one, downwards, except an activity diagram, which runs to the right, as on the page.
- A fishbone is the fish the page draws: the spine across with the effect boxed at its head, the categories above and below it, two to a column, each on a bone slanting in to the spine (`╲` and `╱`, `\` and `/` with `--ascii`), and every cause on a line to its bone, its sub-causes on ticks to that line.
- A git graph is its lanes, as the page draws them: a row per lane, each commit a dot (`●`, `*` with `--ascii`) at its column with its tag over it, the lane's name at the right end, and the branch-offs and merges between the rows. A column is as wide as its tags need, so no two tags on a lane run together. A stage is a dim frame across every lane, its title in its top border.
- The line tells the kind: a dashed line is an `async` or `hosted-on` relation, a heavy one is `writes`, and a boundary such as `system` has a dashed frame.
- A diagram that [declares a legend](add-a-legend.md) gets it under the picture, framed, with a blank line between. A `top-` position puts it over the picture and a `-right` one against the picture's right edge, unless the legend is the wider of the two: then it starts at the left edge, as a `-left` one does.

## Choose what to draw

```bash
diagc show shop --depth 1          # only the top level of groups open
diagc show shop --depth 0          # every group folded: the overview
diagc show shop --plane infra      # another plane
diagc show shop --layers security  # these layers in place of the plane's own
diagc show shop --layers ''        # no layers at all
diagc show shop --root checkout    # what is inside one group
```

A folded group says how much it holds:

```
 ┌╌╌╌╌╌╌╌╌╌╌╌╌┐
 ╎    Shop    ╎
 ╎   system   ╎
 ╎ + 3 inside ╎
 └╌╌╌╌╌╌╌╌╌╌╌╌┘
```

An unknown plane, layer or group exits `1` and lists the ones the diagram has.

## Paste it somewhere

- **Plain text.** In a terminal the picture is in colour: a node's `color` on its border, a layer's tint on its lines, and the colours the page gives a fishbone's bones, a git graph's lanes and a trust boundary. In a pipe or a file it has none, so `diagc show shop > shop.txt` is plain text. `--no-color` turns colour off in a terminal, `--color` turns it on in a pipe, and `NO_COLOR` is respected.
- **Only ASCII.** `--ascii` draws with `+ - | . :` and `> < ^ v`, for a font or a tool that has no box-drawing characters.
- **In Markdown.** Put the output in a fenced code block. It lines up in any monospaced font, wide characters included.
- **A wide picture.** A terminal wraps a line that is wider than itself, which takes the picture apart. `show` says so on stderr when that happens: `diagc show shop | less -S` scrolls sideways instead, or open the diagram with `diagc tui`.

## Browse a diagram

```bash
diagc tui           # the list of diagrams
diagc tui shop      # this one
```

The viewer opens a diagram as the published page does: folded, except the groups its layout saved as unfolded. It compiles the sources as you save them and redraws, so keep it open in one terminal pane and edit the `.diagram.ts` in another. A source that does not compile keeps the last picture and shows the error in the bottom row.

A picture bigger than the screen gets an overview in the bottom-right corner: every box drawn small, the part on screen outlined and the rest dimmed. Click on it, or drag across it, to go to that part of the picture; `o` hides it. Nothing has to stay under it: the screen scrolls past the picture's right and bottom edges as far as the overview reaches, and a box you select is scrolled out from under it. In a terminal that shows images through kitty's graphics protocol, such as kitty, Ghostty or WezTerm, the overview is a picture in the terminal's text colour, fine enough to show the lines between the boxes as well. Elsewhere, under tmux, and while the help is open, it is drawn in braille dots, so the terminal's font, or a fallback font it borrows from, has to have them.

A diagram that declares a legend shows it in the corner its `position` names, as the published page does. A legend in the overview's corner sits above the overview, and is cut short, with a line saying how many rows are left out, where there is no room for all of it. `L` hides it and shows it again. A diagram drawn in shapes that say nothing about themselves, such as a start dot or a decision, has a legend on offer even when it declares none: `L` shows it.

| Key | What it does |
| --- | --- |
| arrows, `h j k l` | Move to the next box in that direction. |
| `Tab`, `Shift-Tab` | Next, previous box. |
| `Enter`, `Space`, double-click | Unfold or fold the box. |
| `e`, `c` | Unfold, fold every group. |
| `>`, `<` | Go into the box, as drilling in the studio does; back out. |
| `p`, `P` | Next, previous plane. |
| `1` … `9` | Turn a layer on or off. The top row lists them. |
| `/`, `n`, `N` | Search the names; next, previous match. A match inside a folded group unfolds it. |
| `i` | Details of the box: its description, every relation in and out, threats, comments, links. |
| `Shift`-arrows, `PgUp`, `PgDn`, `Home`, `End`, the mouse wheel, a drag | Scroll. |
| a click or a drag on the overview | Go to that part of the picture. |
| `o` | Hide or show the overview. |
| `L` | Hide or show the legend. |
| `s` | Switch between the DOS style and the terminal's own colours. |
| `r` | Read the diagram again. |
| `?` | All the keys. |
| `Esc` | Close the search, the help or the details; then back to the list. |
| `q`, `Ctrl-C` | Quit. |

The viewer takes the mouse while it is open, so a drag pans the picture instead of selecting text. To select with the terminal, hold `Shift` as you drag (`Option` in iTerm2), or copy from `diagc show`, which prints the same picture.

The viewer needs a terminal that understands xterm's escape codes for the alternate screen and the mouse, as most terminal emulators do. It is tested in kitty on Linux, and has not been tried on Windows.

The viewer is read-only. Change a diagram in its source, or in `diagc studio`.

### The DOS style

A diagram whose `style` is [`dos`](../reference/model.md#style-presets) opens in it, as its published page does: a blue screen, each box filled in its type's colour in a white double frame with a block shadow, an open group double-framed and titled on its frame, a grey menu bar and status line, the help a grey dialog.

- `s` switches between the DOS style and the terminal's own colours, for the diagram on screen and every diagram opened after it.
- `diagc tui --style dos` opens every diagram in the DOS style, and `--style clean` opens every one in the terminal's own colours, a `dos` diagram included.
- Every other style is the browser's: the viewer draws those diagrams in the terminal's own colours.
- The DOS style needs colour. With `NO_COLOR` set, or `TERM=dumb`, the viewer draws in the terminal's own look whatever the style.
- A shadow falls two columns right of its box and a row below it. A white line that runs under it is drawn dark grey there; a line in a colour of its own, an arrowhead and a label keep their colour.

## What the text picture leaves out

- **Your positions.** Boxes you placed by hand in the studio are saved in pixels, for boxes of another size. The text picture is always laid out automatically.
- **The special layouts.** A plan's time axis, git lanes and activity swimlanes draw as an ordinary graph: the names, the nesting and the arrows are all there, the geometry is not.
- **What only a browser draws.** Icons, images, freehand drawings and notes. A foreign key's arrow ends at its table, not at the row.
- **Most styles.** `diagc show` prints every diagram in the terminal's own colours, and `diagc tui` draws only the `dos` style besides them (see [The DOS style](#the-dos-style)). The sketched, hatched and themed looks are the browser's.
- **The theme's colours.** A second-order diagram's good and bad consequences, a causal loop's polarities and a deployment's zones take their colours from the page's light or dark theme. A text picture cannot know the background it will be read on, so it draws them uncoloured.
- **Part of the legend.** A layer that is off has no row, as on a published page: the top row lists the layers. Nothing the text picture leaves out is keyed, such as a threat badge or the drawings. A swatch is made of characters, so an interrupt's lightning jog is drawn as a plain arrow.

## See also

- [`diagc` reference → `show`](../reference/cli.md#show) and [`tui`](../reference/cli.md#tui)
- [Organise a large diagram](organise-large-diagrams.md) — folding, pins and drilling, which the viewer follows
- [Use planes and layers](use-planes-and-layers.md)
- [Write diagrams with a coding agent](write-diagrams-with-a-coding-agent.md) — `diagc show` is the check an agent can read as text
