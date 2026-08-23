import { access } from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';

export interface DiscoveredDiagram { name: string; modelPath: string; layoutPath?: string; drawingsPath?: string }

/** Discover render-ready diagrams from the compiled artifacts dir; pair each
 * with its layout and drawings sidecars from the source tree (artifacts carry
 * neither — compile never touches a sidecar). */
export async function discoverDiagrams(artifactsDir: string, srcDir: string): Promise<DiscoveredDiagram[]> {
  const files = await fg('**/*.diagram.json', { cwd: artifactsDir, absolute: true });
  const out: DiscoveredDiagram[] = [];
  const exists = async (p: string): Promise<boolean> => {
    try { await access(p); return true; } catch { return false; }
  };
  for (const modelPath of files) {
    const name = path.relative(artifactsDir, modelPath).replace(/\.diagram\.json$/, '').split(path.sep).join('/');
    const layoutPath = path.join(srcDir, `${name}.layout.json`);
    const drawingsPath = path.join(srcDir, `${name}.drawings.json`);
    out.push({
      name,
      modelPath,
      ...((await exists(layoutPath)) ? { layoutPath } : {}),
      ...((await exists(drawingsPath)) ? { drawingsPath } : {}),
    });
  }
  return out;
}
