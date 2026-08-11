import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['{packages,apps}/**/{src,vite-plugins}/**/*.test.{ts,tsx}'],
    setupFiles: ['packages/renderer/src/test-setup.ts'],
  },
});
