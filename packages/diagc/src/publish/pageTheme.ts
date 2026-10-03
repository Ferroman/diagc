// The light/dark pieces the index page and the diff overview share. A published diagram
// page has its own (apps/viewer/src/theme.ts). These two pages are plain HTML with no
// bundle, so theirs is a few lines of inline script, written for any browser.

/** Where a reader's choice is remembered: 'light' or 'dark', and no entry means "follow
 * the system". The renderer (packages/renderer/src/theme.ts) and the landing site
 * (site/site.js) use the same key, which is what makes one choice cover every page on a
 * host. None of the three can import another, so themeKey.test.ts pins them together. */
export const THEME_STORAGE_KEY = 'diagc-theme';

/**
 * A page's colour variables in both sets, and the switch's own look. Without JavaScript
 * the page follows the system; `data-theme` on the root, set from the remembered choice,
 * overrides it. The page must define --bg, --card, --border and --text.
 */
export function themeCss(light: string, dark: string): string {
  return `:root{color-scheme:light dark;${light}}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){${dark}}}
:root[data-theme=dark]{color-scheme:dark;${dark}}
:root[data-theme=light]{color-scheme:light}
#dg-theme{font:inherit;font-size:14px;line-height:1;padding:4px 8px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--text);cursor:pointer}`;
}

/** For the head, ahead of the styles: marks the root before the first paint, so a page
 * remembered as dark does not flash light. */
export const THEME_HEAD_SCRIPT = `<script>try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}</script>`;

/**
 * The switch, with the published page's two states and its rule (nextStored in
 * apps/viewer/src/theme.ts): a click goes to the other theme, and a theme that is the
 * system's own is not kept, so the page is back to following the system. Hidden until
 * its script runs: without JavaScript there is no dead control.
 */
export const THEME_SWITCH = `<button type="button" id="dg-theme" hidden></button>
<script>(function(){
var KEY='${THEME_STORAGE_KEY}',root=document.documentElement,button=document.getElementById('dg-theme');
var mq=window.matchMedia?window.matchMedia('(prefers-color-scheme: dark)'):null;
function system(){return mq&&mq.matches?'dark':'light'}
function current(){return root.dataset.theme||system()}
function mark(t){if(t)root.dataset.theme=t;else delete root.dataset.theme}
function paint(){var dark=current()==='dark';button.textContent=dark?'☀':'☾';button.title=dark?'Light theme':'Dark theme';button.setAttribute('aria-label',dark?'Switch to light theme':'Switch to dark theme')}
button.addEventListener('click',function(){
var next=current()==='dark'?'light':'dark',keep=next===system()?null:next;
mark(keep);
try{if(keep)localStorage.setItem(KEY,keep);else localStorage.removeItem(KEY)}catch(e){}
paint()});
window.addEventListener('storage',function(e){
if(e.key!==null&&e.key!==KEY)return;
var t=null;try{t=localStorage.getItem(KEY)}catch(x){}
mark(t==='light'||t==='dark'?t:null);paint()});
if(mq&&mq.addEventListener)mq.addEventListener('change',paint);
paint();button.hidden=false})();</script>`;
