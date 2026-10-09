import { BUILTIN_NOTATIONS, type DiagramLegend, type DiagramModel } from '../types';
import { CommandError } from '../command-error';

/** Pin the diagram's visual style preset id, or clear it with null (the
 * app-level preference applies again). Unknown ids are intentionally
 * accepted — the renderer treats them as unpinned. */
export function setDiagramStyle(model: DiagramModel, style: string | null): DiagramModel {
  if (style === null) {
    const { style: _dropped, ...rest } = model;
    return rest;
  }
  return { ...model, style };
}

/** Pin the diagram's notation id, or clear it with null. Unlike
 * `setDiagramStyle`, unknown ids are rejected — a model-level notation drives
 * structural validation rules the same way a plane's own notation does (e.g.
 * `validateGit` resolves `plane.notation ?? model.notation`),
 * so it must resolve to a known one. */
export function setDiagramNotation(model: DiagramModel, notation: string | null): DiagramModel {
  if (notation === null) {
    if (model.notation === undefined) return model;
    const { notation: _dropped, ...rest } = model;
    return rest;
  }
  if (!(BUILTIN_NOTATIONS as readonly string[]).includes(notation)) {
    throw new CommandError(`Unknown notation '${notation}'`);
  }
  return model.notation === notation ? model : { ...model, notation };
}

/** Declare the diagram's legend, or clear it entirely with null. */
export function setDiagramLegend(model: DiagramModel, legend: DiagramLegend | null): DiagramModel {
  if (legend === null) {
    const { legend: _dropped, ...rest } = model;
    return rest;
  }
  return { ...model, legend };
}
