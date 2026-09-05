/*
 * diagc obsidian — the Obsidian plugin embedding the diagc studio.
 * Copyright (C) 2026 Bogdan Frankovskyi
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License version 3 as
 * published by the Free Software Foundation, with the additional permissions
 * granted under section 7 that are set out in the LICENSE file at the root of
 * this repository.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License
 * for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import { Plugin, PluginSettingTab, Setting, type App } from 'obsidian';
import { DEFAULT_SETTINGS, normalizeSettings, type DiagrammingSettings } from './settings';
import { StudioView, VIEW_TYPE_STUDIO } from './view';
import { DiagramEmbedChild } from './embed-child';
import { formatHash } from '@diagramming/studio/src/urlState';
// Imported from the start so `dist/main.css` exists after every build — the
// esbuild config renames it to `styles.css`, which Obsidian requires present.
import '@diagramming/studio/src/app.css';
import '@fontsource/caveat/500.css';
import '@fontsource/caveat/700.css';

export default class DiagrammingPlugin extends Plugin {
  settings: DiagrammingSettings = { ...DEFAULT_SETTINGS };

  override async onload(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData());
    this.addSettingTab(new DiagrammingSettingTab(this.app, this));
    this.registerView(VIEW_TYPE_STUDIO, (leaf) => new StudioView(leaf, this));
    this.addRibbonIcon('network', 'Open diagram studio', () => void this.activateStudio());
    this.addCommand({
      id: 'open-diagram-studio',
      name: 'Open diagram studio',
      callback: () => void this.activateStudio(),
    });
    // Interactive read-only embeds: ```diagram fences in reading view and
    // live preview. Each block gets its own child so Obsidian's own
    // teardown (source edited, view closed) unmounts its React root.
    this.registerMarkdownCodeBlockProcessor('diagram', (source, el, mdCtx) => {
      mdCtx.addChild(new DiagramEmbedChild(el, source, this, mdCtx.sourcePath));
    });
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /** Reuse an existing studio leaf if one is already open, else open a new one. */
  async activateStudio(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_STUDIO)[0];
    const leaf = existing ?? this.app.workspace.getLeaf(true);
    if (existing === undefined) await leaf.setViewState({ type: VIEW_TYPE_STUDIO, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  /** Focus the studio pane on one diagram — the embeds' "open in studio". */
  async openDiagram(name: string): Promise<void> {
    await this.activateStudio();
    const view = this.app.workspace.getLeavesOfType(VIEW_TYPE_STUDIO)[0]?.view;
    if (view instanceof StudioView) view.urlState.navigate(formatHash(name, []));
  }
}

class DiagrammingSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: DiagrammingPlugin) {
    super(app, plugin);
  }
  override display(): void {
    this.containerEl.empty();
    new Setting(this.containerEl)
      .setName('Diagrams folder')
      .setDesc('Vault-relative folder holding the diagc project (src/, .artifacts/)')
      .addText((t) =>
        t.setValue(this.plugin.settings.diagramsFolder).onChange(async (v) => {
          this.plugin.settings = normalizeSettings({ diagramsFolder: v });
          await this.plugin.saveSettings();
        }),
      );
  }
}
