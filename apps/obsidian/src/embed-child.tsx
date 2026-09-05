import { MarkdownRenderChild } from 'obsidian';
import { createRoot, type Root } from 'react-dom/client';
import { buildVaultHost } from './vault-host';
import { parseFence } from './fence';
import { Embed } from './Embed';
import type DiagrammingPlugin from './main';

/**
 * Owns the React root for one `diagram` code fence. Obsidian replaces the
 * containerEl (and calls `unload()` on the old child) whenever the source
 * block is re-rendered — e.g. the user edits the fence, or reading view is
 * torn down — so the root is created in `onload()` and always unmounted in
 * `onunload()` rather than left for GC.
 *
 * Not unit-tested: it does nothing but parse (delegated to fence.ts, which
 * IS tested) and wire host state (delegated to vault-host.ts) into Embed
 * (also tested); the remaining glue only exercises the `obsidian` module,
 * which ships types only at this version (`package.json` `"main": ""`) and
 * so cannot run under vitest. Covered by typecheck + `pnpm build:obsidian`
 * plus the manual reading/live-preview smoke pass instead.
 */
export class DiagramEmbedChild extends MarkdownRenderChild {
  private root: Root | undefined;

  constructor(
    containerEl: HTMLElement,
    private readonly source: string,
    private readonly plugin: DiagrammingPlugin,
  ) {
    super(containerEl);
  }

  override onload(): void {
    this.root = createRoot(this.containerEl);
    const parsed = parseFence(this.source);
    if ('error' in parsed) {
      this.root.render(<div className="dg-embed-error">{parsed.error}</div>);
      return;
    }
    const vaultHost = buildVaultHost(this.plugin.app, this.plugin);
    if (vaultHost === undefined) {
      this.root.render(<div className="dg-embed-error">Diagram embeds need the Obsidian desktop app.</div>);
      return;
    }
    const spec = parsed;
    this.root.render(
      <Embed
        spec={spec}
        apiFetch={vaultHost.apiFetch}
        openLink={vaultHost.openLink}
        assetBase={vaultHost.assetBase}
        libraryBase={vaultHost.libraryBase}
        onOpenStudio={() => void this.plugin.openDiagram(spec.name)}
      />,
    );
  }

  override onunload(): void {
    this.root?.unmount();
  }
}
