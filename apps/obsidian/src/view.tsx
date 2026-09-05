import { ItemView, type WorkspaceLeaf, type App, FileSystemAdapter } from 'obsidian';
import { createRoot, type Root } from 'react-dom/client';
import * as path from 'node:path';
import { mkdirSync } from 'node:fs';
import { App as StudioApp } from '@diagramming/studio/src/App';
import { setHost } from '@diagramming/studio/src/host';
// Relative import, not the bare `diagc` specifier: diagc's package.json
// exports only "." (-> src/compile.ts), so a subpath like `diagc/src/api`
// is blocked by node's export-map encapsulation — see bridge.ts for the full
// rationale; this file reaches the same module the same way.
import * as handlers from '../../../packages/diagc/src/api/handlers';
import { makeApiFetch } from './bridge';
import { memoryUrlState } from './memory-url-state';
import { parseWikilink } from './wikilink';
import type DiagrammingPlugin from './main';

export const VIEW_TYPE_STUDIO = 'diagramming-studio';

/** getResourcePath returns app://…?mtime for one file; stripping the query
 * yields a stable prefix usable as assetBase/libraryBase. */
const resourceBase = (app: App, vaultPath: string): string =>
  `${app.vault.adapter.getResourcePath(vaultPath).split('?')[0]}/`;

export class StudioView extends ItemView {
  private root: Root | undefined;
  /** Task 11's embeds and openDiagram() drive navigation through this. */
  readonly urlState = memoryUrlState();

  constructor(leaf: WorkspaceLeaf, private readonly plugin: DiagrammingPlugin) {
    super(leaf);
  }
  override getViewType(): string { return VIEW_TYPE_STUDIO; }
  override getDisplayText(): string { return 'Diagram Studio'; }
  override getIcon(): string { return 'network'; }

  override async onOpen(): Promise<void> {
    const adapter = this.app.vault.adapter;
    if (!(adapter instanceof FileSystemAdapter)) return; // desktop-only, manifest says so
    const folder = this.plugin.settings.diagramsFolder;
    const home = path.join(adapter.getBasePath(), folder);
    const ctx = { diagramsDir: path.join(home, 'src'), artifactsDir: path.join(home, '.artifacts') };
    mkdirSync(ctx.diagramsDir, { recursive: true });
    mkdirSync(ctx.artifactsDir, { recursive: true });
    setHost({
      apiFetch: makeApiFetch(ctx, handlers),
      urlState: this.urlState,
      openLink: (link) => {
        const target = parseWikilink(link);
        if (target !== null) void this.app.workspace.openLinkText(target, '', true);
        else if (/^https?:/.test(link)) window.open(link, '_blank', 'noopener');
      },
      assetBase: resourceBase(this.app, `${folder}/src/assets`),
      libraryBase: resourceBase(this.app, `${this.app.vault.configDir}/plugins/diagramming-studio/library`),
    });
    const el = this.contentEl.createDiv({ cls: 'dg-obsidian-root' });
    this.root = createRoot(el);
    this.root.render(<StudioApp />);
  }

  override async onClose(): Promise<void> {
    this.root?.unmount();
  }
}
