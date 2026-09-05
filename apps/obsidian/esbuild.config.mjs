import esbuild from 'esbuild';
import { copyFileSync, cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

// apps/studio/src/app.css opens with three global rules that must not restyle
// Obsidian's own DOM; everything else in the bundle is class-scoped already.
// esbuild's CSS bundler reformats multi-selector rules one selector per line
// (verified against the built dist/main.css), so the `html, body, #root`
// selector is matched across three lines rather than as written in app.css.
const scopeRules = (css) => {
  const subs = [
    [/^\* \{/m, '.dg-obsidian-root, .dg-obsidian-root * {'],
    [/^html,\nbody,\n#root \{/m, '.dg-obsidian-root {'],
    [/^body \{/m, '.dg-obsidian-root {'],
  ];
  return subs.reduce((out, [re, to]) => {
    if (!re.test(out)) throw new Error(`css scoping: expected pattern ${re} not found — app.css changed?`);
    return out.replace(re, to);
  }, css);
};

mkdirSync('dist', { recursive: true });
await esbuild.build({
  entryPoints: ['src/main.tsx'],
  bundle: true,
  outfile: 'dist/main.js',
  format: 'cjs',            // Obsidian loads plugins as CommonJS
  platform: 'node',         // desktop Electron: node builtins are real
  target: 'es2022',
  external: ['obsidian', 'electron'],
  jsx: 'automatic',
  // fonts and small images ride inside the css/js — the plugin dir stays 4 files + library/
  loader: { '.woff2': 'dataurl', '.woff': 'dataurl', '.svg': 'dataurl', '.png': 'dataurl' },
  logLevel: 'info',
});
// esbuild names JS-imported css after the entry; Obsidian requires styles.css.
// Scope the bundled app.css to .dg-obsidian-root so it can't leak onto
// Obsidian's own chrome, then append the plugin's own embed/error-card rules.
const scopedCss = scopeRules(readFileSync('dist/main.css', 'utf8'));
writeFileSync('dist/styles.css', scopedCss + '\n' + readFileSync('src/plugin.css', 'utf8'));
copyFileSync('manifest.json', 'dist/manifest.json');
cpSync('../studio/public/library', 'dist/library', { recursive: true });
