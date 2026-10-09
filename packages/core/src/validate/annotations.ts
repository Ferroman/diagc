import { STRIDE, THREAT_SEVERITIES, THREAT_STATUSES } from '../types';
import { isIsoDate } from '../dates';
import { report, type Ctx } from './context';

/** `threats` is a generic field (any notation): each entry is checked for shape
 * wherever it appears, one issue per fault, the element as `ref`. */
export function validateThreats(ctx: Ctx): void {
  const { issues, m } = ctx;
  const check = (ref: string, threats: unknown): void => {
    if (threats === undefined) return;
    // Shape before contents: a hand-edited file can put anything here, and the
    // derivations read it unguarded (threatSummary calls `.filter` on it), so a
    // wrong shape is an issue rather than something to skip past. One issue for
    // the element — the per-field checks below would only add noise about
    // entries that are not threats at all.
    if (!Array.isArray(threats) || threats.some((t) => t === null || typeof t !== 'object')) {
      report(issues, 'invalid-threats', `'threats' on '${ref}' must be a list of threats`, ref);
      return;
    }
    const seen = new Set<string>();
    for (const t of threats as Record<string, unknown>[]) {
      const id = t.id;
      if (typeof id !== 'string' || id === '') report(issues, 'threat-id', `A threat on '${ref}' has no id`, ref);
      else if (seen.has(id)) report(issues, 'threat-id', `Threat id '${id}' repeats on '${ref}'`, ref);
      else seen.add(id);
      if (!(STRIDE as readonly unknown[]).includes(t.category))
        report(
          issues,
          'threat-category',
          `Threat '${String(id)}' on '${ref}': category must be one of ${STRIDE.join(', ')}`,
          ref,
        );
      if (typeof t.title !== 'string' || t.title === '')
        report(issues, 'threat-title', `Threat '${String(id)}' on '${ref}' has no title`, ref);
      if (t.status !== undefined && !(THREAT_STATUSES as readonly unknown[]).includes(t.status))
        report(
          issues,
          'threat-status',
          `Threat '${String(id)}' on '${ref}': status must be one of ${THREAT_STATUSES.join(', ')}`,
          ref,
        );
      if (t.severity !== undefined && !(THREAT_SEVERITIES as readonly unknown[]).includes(t.severity))
        report(
          issues,
          'threat-severity',
          `Threat '${String(id)}' on '${ref}': severity must be one of ${THREAT_SEVERITIES.join(', ')}`,
          ref,
        );
    }
  };
  for (const n of m.nodes) check(n.id, n.threats);
  for (const r of m.relations) check(r.id, r.threats);
}

/** `comments` (nodes and relations) and `links` (nodes) are generic fields:
 * checked for shape wherever they appear, the element as `ref` — the same
 * contract as validateThreats, for the same reason (the bubble reads them
 * unguarded). */
export function validateComments(ctx: Ctx): void {
  const { issues, m } = ctx;
  const comments = (ref: string, list: unknown): void => {
    if (list === undefined) return;
    if (!Array.isArray(list) || list.some((c) => c === null || typeof c !== 'object')) {
      report(issues, 'invalid-comments', `'comments' on '${ref}' must be a list of comments`, ref);
      return;
    }
    const seen = new Set<string>();
    for (const c of list as Record<string, unknown>[]) {
      const id = c.id;
      if (typeof id !== 'string' || id === '') report(issues, 'comment-id', `A comment on '${ref}' has no id`, ref);
      else if (seen.has(id)) report(issues, 'comment-id', `Comment id '${id}' repeats on '${ref}'`, ref);
      else seen.add(id);
      if (typeof c.text !== 'string' || c.text === '')
        report(issues, 'comment-text', `Comment '${String(id)}' on '${ref}' has no text`, ref);
      if (c.at !== undefined && !isIsoDate(c.at))
        report(issues, 'comment-at', `Comment '${String(id)}' on '${ref}': 'at' must be a YYYY-MM-DD date`, ref);
    }
  };
  const links = (ref: string, list: unknown): void => {
    if (list === undefined) return;
    if (!Array.isArray(list) || list.some((l) => l === null || typeof l !== 'object')) {
      report(issues, 'invalid-links', `'links' on '${ref}' must be a list of { label, url }`, ref);
      return;
    }
    for (const l of list as Record<string, unknown>[]) {
      if (typeof l.label !== 'string' || l.label === '' || typeof l.url !== 'string' || l.url === '')
        report(issues, 'invalid-links', `A link on '${ref}' needs a non-empty label and url`, ref);
    }
  };
  for (const n of m.nodes) {
    comments(n.id, n.comments);
    links(n.id, n.links);
  }
  for (const r of m.relations) comments(r.id, r.comments);
}
