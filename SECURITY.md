# Security policy

## Reporting a vulnerability

Please report it privately, not in a public issue: use **Report a vulnerability** on the
repository's Security tab, or write to <bfrankovskyi@gmail.com>. Say what you found, how to
reproduce it, and which release or commit you tested.

You should hear back within a week. Fixes land on `main` and go out in the next release;
only the latest release is supported.

## What the tool trusts, and what it does not

Knowing the design helps tell a vulnerability from intended behaviour.

- **`.diagram.ts` sources are programs.** `diagc compile`, `watch`, `studio` and `publish`
  execute them with your privileges. Compiling diagrams from a repository you do not trust
  is running that repository's code — the same as running its build. `.diagram.json`
  sources are data and are only validated.
- **The studio is a local, single-user tool.** `diagc studio` listens on `127.0.0.1` and its
  `/api/*` routes — which read and write files under `.diagrams/` — carry no authentication.
  Do not bind it to a public interface or put it behind a reverse proxy.
- **Published pages are static.** A page from `diagc publish` is one self-contained HTML
  file: the viewer bundle with the model inlined. It makes no network requests of its own
  and has no server side.

In scope, for example: reading or writing outside `.diagrams/` through the studio API; a
model (a node name, a link, metadata, an included diagram) that runs script in the studio,
the viewer or a published page; a web page open in the same browser being able to drive the
local studio API.

Out of scope: a `.diagram.ts` file doing what its author wrote it to do, and anything that
requires the studio to have been deliberately exposed to a network.
