// The landing page's four behaviours: a demo loads into the stage, the install line
// copies, the theme switches, and the code sample gets its colours. A plain script, not a
// module: the page loads it with `defer`, and its test evaluates it the same way. Without
// it the page still works: every demo is a link, the theme is the system's, and the code
// reads in one colour.
(() => {
  const poster = document.querySelector('.stage-poster');
  const live = document.querySelector('.stage-live');
  const frame = document.getElementById('stage-frame');
  const title = document.getElementById('stage-title');
  const open = document.getElementById('stage-open');
  const close = document.getElementById('stage-close');

  if (poster && live && frame && title && open && close) {
    const show = (demo) => {
      const page = demo.getAttribute('href');
      // Made on demand: one published page is about 3.5 MB.
      const iframe = document.createElement('iframe');
      iframe.src = page;
      iframe.title = demo.dataset.title ?? 'Live diagram';
      frame.replaceChildren(iframe);
      title.textContent = demo.dataset.title ?? '';
      open.setAttribute('href', page);
      poster.hidden = true;
      live.hidden = false;
      live.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    };
    document.querySelectorAll('a[data-live]').forEach((demo) => {
      demo.addEventListener('click', (event) => {
        // A modified click asks for a new tab or window, which is the browser's to do.
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        show(demo);
      });
    });
    close.addEventListener('click', () => {
      frame.replaceChildren();
      live.hidden = true;
      poster.hidden = false;
    });
  }

  const copy = document.getElementById('copy-install');
  const command = document.getElementById('install-command');
  if (copy && command) {
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(command.textContent);
        copy.textContent = 'Copied';
      } catch {
        // No clipboard (a denied permission, a plain-http preview): select the line, so
        // the reader's own copy shortcut finishes the job.
        const range = document.createRange();
        range.selectNodeContents(command);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        copy.textContent = 'Selected';
      }
    });
  }

  // The theme: system, light or dark. The choice is kept under the key the published pages
  // read, so a demo opens in the site's theme and an open one follows this switch. The
  // head of the page has already marked the root from it, before the first paint.
  const themeSwitch = document.getElementById('theme-switch');
  if (themeSwitch) {
    const KEY = 'diagc-theme';
    const STATES = ['system', 'light', 'dark'];
    const FACES = { system: '◐ System', light: '☀ Light', dark: '☾ Dark' };
    const root = document.documentElement;
    const after = (state) => STATES[(STATES.indexOf(state) + 1) % STATES.length];
    const remembered = () => {
      try {
        const theme = localStorage.getItem(KEY);
        return theme === 'light' || theme === 'dark' ? theme : 'system';
      } catch {
        // No store: the root's mark is all there is.
        return root.dataset.theme ?? 'system';
      }
    };
    const show = (state) => {
      if (state === 'system') delete root.dataset.theme;
      else root.dataset.theme = state;
      themeSwitch.dataset.state = state;
      themeSwitch.textContent = FACES[state];
      themeSwitch.setAttribute('aria-label', `Theme: ${state}. Switch to ${after(state)}.`);
    };
    show(remembered());
    themeSwitch.hidden = false;
    themeSwitch.addEventListener('click', () => {
      const next = after(themeSwitch.dataset.state);
      try {
        if (next === 'system') localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, next);
      } catch {
        // The choice then lasts as long as the page.
      }
      show(next);
    });
    // A published page in another tab, or in the stage, changed it.
    window.addEventListener('storage', (event) => {
      if (event.key === null || event.key === KEY) show(remembered());
    });
  }

  // One alternative per kind of token, in the order of KINDS. A comment and a string come
  // first, so a keyword or a call inside one is never looked at. A regex, not a parser: it
  // only has to read the TypeScript this page shows.
  const TOKEN =
    /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|('(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`)|\b(import|from|export|default|const|let|function|return|new|await|async|if|else|for|of|true|false|null|undefined)\b|\b(\d+(?:\.\d+)?)\b|([A-Za-z_$][\w$]*)(?=\s*\()|([A-Za-z_$][\w$]*)(?=\s*:)/g;
  const KINDS = ['comment', 'string', 'keyword', 'number', 'call', 'property'];

  document.querySelectorAll('pre code').forEach((code) => {
    // Built from text nodes and spans, never from markup, so the sample's text cannot change.
    const text = code.textContent;
    const parts = document.createDocumentFragment();
    let at = 0;
    for (const match of text.matchAll(TOKEN)) {
      const span = document.createElement('span');
      span.className = `tok-${KINDS[match.slice(1).findIndex((group) => group !== undefined)]}`;
      span.textContent = match[0];
      parts.append(text.slice(at, match.index), span);
      at = match.index + match[0].length;
    }
    parts.append(text.slice(at));
    code.replaceChildren(parts);
  });
})();
