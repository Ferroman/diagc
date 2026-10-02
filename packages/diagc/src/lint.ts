import { diagramWarnings, errMessage, type ValidationIssue } from '@diagc/core';
import { LoadError, loadModel, type LoadOptions } from './compile';

/** One line of `diagc lint` output. An `error` is what fails a compile too; a
 * `warning` is what compile only mentions — lint fails on both. */
export interface LintReport {
  file: string;
  severity: 'error' | 'warning';
  code: string;
  message: string;
  ref?: string;
  /** where a `load` finding happened in the source, when the stack placed it */
  line?: number;
  column?: number;
}

const report = (file: string, severity: LintReport['severity'], i: Pick<ValidationIssue, 'message' | 'ref'> & { code: string }): LintReport => ({
  file,
  severity,
  code: i.code,
  message: i.message,
  ...(i.ref !== undefined ? { ref: i.ref } : {}),
});

/** Every finding for one source: its validation errors when it does not load,
 * otherwise its warnings (core's lint included). */
export async function lintFile(file: string, opts?: LoadOptions): Promise<LintReport[]> {
  try {
    const model = await loadModel(file, opts);
    return diagramWarnings(model).map((w) => report(file, 'warning', w));
  } catch (e) {
    // By name, not instanceof: a builder diagram throws from jiti's own copy of core.
    if (e instanceof Error && e.name === 'DiagramValidationError' && Array.isArray((e as { issues?: unknown }).issues)) {
      return (e as Error & { issues: ValidationIssue[] }).issues.map((i) => report(file, 'error', i));
    }
    if (e instanceof LoadError) {
      return [
        {
          file,
          severity: 'error',
          code: 'load',
          message: e.reason,
          ...(e.line !== undefined && e.column !== undefined ? { line: e.line, column: e.column } : {}),
        },
      ];
    }
    return [report(file, 'error', { code: 'load', message: errMessage(e) })];
  }
}

export function formatLintReport(r: LintReport): string {
  const where = r.line !== undefined && r.column !== undefined ? `${r.file}:${r.line}:${r.column}` : r.file;
  return `${where}: ${r.severity} ${r.code}: ${r.message}`;
}
