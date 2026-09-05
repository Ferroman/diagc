// Injected per window, not a React context: two call sites (editor/images.ts,
// library/library-api.ts) are plain module functions that cannot useContext, and
// the studio is a singleton per window in both hosts (web + Obsidian), so a
// context would only add threading with nothing to show for it. The default
// reproduces current behavior exactly — the web studio and the packaged server
// need zero configuration.
// Named separately from HostAdapter (rather than inlined) because a host's own
// urlState value is consumed on its own elsewhere — e.g. the Obsidian host's
// `memoryUrlState()` returns `UrlStateAdapter & { navigate(hash: string): void }`.
export interface UrlStateAdapter {
  get(): string;
  set(hash: string, replace: boolean): void;
  subscribe(cb: () => void): () => void;
}

export interface HostAdapter {
  /** all API traffic; default: (url, init) => window.fetch(url, init) */
  apiFetch(url: string, init?: RequestInit): Promise<Response>;
  /** deep-link URL state; default reads/writes window.location.hash + history */
  urlState: UrlStateAdapter;
  /** open a node link; default: window.open(url, '_blank') for http(s), else no-op */
  openLink(link: string): void;
  /** image-node asset URL prefix; default '/api/assets/' (App.tsx:802,840). The
   * Obsidian host has no server behind that path — <img src> must be an app://
   * resource URL, so it overrides both of these. */
  assetBase: string;
  /** '/library/…' icon ref prefix override; undefined keeps refs as-is */
  libraryBase?: string;
  /** modal text entry; resolves the entered string, or null on cancel. The
   * default wraps window.prompt — which Electron renderers (Obsidian) do not
   * implement (calling it THROWS), so any Electron-hosted studio must override
   * this with a real modal. Same reason the studio never calls window.prompt
   * directly: one un-funneled call site is a dead button in that host. */
  promptText(message: string, initial?: string): Promise<string | null>;
  /** modal yes/no; default wraps window.confirm. Overridden in Obsidian not
   * because confirm breaks there but because native dialogs steal keyboard
   * focus from the Electron window (a known quirk) — the host supplies an
   * in-app modal instead. */
  confirmDialog(message: string): Promise<boolean>;
  /** fire-and-forget notice; default wraps window.alert (same focus caveat) */
  notify(message: string): void;
}

export const defaultHost: HostAdapter = {
  // late-bound wrapper, not a bare reference: tests mock window.fetch and must
  // keep intercepting
  apiFetch: (url, init) => window.fetch(url, init),
  urlState: {
    get: () => window.location.hash,
    set: (hash, replace) => {
      if (replace) window.history.replaceState(null, '', hash);
      else window.location.hash = hash; // history push: one entry per navigation step
    },
    subscribe: (cb) => {
      window.addEventListener('hashchange', cb);
      return () => window.removeEventListener('hashchange', cb);
    },
  },
  openLink: (link) => {
    if (/^https?:/.test(link)) window.open(link, '_blank', 'noopener');
  },
  assetBase: '/api/assets/',
  // late-bound wrappers like apiFetch: tests spy on window.prompt/confirm/alert
  promptText: async (message, initial) => window.prompt(message, initial),
  confirmDialog: async (message) => window.confirm(message),
  notify: (message) => window.alert(message),
};

let current: HostAdapter = defaultHost;
export const getHost = (): HostAdapter => current;
export const setHost = (host: HostAdapter): void => {
  current = host;
};
