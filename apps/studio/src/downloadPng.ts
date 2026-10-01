import type { LayoutApi } from '@diagc/renderer';
import { getHost } from './host';

/** The file a diagram exports to: its name's last path segment (a diagram in
 * `docs/` saves as `activity.png`, not `docs/activity.png`). */
export function pngFileName(diagram: string): string {
  const base = diagram.split('/').pop() ?? '';
  return `${base === '' ? 'diagram' : base}.png`;
}

/** Render the canvas as drawn to a PNG and hand it to the browser as a download. */
export async function downloadPng(api: LayoutApi | null | undefined, diagram: string): Promise<void> {
  const blob = await api?.exportPng();
  if (blob === null || blob === undefined) {
    getHost().notify('Nothing to export yet — the diagram is still being laid out.');
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = pngFileName(diagram);
  a.click();
  // the click has queued the download; the object URL is no longer needed
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
