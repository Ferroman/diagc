import { Modal, Notice, type App } from 'obsidian';

/** The studio HostAdapter's dialog surface, implemented with Obsidian's own
 * UI. Not optional polish: Electron renderers don't implement window.prompt
 * at all (calling it throws), and native confirm/alert dialogs steal keyboard
 * focus from the window — so every studio dialog must come through here.
 *
 * No colocated test, same as view.tsx/vault-host.ts: the `obsidian` package
 * ships types only (`"main": ""`), so anything importing it can't load under
 * vitest. The dialog *flows* are covered host-side in the studio's tests. */
export interface HostDialogs {
  promptText(message: string, initial?: string): Promise<string | null>;
  confirmDialog(message: string): Promise<boolean>;
  notify(message: string): void;
}

/** window.prompt's contract in a Modal: resolve the entered text on OK/Enter,
 * null on cancel — including Escape and clicking outside, which both land in
 * onClose without `submitted` ever being set. */
class PromptModal extends Modal {
  private value: string;
  private submitted = false;

  constructor(
    app: App,
    private readonly message: string,
    initial: string | undefined,
    private readonly resolve: (v: string | null) => void,
  ) {
    super(app);
    this.value = initial ?? '';
  }

  override onOpen(): void {
    this.titleEl.setText(this.message);
    const input = this.contentEl.createEl('input', {
      type: 'text',
      value: this.value,
      cls: 'dg-dialog-input',
    });
    input.addEventListener('input', () => {
      this.value = input.value;
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.submitted = true;
        this.close();
      }
    });
    const buttons = this.contentEl.createDiv({ cls: 'modal-button-container' });
    buttons.createEl('button', { text: 'OK', cls: 'mod-cta' }).addEventListener('click', () => {
      this.submitted = true;
      this.close();
    });
    buttons.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close());
    input.focus();
    input.select();
  }

  override onClose(): void {
    this.resolve(this.submitted ? this.value : null);
    this.contentEl.empty();
  }
}

/** window.confirm's contract in a Modal: true only on an explicit OK. */
class ConfirmModal extends Modal {
  private confirmed = false;

  constructor(
    app: App,
    private readonly message: string,
    private readonly resolve: (ok: boolean) => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.contentEl.createEl('p', { text: this.message });
    const buttons = this.contentEl.createDiv({ cls: 'modal-button-container' });
    buttons.createEl('button', { text: 'OK', cls: 'mod-cta' }).addEventListener('click', () => {
      this.confirmed = true;
      this.close();
    });
    buttons.createEl('button', { text: 'Cancel' }).addEventListener('click', () => this.close());
  }

  override onClose(): void {
    this.resolve(this.confirmed);
    this.contentEl.empty();
  }
}

export function buildDialogs(app: App): HostDialogs {
  return {
    promptText: (message, initial) =>
      new Promise((resolve) => new PromptModal(app, message, initial, resolve).open()),
    confirmDialog: (message) => new Promise((resolve) => new ConfirmModal(app, message, resolve).open()),
    notify: (message) => {
      new Notice(message);
    },
  };
}
