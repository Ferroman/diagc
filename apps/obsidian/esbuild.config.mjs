import esbuild from 'esbuild';
import { copyFileSync, cpSync, mkdirSync } from 'node:fs';

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
// esbuild names JS-imported css after the entry; Obsidian requires styles.css
copyFileSync('dist/main.css', 'dist/styles.css');
copyFileSync('manifest.json', 'dist/manifest.json');
cpSync('../studio/public/library', 'dist/library', { recursive: true });
