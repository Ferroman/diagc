import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { designerApi } from './vite-plugins/designer-api';

const diagramsDir = process.env['DIAGRAMS_DIR'] ?? path.resolve(__dirname, '../../.diagrams/src');
const artifactsDir = process.env['ARTIFACTS_DIR'] ?? path.resolve(__dirname, '../../.diagrams/.artifacts');
// A checkout's own builds: `pnpm build:cli` makes the viewer page the studio's
// "Export web page" stamps a diagram into, and the icon library is committed.
const pages = {
  shellPath: path.resolve(__dirname, '../viewer/dist/index.html'),
  libraryDir: path.resolve(__dirname, 'public/library'),
};
const extraAllow = process.env['DIAGRAMS_CWD'] ? [process.env['DIAGRAMS_CWD']] : [];

export default defineConfig({
  plugins: [react(), designerApi({ diagramsDir, artifactsDir, pages })],
  server: {
    open: process.env['DIAGRAMS_OPEN'] === '1',
    fs: { allow: [path.resolve(__dirname, '../..'), ...extraAllow] },
  },
});
