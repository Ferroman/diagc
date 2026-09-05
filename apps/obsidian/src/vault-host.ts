import { FileSystemAdapter, type App } from 'obsidian';
import * as path from 'node:path';
import { mkdirSync } from 'node:fs';
// Relative import, not the bare `diagc` specifier: diagc's package.json
// exports only "." (-> src/compile.ts), so a subpath like `diagc/src/api`
// is blocked by node's export-map encapsulation — see bridge.ts for the full
// rationale; this file reaches the same module the same way.
import * as handlers from '../../../packages/diagc/src/api/handlers';
import { makeApiFetch } from './bridge';
import { parseWikilink } from './wikilink';
import type DiagrammingPlugin from './main';

/** The studio pane (Task 10) and code-fence embeds (Task 11) both need this —
 * one diagc route table + vault adapter per plugin instance, so both surfaces
 * read/write the same on-disk files identically. Not `HostAdapter` itself:
 * the pane also needs `urlState` (its own, `memoryUrlState()`) and an embed
 * needs none, so the shared piece is the host-adapter fields both DO agree on. */
export interface VaultHost {
  apiFetch: (url: string, init?: RequestInit) => Promise<Response>;
  openLink: (link: string) => void;
  assetBase: string;
  libraryBase: string;
}

/** getResourcePath returns app://…?mtime for one file; stripping the query
 * yields a stable prefix usable as assetBase/libraryBase. */
const resourceBase = (app: App, vaultPath: string): string =>
  `${app.vault.adapter.getResourcePath(vaultPath).split('?')[0]}/`;

/** Build the diagc-backed API/link/asset wiring for this vault, or `undefined`
 * on mobile (no `FileSystemAdapter` — the plugin is desktop-only, per
 * manifest). Creates `<diagramsFolder>/src` and `.artifacts` if they don't
 * exist yet, matching what a fresh vault needs before the first save. */
export function buildVaultHost(app: App, plugin: DiagrammingPlugin): VaultHost | undefined {
  const adapter = app.vault.adapter;
  if (!(adapter instanceof FileSystemAdapter)) return undefined;
  const folder = plugin.settings.diagramsFolder;
  const home = path.join(adapter.getBasePath(), folder);
  const ctx = { diagramsDir: path.join(home, 'src'), artifactsDir: path.join(home, '.artifacts') };
  mkdirSync(ctx.diagramsDir, { recursive: true });
  mkdirSync(ctx.artifactsDir, { recursive: true });
  return {
    apiFetch: makeApiFetch(ctx, handlers),
    openLink: (link) => {
      const target = parseWikilink(link);
      if (target !== null) void app.workspace.openLinkText(target, '', true);
      else if (/^https?:/.test(link)) window.open(link, '_blank', 'noopener');
    },
    assetBase: resourceBase(app, `${folder}/src/assets`),
    libraryBase: resourceBase(app, `${app.vault.configDir}/plugins/diagramming-studio/library`),
  };
}
