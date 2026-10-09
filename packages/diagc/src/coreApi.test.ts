import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ts = createRequire(path.join(root, 'package.json'))('typescript') as typeof import('typescript');
const coreSrc = path.join(root, 'packages/core/src');

describe('@diagc/core entry points, as another package resolves them', () => {
  it('resolves @diagc/core/internal to the full internal API', async () => {
    const internal = await import('@diagc/core/internal');
    expect(typeof internal.applyCommand).toBe('function');
    expect(typeof internal.compileView).toBe('function');
    expect(typeof internal.model).toBe('function');
  });

  it('resolves @diagc/core to an entry with the builder', async () => {
    const core = await import('@diagc/core');
    expect(typeof core.model).toBe('function');
  });
});

/** Every name a core entry exports (values and types), and the checker that found them. */
function entryExports(file = 'index.ts') {
  const entry = path.join(coreSrc, file);
  const cfg = ts.getParsedCommandLineOfConfigFile(
    path.join(root, 'packages/core/tsconfig.json'),
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: () => {},
    },
  );
  const program = ts.createProgram([entry], cfg!.options);
  const checker = program.getTypeChecker();
  const moduleSym = checker.getSymbolAtLocation(program.getSourceFile(entry)!)!;
  const exports = checker.getExportsOfModule(moduleSym);
  const resolve = (s: import('typescript').Symbol) =>
    s.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(s) : s;
  return {
    checker,
    resolve,
    exports,
    names: new Set(exports.map((s) => s.getName())),
    symbols: new Set(exports.map(resolve)),
  };
}

