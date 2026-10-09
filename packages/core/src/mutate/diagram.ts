import { BUILTIN_NOTATIONS, type DiagramLegend, type DiagramModel } from '../types';
import { CommandError } from '../command-error';

/** Pin the diagram's visual style preset id, or clear it with null (the
 * app-level preference applies again). Unknown ids are intentionally
 * accepted — the renderer treats them as unpinned. */
export function setDiagramStyle(m: DiagramModel, style: string | null): DiagramModel {
  if (style === null) {
    const { style: _dropped, ...rest } = m;
    return rest;
  }
  return { ...m, style };
}

/** Pin the diagram's notation id, or clear it with null. Unlike
 * `setDiagramStyle`, unknown ids are rejected — a model-level notation drives
 * structural validation rules the same way a plane's own notation does (e.g.
 * `validateGit` in validate.ts resolves `plane.notation ?? model.notation`),
 * so it must resolve to a known one. */
export function setDiagramNotation(m: DiagramModel, notation: string | null): DiagramModel {
  if (notation === null) {
    if (m.notation === undefined) return m;
    const { notation: _dropped, ...rest } = m;
    return rest;
  }
  if (!(BUILTIN_NOTATIONS as readonly string[]).includes(notation)) {
    throw new CommandError(`Unknown notation '${notation}'`);
  }
  return m.notation === notation ? m : { ...m, notation };
}

/** Declare the diagram's legend, or clear it entirely with null. */
export function setDiagramLegend(m: DiagramModel, legend: DiagramLegend | null): DiagramModel {
  if (legend === null) {
    const { legend: _dropped, ...rest } = m;
    return rest;
  }
  return { ...m, legend };
}
