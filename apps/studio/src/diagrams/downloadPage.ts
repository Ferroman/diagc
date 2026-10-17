import { getHost } from '../host';
import { exportFileName, saveFile } from './saveFile';

/** What the page route answers: the page, or why there is none. */
interface PageAnswer {
  html?: string;
  warnings?: string[];
  issues?: { message: string }[];
}

/**
 * Ask the studio's server for the diagram as one web page — the page `diagc
 * publish` writes, built from the saved files — and hand it to the browser as a
 * download. The server builds it because the viewer it stamps the diagram into
 * is a build output the studio bundle does not carry.
 */
export async function downloadPage(diagram: string): Promise<void> {
  const host = getHost();
  // a compiled diagram's name comes from its file and may hold anything a URL would misread
  const res = await host.apiFetch(`/api/pages/${diagram.split('/').map(encodeURIComponent).join('/')}`);
  const answer = (await res.json().catch(() => ({}))) as PageAnswer;
  if (!res.ok || answer.html === undefined) {
    const why = answer.issues?.map((i) => i.message).join('\n');
    host.notify(`Could not export '${diagram}' as a web page${why ? `:\n${why}` : '.'}`);
    return;
  }
  const fileName = exportFileName(diagram, 'html');
  saveFile(new Blob([answer.html], { type: 'text/html' }), fileName);
  if (answer.warnings !== undefined && answer.warnings.length > 0)
    host.notify(`Saved ${fileName}, but some of it could not be packed in:\n${answer.warnings.join('\n')}`);
}
