import { describe, expect, it } from 'vitest';
import type { DiagramModel, DiagramNode } from './types';
import { ejectSource, identifiersFor, tsLiteral } from './eject';
import { model as buildModel } from './builder';

describe('identifiersFor', () => {
  it('camelCases separators and preserves simple ids', () => {
    const m = identifiersFor(['user', 'note-1', 'api_gateway', 'a.b']);
    expect(m.get('user')).toBe('user');
    expect(m.get('note-1')).toBe('note1');
    expect(m.get('api_gateway')).toBe('apiGateway');
    expect(m.get('a.b')).toBe('aB');
  });

  it('prefixes ids that cannot start an identifier', () => {
    const m = identifiersFor(['1st', '-x', '']);
    expect(m.get('1st')).toBe('n1st');
    expect(m.get('-x')).toBe('x');
    expect(m.get('')).toBe('n');
  });

  it('suffixes collisions and reserved words deterministically', () => {
    const m = identifiersFor(['a-b', 'a.b', 'class', 'm', 'model']);
    expect(m.get('a-b')).toBe('aB');
    expect(m.get('a.b')).toBe('aB2');
    expect(m.get('class')).toBe('class2');
    expect(m.get('m')).toBe('m2'); // 'm' is the builder binding in the emitted file
    expect(m.get('model')).toBe('model2'); // so is the 'model' import
  });
});

describe('tsLiteral', () => {
  it('quotes and escapes strings', () => {
    expect(tsLiteral("it's", 0)).toBe("'it\\'s'");
    expect(tsLiteral('a\nb', 0)).toBe("'a\\nb'");
  });

  it('escapes carriage returns', () => {
    expect(tsLiteral('a\r\nb', 0)).toBe("'a\\r\\nb'");
    expect(tsLiteral('lone\rcr', 0)).toBe("'lone\\rcr'");
  });

  it('renders numbers and booleans verbatim', () => {
    expect(tsLiteral(1.5, 0)).toBe('1.5');
    expect(tsLiteral(true, 0)).toBe('true');
  });

  it('renders null as the literal null — it round-trips through the builder', () => {
    expect(tsLiteral(null, 0)).toBe('null');
  });

  it('renders null nested inside an object inline', () => {
    expect(tsLiteral({ x: null }, 0)).toBe('{ x: null }');
  });

  it('still throws on undefined — it cannot round-trip, JSON has no undefined', () => {
    expect(() => tsLiteral(undefined, 0)).toThrow(/undefined/);
  });

  it('renders short objects and arrays inline', () => {
    expect(tsLiteral({ id: 'l1', text: 'hi' }, 0)).toBe("{ id: 'l1', text: 'hi' }");
    expect(tsLiteral(['a', 'b'], 0)).toBe("['a', 'b']");
  });

  it('quotes keys that are not identifier-safe', () => {
    expect(tsLiteral({ '*': '#999999' }, 0)).toBe("{ '*': '#999999' }");
  });

  it('breaks long structures across lines with two-space indent', () => {
    const runs = [
      { text: 'a long opening run of text', bold: true },
      { text: 'and a second long italic run here', italic: true },
    ];
    expect(tsLiteral(runs, 0)).toBe(
      [
        '[',
        "  { text: 'a long opening run of text', bold: true },",
        "  { text: 'and a second long italic run here', italic: true },",
        ']',
      ].join('\n'),
    );
  });
});

