import { BUILTIN_NOTATIONS, LEGEND_POSITIONS, LEGEND_SECTIONS } from '../types';
import { report, type Ctx } from './context';

/** Diagram-level style: pinned style must be a non-empty string. Unknown ids are
 * intentionally legal — the renderer treats them as unpinned. Also the
 * model-level `notation`, unlike style, must be one of BUILTIN_NOTATIONS —
 * it is a closed vocabulary the renderer keys a `Record` on, not an open
 * preset id. */
export function validateModelStyle(ctx: Ctx): void {
  const { m, issues } = ctx;
  if (m.style !== undefined && (typeof m.style !== 'string' || m.style === '')) {
    report(issues, 'invalid-style', 'Diagram style must be a non-empty string');
  }
  if (
    m.notation !== undefined &&
    (typeof m.notation !== 'string' || !(BUILTIN_NOTATIONS as readonly string[]).includes(m.notation))
  ) {
    report(issues, 'unknown-notation', `Diagram has unknown notation '${String(m.notation)}'`, m.id);
  }
}

/** Legend checks. Registry ids (`item.type` / `item.kind`) are deliberately NOT
 * validated — unknown ids are legal everywhere else and fall back silently. */
export function validateLegend(ctx: Ctx): void {
  const { m, issues } = ctx;
  const l = m.legend;
  if (l === undefined) return;
  if (typeof l !== 'object' || Array.isArray(l)) {
    issues.push({ code: 'invalid-legend', message: 'Legend must be an object' });
    return;
  }
  if (l.title !== undefined && (typeof l.title !== 'string' || l.title === '')) {
    issues.push({ code: 'invalid-legend', message: `Legend has invalid title '${String(l.title)}'` });
  }
  if (l.position !== undefined && !(LEGEND_POSITIONS as readonly string[]).includes(l.position)) {
    issues.push({ code: 'invalid-legend', message: `Legend has unknown position '${String(l.position)}'` });
  }
  if (l.show !== undefined) {
    if (!Array.isArray(l.show)) {
      issues.push({ code: 'invalid-legend', message: 'Legend show must be a list' });
    } else {
      for (const s of l.show) {
        if (!(LEGEND_SECTIONS as readonly string[]).includes(s)) {
          issues.push({ code: 'invalid-legend', message: `Legend has unknown section '${String(s)}'` });
        }
      }
    }
  }
  if (l.items !== undefined) {
    if (!Array.isArray(l.items)) {
      issues.push({ code: 'invalid-legend', message: 'Legend items must be a list' });
      return;
    }
    l.items.forEach((item, i) => {
      if (item === null || typeof item !== 'object') {
        issues.push({ code: 'invalid-legend', message: `Legend item ${i} must be an object` });
        return;
      }
      if (typeof item.label !== 'string' || item.label === '') {
        issues.push({ code: 'invalid-legend', message: `Legend item ${i} needs a non-empty label` });
      }
      if (item.color !== undefined && typeof item.color !== 'string') {
        issues.push({ code: 'invalid-legend', message: `Legend item ${i} has invalid color '${String(item.color)}'` });
      }
    });
  }
}
