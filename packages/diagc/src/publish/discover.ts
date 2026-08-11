import { access } from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';

export interface DiscoveredDiagram { name: string; modelPath: string; layoutPath?: string }

/** Discover render-ready diagrams from the compiled artifacts dir; pair each
 * with its layout overlay from the source tree (artifacts carry no layout). */
export async function discoverDiagrams(artifactsDir: string, srcDir: string): Promise<DiscoveredDiagram[]> {
  const files = await fg('**/*.diagram.json', { cwd: artifactsDir, absolute: true });
  const out: DiscoveredDiagram[] = [];
  for (const modelPath of files) {
    const name = path.relative(artifactsDir, modelPath).replace(/\.diagram\.json$/, '').split(path.sep).join('/');
    const layoutPath = path.join(srcDir, `${name}.layout.json`);
    let hasLayout = false;
    try { await access(layoutPath); hasLayout = true; } catch { /* no layout */ }
    out.push({ name, modelPath, ...(hasLayout ? { layoutPath } : {}) });
  }
  return out;
}
