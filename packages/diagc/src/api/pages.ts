import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { stampHtml } from '../publish/html';
import { inlineAssets, readSidecars } from '../publish/publish';
import { diagramAsShown } from './diagrams';
import { refuse, type HandlerResult } from './result';

/** What a host builds a diagram's web page from: the viewer page `publish` stamps
 * models into, and the icon library its `/library/…` pictures are read from. Each
 * host has its own copies (a checkout's build output, a package's `assets/`, the
 * Obsidian plugin's folder), so each says where they are. */
export interface PageSources {
  shellPath: string;
  libraryDir: string;
}

const existing = async (p: string): Promise<string | undefined> => {
  try {
    await access(p);
    return p;
  } catch {
    return undefined;
  }
};

/**
 * The diagram `name` as one self-contained web page: the page `publish` writes for
 * it, built here so the studio can hand it over as a download. The model is the one
 * the studio shows (the saved source, includes expanded, or else the compiled
 * artifact), so the page cannot lag a compile the way an artifact can.
 *
 * Answered as JSON, `{ html, warnings }`, not as raw bytes: what could not be
 * packed in (a missing picture, a malformed drawings sidecar) still leaves a page
 * worth saving, and the studio should say so rather than hand over a quietly
 * broken one.
 */
export async function exportPage(
  diagramsDir: string,
  artifactsDir: string,
  sources: PageSources | undefined,
  name: string,
): Promise<HandlerResult> {
  if (sources === undefined)
    return refuse(501, 'This studio cannot build web pages: its host has no viewer page to build them from.');
  const entry = await diagramAsShown(diagramsDir, artifactsDir, name);
  if (entry === undefined) return refuse(404, `No diagram '${name}'`);
  if (entry.model === null) return { status: 500, body: { issues: entry.issues } };
  let shell: string;
  try {
    shell = await readFile(sources.shellPath, 'utf8');
  } catch {
    return refuse(500, `No viewer page at ${sources.shellPath} — in a checkout, build it with \`pnpm build:cli\`.`);
  }
  const warnings: string[] = [];
  const warn = (line: string): void => void warnings.push(line);
  const sidecar = (suffix: string) => existing(path.join(diagramsDir, `${name}.${suffix}.json`));
  const [layoutPath, drawingsPath] = await Promise.all([sidecar('layout'), sidecar('drawings')]);
  const sidecars = await readSidecars({ name, layoutPath, drawingsPath }, warn);
  const assets = { libraryDir: sources.libraryDir, assetsDir: path.join(diagramsDir, 'assets'), warn };
  const model = await inlineAssets(entry.model, assets, new Map(), `diagram "${name}"`);
  return { status: 200, body: { html: stampHtml(shell, { model, ...sidecars }), warnings } };
}
