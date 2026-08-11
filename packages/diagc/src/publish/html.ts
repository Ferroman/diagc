export const DG_DATA_SENTINEL = '"__DG_DIAGRAM_DATA__"';

export function stampHtml(shell: string, data: unknown): string {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return shell.replace(DG_DATA_SENTINEL, () => json);
}
