import { ItemView, type WorkspaceLeaf } from 'obsidian';
import { createRoot, type Root } from 'react-dom/client';
import { App as StudioApp } from '@diagramming/studio/src/App';
import { setHost } from '@diagramming/studio/src/host';
import { buildVaultHost } from './vault-host';
import { memoryUrlState } from './memory-url-state';
import type DiagrammingPlugin from './main';

export const VIEW_TYPE_STUDIO = 'diagramming-studio';

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
    const vaultHost = buildVaultHost(this.app, this.plugin);
    if (vaultHost === undefined) return; // desktop-only, manifest says so
    setHost({ ...vaultHost, urlState: this.urlState });
    const el = this.contentEl.createDiv({ cls: 'dg-obsidian-root' });
    this.root = createRoot(el);
    this.root.render(<StudioApp />);
  }

  override async onClose(): Promise<void> {
    this.root?.unmount();
  }
}
