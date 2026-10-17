/** The file a diagram exports to: its name's last path segment (a diagram in
 * `docs/` saves as `activity.png`, not `docs/activity.png`). */
export function exportFileName(diagram: string, extension: string): string {
  const base = diagram.split('/').pop() ?? '';
  return `${base === '' ? 'diagram' : base}.${extension}`;
}

/** Hand `blob` to the browser as a download named `fileName`. */
export function saveFile(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  // the click has queued the download; the object URL is no longer needed
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
