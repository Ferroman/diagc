import type { DiagramModel, ValidationIssue } from '@diagc/core/internal';
import type { DiagramSelection } from '@diagc/renderer';

interface IssueListProps {
  model: DiagramModel;
  /** what the panel lists, in order; the list renders nothing while it is empty */
  issues: readonly ValidationIssue[];
  /** what a row can select: only a node, or a relation too */
  selects: 'nodes' | 'elements';
  onSelect: (selection: DiagramSelection) => void;
  /** the list's accessible name; absent, the list has none */
  label?: string;
  /** rows can share a code and a ref (several bad threats on one element), so
   * the row's index joins its key */
  keyByIndex?: boolean;
}

/** The element an issue's ref names on the canvas, if it names one at all. */
function targetOf(model: DiagramModel, ref: string | undefined, selects: IssueListProps['selects']) {
  if (ref === undefined) return undefined;
  if (model.nodes.some((n) => n.id === ref)) return { kind: 'node', id: ref } as const;
  if (selects === 'elements' && model.relations.some((r) => r.id === ref)) return { kind: 'edge', id: ref } as const;
  return undefined;
}

/**
 * What validation objects to, one row per issue: a button that selects the
 * element the issue names, or text when its ref names nothing on the canvas
 * (the plane or the model) — never a dead button.
 */
export function IssueList({ model, issues, selects, onSelect, label, keyByIndex = false }: IssueListProps) {
  if (issues.length === 0) return null;
  return (
    <ul className="so-issues" aria-label={label}>
      {issues.map((issue, index) => {
        const ref = issue.ref;
        const target = targetOf(model, ref, selects);
        return (
          <li key={keyByIndex ? `${issue.code}:${ref ?? ''}:${index}` : `${issue.code}:${ref ?? ''}`}>
            {target !== undefined ? (
              <button type="button" onClick={() => onSelect(target)}>
                {issue.message}
              </button>
            ) : (
              <span>{issue.message}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
