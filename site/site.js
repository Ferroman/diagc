// The landing page's two behaviours: a demo loads into the stage, and the install line
// copies. A plain script, not a module: the page loads it with `defer`, and its test
// evaluates it the same way. Without it the page still works: every demo is a link.
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
})();
