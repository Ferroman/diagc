/** Obsidian stamps the active color scheme on <body> as 'theme-dark' /
 * 'theme-light'. Both the studio pane and note embeds read it from here so the
 * plugin's canvases match the vault instead of each picking its own default
 * (the studio pane used to open dark, embeds light — jarring in either vault
 * scheme, and never consistent with each other). */
export function obsidianTheme(body: HTMLElement = document.body): 'light' | 'dark' {
  return body.classList.contains('theme-dark') ? 'dark' : 'light';
}
