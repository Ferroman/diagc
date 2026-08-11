import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { designerApi } from './vite-plugins/designer-api';

const diagramsDir = process.env['DIAGRAMS_DIR'] ?? path.resolve(__dirname, '../../.diagrams/src');
const artifactsDir = process.env['ARTIFACTS_DIR'] ?? path.resolve(__dirname, '../../.diagrams/.artifacts');
const extraAllow = process.env['DIAGRAMS_CWD'] ? [process.env['DIAGRAMS_CWD']] : [];

export default defineConfig({
  plugins: [react(), designerApi(diagramsDir, artifactsDir)],
  server: {
    open: process.env['DIAGRAMS_OPEN'] === '1',
    fs: { allow: [path.resolve(__dirname, '../..'), ...extraAllow] },
  },
});
