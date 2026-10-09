import { BUILTIN_NOTATIONS, LEGEND_POSITIONS, LEGEND_SECTIONS } from '../types';
import { report, type Ctx } from './context';

/** The diagram style must be a non-empty string. Unknown ids are
 * intentionally legal — the renderer draws as if none were set. Also the
 * model-level `notation`, unlike style, must be one of BUILTIN_NOTATIONS —
 * it is a closed vocabulary the renderer keys a `Record` on, not an open
 * preset id. */
export function validateModelStyle(ctx: Ctx): void {
  const { model, issues } = ctx;
  if (model.style !== undefined && (typeof model.style !== 'string' || model.style === '')) {
    report(issues, 'invalid-style', 'Diagram style must be a non-empty string');
  }
  if (
    model.notation !== undefined &&
    (typeof model.notation !== 'string' || !(BUILTIN_NOTATIONS as readonly string[]).includes(model.notation))
  ) {
    report(issues, 'unknown-notation', `Diagram has unknown notation '${String(model.notation)}'`, model.id);
  }
}

/** Legend checks. Registry ids (`item.type` / `item.kind`) are deliberately NOT
 * validated — unknown ids are legal everywhere else and fall back silently. */
export function validateLegend(ctx: Ctx): void {
  const { model, issues } = ctx;
  const l = model.legend;
  if (l === undefined) return;
  if (typeof l !== 'object' || l === null || Array.isArray(l)) {
    report(issues, 'invalid-legend', 'Legend must be an object');
    return;
  }
  if (l.title !== undefined && (typeof l.title !== 'string' || l.title === '')) {
    report(issues, 'invalid-legend', `Legend has invalid title '${String(l.title)}'`);
  }
  if (l.position !== undefined && !(LEGEND_POSITIONS as readonly string[]).includes(l.position)) {
    report(issues, 'invalid-legend', `Legend has unknown position '${String(l.position)}'`);
  }
  if (l.show !== undefined) {
    if (!Array.isArray(l.show)) {
      report(issues, 'invalid-legend', 'Legend show must be a list');
    } else {
      for (const s of l.show) {
        if (!(LEGEND_SECTIONS as readonly string[]).includes(s)) {
          report(issues, 'invalid-legend', `Legend has unknown section '${String(s)}'`);
        }
      }
    }
  }
  if (l.items !== undefined) {
    if (!Array.isArray(l.items)) {
      report(issues, 'invalid-legend', 'Legend items must be a list');
      return;
    }
    l.items.forEach((item, i) => {
      if (item === null || typeof item !== 'object') {
        report(issues, 'invalid-legend', `Legend item ${i} must be an object`);
        return;
      }
      if (typeof item.label !== 'string' || item.label === '') {
        report(issues, 'invalid-legend', `Legend item ${i} needs a non-empty label`);
      }
      if (item.color !== undefined && typeof item.color !== 'string') {
        report(issues, 'invalid-legend', `Legend item ${i} has invalid color '${String(item.color)}'`);
      }
    });
  }
}
