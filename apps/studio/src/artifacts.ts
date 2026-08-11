import { isLayoutOverlay, validate, type DiagramModel, type LayoutOverlay } from '@diagramming/core';

export interface LoadedArtifact {
  name: string;
  model?: DiagramModel;
  layout?: LayoutOverlay;
  issues: { code?: string; message: string }[];
}

/** One diagram as delivered by `GET /api/diagrams`. */
export interface ApiDiagram {
  name: string;
  model: DiagramModel | null;
  issues: { message: string }[];
  editable: boolean;
}

/** Build the studio's diagram map from the boot API responses. Each model is
 * validated here (the server only parses), so a bad model surfaces as issues,
 * never a crash. */
export function loadArtifacts(
  diagrams: ApiDiagram[],
  layouts: Record<string, LayoutOverlay> = {},
): Record<string, LoadedArtifact> {
  const out: Record<string, LoadedArtifact> = {};
  for (const d of diagrams) {
    // The full structural guard (same one the server runs before persisting a
    // layout) decides whether an overlay is trusted; a malformed one is
    // treated as absent rather than crashing the client.
    const rawLayout = layouts[d.name];
    const layout = isLayoutOverlay(rawLayout) ? rawLayout : undefined;
    const withLayout = layout !== undefined ? { layout } : {};
    if (d.model === null || (d.model as { version?: unknown }).version !== 1) {
      out[d.name] = {
        name: d.name,
        issues: d.issues.length > 0 ? d.issues : [{ message: 'Not a version-1 diagram model' }],
        ...withLayout,
      };
      continue;
    }
    const issues = validate(d.model);
    out[d.name] =
      issues.length > 0
        ? { name: d.name, issues, ...withLayout }
        : { name: d.name, model: d.model, issues: [], ...withLayout };
  }
  return out;
}
