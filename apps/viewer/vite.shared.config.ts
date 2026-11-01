import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// SPIKE: the viewer as one classic script plus one stylesheet, for pages that share
// a viewer instead of inlining it. Classic (IIFE), not a module: a module script
// loaded by `src` from a file:// page is refused by Chrome's CORS rule, a classic one
// is not, and published pages must open from disk.
export default defineConfig({
  plugins: [react()],
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    outDir: 'dist-shared',
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    lib: {
      entry: 'src/main.tsx',
      formats: ['iife'],
      name: 'diagcViewer',
      fileName: () => 'viewer.js',
      cssFileName: 'viewer',
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