describe('ejectSource', () => {
  const input: DiagramModel = {
    version: 1,
    id: 'shop',
    name: 'Web shop',
    style: 'sketch',
    notation: 'c4',
    typeColors: { '*': '#999999' },
    nodes: [
      { id: 'user', name: 'Customer', type: 'c4-person' },
      { id: 'shop', name: 'shop', type: 'c4-system' },
      { id: 'db', name: 'Orders DB', type: 'c4-container-db', technology: 'PostgreSQL' },
      { id: 'note-1', name: 'Standalone note' },
    ],
    containment: [{ parent: 'shop', child: 'db' }],
    relations: [
      { id: 'user->shop#0', from: 'user', to: 'shop', kind: 'sync', label: 'Buys [HTTPS]' },
      { id: 'r-custom', from: 'user', to: 'shop', kind: 'async' },
    ],
    layers: [{ id: 'infra', name: 'Infrastructure', tint: '#88aaff' }],
    planes: [{ id: 'main', name: 'Main' }],
  };

  it('emits the golden source for a representative model', () => {
    expect(ejectSource(input)).toBe(
      [
        "import { model } from '@diagramming/core';",
        '',
        "const m = model('shop', { name: 'Web shop' });",
        '',
        "m.plane('main', { name: 'Main' });",
        '',
        "m.layer('infra', { name: 'Infrastructure', tint: '#88aaff' });",
        '',
        "const user = m.node('user', { type: 'c4-person', name: 'Customer' });",
        "const shop = m.node('shop', { type: 'c4-system' });",
        "const db = m.node('db', { type: 'c4-container-db', name: 'Orders DB', technology: 'PostgreSQL' });",
        "m.node('note-1', { name: 'Standalone note' });",
        '',
        'shop.contains(db);',
        '',
        "m.relate(user, shop, { kind: 'sync', label: 'Buys [HTTPS]' });",
        "m.relate(user, shop, { kind: 'async', id: 'r-custom' });",
        '',
        "m.typeColors({ '*': '#999999' });",
        "m.notation('c4');",
        "m.style('sketch');",
        '',
        'export default m;',
        '',
      ].join('\n'),
    );
  });

  it('is deterministic', () => {
    expect(ejectSource(input)).toBe(ejectSource(input));
  });

  it('groups consecutive same-plane containment and tags planes', () => {
    const m: DiagramModel = {
      version: 1, id: 't', name: 't',
      nodes: [
        { id: 'p', name: 'p' }, { id: 'a', name: 'a' }, { id: 'b', name: 'b' }, { id: 'c', name: 'c' },
      ],
      containment: [
        { parent: 'p', child: 'a' },
        { parent: 'p', child: 'b' },
        { parent: 'p', child: 'c', plane: 'alt' },
      ],
      relations: [], layers: [],
      planes: [{ id: 'main', name: 'main' }, { id: 'alt', name: 'alt' }],
    };
    const src = ejectSource(m);
    expect(src).toContain('p.contains(a, b);');
    expect(src).toContain("p.contains(c, { plane: 'alt' });");
  });

  it('elides the model name and node names equal to their ids', () => {
    const m: DiagramModel = {
      version: 1, id: 't', name: 't',
      nodes: [{ id: 'a', name: 'a' }], containment: [], relations: [], layers: [], planes: [],
    };
    const src = ejectSource(m);
    expect(src).toContain("const m = model('t');\n");
    expect(src).toContain("m.node('a');");
  });

  it('emits legend and layerRules when present', () => {
    const m: DiagramModel = {
      version: 1, id: 't', name: 't',
      legend: { position: 'top-left', items: [{ label: 'x', color: '#123456' }] },
      layerRules: [{ kind: 'sync', layer: 'infra' }],
      nodes: [], containment: [], relations: [],
      layers: [{ id: 'infra', name: 'infra' }], planes: [],
    };
    const src = ejectSource(m);
    expect(src).toContain("m.layerRules([{ kind: 'sync', layer: 'infra' }]);");
    expect(src).toContain("m.legend({ position: 'top-left', items: [{ label: 'x', color: '#123456' }] });");
  });

  it('omits the name opt for a node with no name — hand-edited JSON, validate-clean, honestly unejectable', () => {
    const m: DiagramModel = {
      version: 1, id: 't', name: 't',
      // validate() does not require `name`; a hand-edited JSON can omit it even
      // though the TS type says it's required.
      nodes: [{ id: 'a' } as unknown as DiagramNode],
      containment: [], relations: [], layers: [], planes: [],
    };
    const src = ejectSource(m);
    expect(src).toContain("m.node('a');");
    expect(src).not.toContain('name:');
  });

  it('elides only relation ids that match the position-synthesized id, and replaying the emitted relate() calls through the real builder reproduces every original id', () => {
    const m: DiagramModel = {
      version: 1, id: 't', name: 't',
      nodes: [{ id: 'a', name: 'a' }, { id: 'b', name: 'b' }, { id: 'c', name: 'c' }],
      containment: [], layers: [], planes: [],
      relations: [
        { id: 'a->b#0', from: 'a', to: 'b', kind: 'sync' }, // matches synthesized -> elided
        { id: 'custom-1', from: 'a', to: 'b', kind: 'async' }, // custom -> kept, counter still advances
        { id: 'a->b#2', from: 'a', to: 'b', kind: 'sync' }, // matches synthesized at position 2 -> elided
        { id: 'a->c#0', from: 'a', to: 'c', kind: 'sync' }, // different pair, position 0 -> elided
      ],
    };
    const src = ejectSource(m);

    // Every m.relate(...) line, in source order.
    const relateLines = [...src.matchAll(/^m\.relate\(([^)]*)\);$/gm)].map((mm) => mm[1]!);
    expect(relateLines).toHaveLength(4);

    // Parse the two identifiers and the opts object off each call. Only `kind`
    // and `id` are used by this model, so a small targeted regex suffices —
    // this is not a general TS interpreter, just enough to replay these calls.
    const parsed = relateLines.map((line) => {
      const call = /^(\w+), (\w+), \{ (.+) \}$/.exec(line);
      if (!call) throw new Error(`unparseable m.relate(...) line: ${line}`);
      const [, from, to, body] = call as unknown as [string, string, string, string];
      const kindMatch = /kind: '([^']*)'/.exec(body);
      const idMatch = /id: '([^']*)'/.exec(body);
      return { from: from!, to: to!, kind: kindMatch![1]!, id: idMatch?.[1] };
    });

    // Replay through the actual builder (Task 1), in emitted order.
    const replay = buildModel('t');
    const refs = new Map(['a', 'b', 'c'].map((id) => [id, replay.node(id)]));
    for (const call of parsed) {
      replay.relate(refs.get(call.from)!, refs.get(call.to)!, {
        kind: call.kind,
        ...(call.id !== undefined ? { id: call.id } : {}),
      });
    }
    const replayedIds = replay.toJSON().relations.map((r) => r.id);
    expect(replayedIds).toEqual(m.relations.map((r) => r.id));
  });
});
