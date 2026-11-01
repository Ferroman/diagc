import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The viewer as separate files — one classic script, one stylesheet, the fonts —
// for pages that share a viewer instead of carrying it (`diagc publish`). Classic
// (IIFE), not a module: a module script loaded by `src` from a file:// page is
// refused by Chrome's CORS rule, a classic one is not, and a published page must
// open from disk. Not library mode, which inlines every asset: the fonts stay
// files, so a page in the clean style never downloads the sketch faces (a browser
// fetches a face only when some text uses it). Runs after the single-file build
// (package.json), into a folder of its own inside that build's output.
export default defineConfig({
  plugins: [react()],
  // relative asset addresses: the stylesheet names its fonts beside itself, which
  // holds under any folder and from file://
  base: './',
  build: {
    outDir: 'dist/shared',
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: 'src/main.tsx',
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'viewer.js',
        assetFileNames: (asset) => (asset.names?.[0]?.endsWith('.css') ? 'viewer.css' : '[name][extname]'),
      },
    },
  },
});
