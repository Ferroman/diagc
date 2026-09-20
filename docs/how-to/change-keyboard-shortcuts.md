# Change keyboard shortcuts

Every studio action can have its own key. The defaults are in the [studio reference](../reference/studio.md#keyboard).

## Open the dialog

Click `⚙` in the header, or press `?`. The dialog lists every action with its keys, grouped; the search box filters by action name, group or key (`ctrl+z`). Shortcuts are switched off while it is open, so the keys you press land in the dialog.

## Give an action a key

1. Click the key you want to replace — or `+` to add a second key, or `+` on a row showing `—` to bind an action that has none. It reads **Press a key…**.
2. Press the key, with any of `Ctrl`/`Cmd`, `Alt`, `Shift`. `Esc` cancels instead.

`×` next to a key removes it; an action with no key left is simply unbound. `↺` appears on a row you changed and puts its defaults back. **Reset all to defaults** clears everything you changed.

## When the key is taken

If another action already has the key, nothing changes yet: the dialog names the action and offers **Reassign** — take the key from it — or **Cancel**. An action that only exists in view mode and one that only exists in edit mode (Rename diagram and Add node, say) can share a key, and the dialog does not ask.

Some keys are refused:

- `Esc`, `Delete`, `Backspace` and the arrows have a fixed meaning.
- Bare `Enter` and `Space` press whichever button has focus, so the action would run twice. `Ctrl + Enter` is fine.
- `Ctrl + N`, `Ctrl + T`, `Ctrl + W` and a few others never reach a web page; the browser keeps them.

A key bordered in amber is bound to two actions at once (hover it to see the other) — it happens when a newer version adds a default you had already given away. The action listed first wins until you change one of them.

## Where the bindings live

In your browser's local storage, under `diagramming.hotkeys` — like the theme and the panel widths, they are yours, not the diagram's or the repository's. Only what you changed is stored, so new defaults in a later version still reach you. Storage is per address: the studio on `localhost:5173`, a `diagc studio` on another port and the Obsidian plugin each keep their own set.