describe('the public API is closed', () => {
  // Every name 1.0.0 exported. A minor release may add names, never remove one;
  // only a major release edits this list.
  const V1_NAMES = [
    'ActivityBuilder',
    'ActivityElementOpts',
    'ActivityScope',
    'BUILTIN_NOTATIONS',
    'BranchRef',
    'CategoryRef',
    'CauseRef',
    'Column',
    'Comment',
    'CommentOpts',
    'CommitOpts',
    'CommitRef',
    'ConsequenceOpts',
    'ConsequenceRef',
    'ContainmentEdge',
    'ContainsOpts',
    'DiagramLayer',
    'DiagramLegend',
    'DiagramModel',
    'DiagramNode',
    'DiagramPlane',
    'DiagramRelation',
    'DiagramValidationError',
    'Drawings',
    'EDGE_LABEL_SIDES',
    'EdgeLabel',
    'EdgeLabelPlacement',
    'EdgeLabelSide',
    'ElementOpts',
    'ElementTarget',
    'EventOpts',
    'FONT_SCALES',
    'FishboneBuilder',
    'FishboneOpts',
    'FishbonePreset',
    'FlowRef',
    'FontScale',
    'GitGraphBuilder',
    'LEGEND_POSITIONS',
    'LEGEND_SECTIONS',
    'LaneRef',
    'LayerRule',
    'LayoutOverlay',
    'LayoutSettings',
    'LegendItem',
    'LegendPosition',
    'LegendSection',
    'Link',
    'LintCode',
    'MergeOpts',
    'ModelBuilder',
    'NodeOpts',
    'NodeRef',
    'NotationId',
    'NotePlacement',
    'PlanBuilder',
    'Polarity',
    'RELATION_LINES',
    'RELATION_MARKERS',
    'RELATION_SHAPES',
    'RegionRef',
    'RelateOpts',
    'RelationStyle',
    'SIDES',
    'STRIDE',
    'SecondOrderBuilder',
    'Side',
    'StageOpts',
    'StrideCategory',
    'Stroke',
    'TEXT_ALIGNS',
    'THREAT_SEVERITIES',
    'THREAT_STATUSES',
    'TextAlign',
    'TextRun',
    'Threat',
    'ThreatModelBuilder',
    'ThreatOpts',
    'ThreatSeverity',
    'ThreatStatus',
    'ThreatTarget',
    'Valence',
    'ValidationIssue',
    'ZoneBuilder',
    'ZoneOpts',
    'diagramWarnings',
    'model',
    'validate',
  ];

  it('still exports every name 1.0 exported', () => {
    const { names } = entryExports();
    expect(V1_NAMES.filter((name) => !names.has(name))).toEqual([]);
  });

  it('exports every core type that a public signature mentions', () => {
    const { checker, resolve, symbols } = entryExports();
    const inCore = (s: import('typescript').Symbol) =>
      (s.declarations ?? []).some((d) => d.getSourceFile().fileName.startsWith(coreSrc));
    const isPublicMember = (m: import('typescript').ClassElement) =>
      !(ts.getCombinedModifierFlags(m) & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) &&
      !(m.name !== undefined && ts.isPrivateIdentifier(m.name));
    const missing = new Map<string, string>();
    const note = (sym: import('typescript').Symbol, from: string) => {
      if (inCore(sym) && !symbols.has(sym) && !missing.has(sym.getName())) missing.set(sym.getName(), from);
    };
    const walk = (node: import('typescript').Node, from: string): void => {
      if (ts.isTypeReferenceNode(node)) {
        const name = ts.isQualifiedName(node.typeName) ? node.typeName.right : node.typeName;
        const sym = checker.getSymbolAtLocation(name);
        if (sym) note(resolve(sym), from);
      } else if (ts.isExpressionWithTypeArguments(node) || ts.isTypeQueryNode(node)) {
        const expr = ts.isTypeQueryNode(node) ? node.exprName : node.expression;
        const sym = checker.getSymbolAtLocation(ts.isQualifiedName(expr) ? expr.right : expr);
        if (sym) note(resolve(sym), from);
      }
      ts.forEachChild(node, (c) => walk(c, from));
    };
    const parts = (d: import('typescript').Declaration): (import('typescript').Node | undefined)[] => {
      if (ts.isClassDeclaration(d))
        return [
          ...(d.heritageClauses ?? []),
          ...d.members.filter(isPublicMember).flatMap((m) => {
            if (ts.isMethodDeclaration(m) || ts.isConstructorDeclaration(m) || ts.isAccessor(m)) {
              return [...m.parameters.map((p) => p.type), m.type];
            }
            return ts.isPropertyDeclaration(m) ? [m.type] : [];
          }),
        ];
      if (ts.isInterfaceDeclaration(d)) return [...(d.heritageClauses ?? []), ...d.members];
      if (ts.isTypeAliasDeclaration(d)) return [d.type];
      if (ts.isFunctionDeclaration(d)) return [...d.parameters.map((p) => p.type), d.type];
      if (ts.isVariableDeclaration(d)) return [d.type];
      return [];
    };
    for (const sym of symbols)
      for (const d of sym.declarations ?? []) for (const p of parts(d)) if (p) walk(p, sym.getName());
    expect([...missing].map(([name, from]) => `${name} (in ${from})`)).toEqual([]);
  });

  // `export type *` would also hand out a value as a type-only name, which an
  // author's editor offers and a value import then rejects.
  it('exports no value as a type only', async () => {
    const runtime = new Set(Object.keys(await import('@diagc/core')));
    const { resolve, exports } = entryExports();
    const typeOnly = exports.filter((s) => resolve(s).flags & ts.SymbolFlags.Value && !runtime.has(s.getName()));
    expect(typeOnly.map((s) => s.getName())).toEqual([]);
  });

  it('is exported, name for name, by @diagc/core/internal too', () => {
    const internal = entryExports('internal.ts').names;
    expect([...entryExports().names].filter((name) => !internal.has(name))).toEqual([]);
  });

  it('is all that author-facing sources import', () => {
    const { names } = entryExports();
    const isDiagram = (f: string) => f.endsWith('.diagram.ts');
    const files = [
      ...walkFiles(path.join(root, '.diagrams/src'), isDiagram),
      ...walkFiles(path.join(root, 'packages/diagc/test-fixtures'), isDiagram),
      ...walkFiles(path.join(root, 'docs'), (f) => f.endsWith('.md')),
      ...walkFiles(path.join(root, 'packages/diagc/guide'), (f) => f.endsWith('.md')),
      path.join(root, 'README.md'),
      path.join(root, 'packages/core/README.md'),
      path.join(root, 'packages/diagc/README.md'),
      path.join(root, 'site/index.html'),
    ];
    const problems: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      if (/from\s+'@diagc\/core\/internal'/.test(text)) {
        problems.push(`${path.relative(root, file)} imports @diagc/core/internal`);
      }
      for (const m of text.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'@diagc\/core'/g)) {
        for (const raw of m[1]!.split(',')) {
          const name = raw
            .replace(/\btype\b/, '')
            .split(/\s+as\s+/)[0]!
            .trim();
          if (name !== '' && !names.has(name)) problems.push(`${path.relative(root, file)} imports ${name}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});

function walkFiles(dir: string, keep: (file: string) => boolean): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return walkFiles(full, keep);
    return keep(full) ? [full] : [];
  });
}
