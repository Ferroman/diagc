/** JS reserved words plus the two bindings the emitted file itself declares. */
const RESERVED = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
  'delete', 'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for',
  'function', 'if', 'import', 'in', 'instanceof', 'new', 'null', 'return',
  'super', 'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var', 'void',
  'while', 'with', 'let', 'static', 'yield', 'await',
  'm', 'model',
]);

/**
 * Deterministic node-id → TS identifier assignment, first-come order.
 * Separators camelCase the following segment; an id that cannot start an
 * identifier is prefixed with 'n'; collisions and reserved words take the
 * first free numeric suffix starting at 2.
 */
export function identifiersFor(ids: readonly string[]): Map<string, string> {
  const taken = new Set<string>();
  const out = new Map<string, string>();
  for (const id of ids) {
    const segments = id.split(/[^A-Za-z0-9]+/).filter((s) => s !== '');
    let base = segments
      .map((s, i) => (i === 0 ? s : (s[0] ?? '').toUpperCase() + s.slice(1)))
      .join('');
    if (base === '' || /^[0-9]/.test(base)) base = `n${base}`;
    let ident = base;
    for (let n = 2; RESERVED.has(ident) || taken.has(ident); n++) ident = `${base}${n}`;
    taken.add(ident);
    out.set(id, ident);
  }
  return out;
}

const IDENT_KEY = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
/** How wide an inline object/array may render before it breaks across lines. */
const INLINE_LIMIT = 72;

function quote(s: string): string {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
}

/**
 * A model value as TS source. Strings single-quoted; objects/arrays inline
 * while their one-line form fits INLINE_LIMIT, multi-line (two-space steps,
 * trailing commas) beyond it. Deterministic: key order is the object's own.
 */
export function tsLiteral(value: unknown, indent: number): string {
  if (typeof value === 'string') return quote(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const pad = '  '.repeat(indent);
  const inner = '  '.repeat(indent + 1);
  if (Array.isArray(value)) {
    const items = value.map((v) => tsLiteral(v, indent + 1));
    const inline = `[${items.join(', ')}]`;
    if (inline.length <= INLINE_LIMIT && !inline.includes('\n')) return inline;
    return `[\n${items.map((i) => `${inner}${i},`).join('\n')}\n${pad}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>).map(
      ([k, v]) => `${IDENT_KEY.test(k) ? k : quote(k)}: ${tsLiteral(v, indent + 1)}`,
    );
    if (entries.length === 0) return '{}';
    const inline = `{ ${entries.join(', ')} }`;
    if (inline.length <= INLINE_LIMIT && !inline.includes('\n')) return inline;
    return `{\n${entries.map((e) => `${inner}${e},`).join('\n')}\n${pad}}`;
  }
  // undefined/null never reach here: model JSON has no undefined, and no
  // model field is nullable — a new nullable field must extend this emitter.
  throw new Error(`ejectSource: cannot emit a ${value === null ? 'null' : typeof value} literal`);
}
