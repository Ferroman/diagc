import type { LayoutApi } from '@diagc/renderer';
import { getHost } from '../host';
import { exportFileName, saveFile } from './saveFile';

/** Render the canvas as drawn to a PNG and hand it to the browser as a download. */
export async function downloadPng(api: LayoutApi | null | undefined, diagram: string): Promise<void> {
  const blob = await api?.exportPng();
  if (blob === null || blob === undefined) {
    getHost().notify('Nothing to export yet — the diagram is still being laid out.');
    return;
  }
  saveFile(blob, exportFileName(diagram, 'png'));
}
