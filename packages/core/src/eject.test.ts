import { describe, expect, it } from 'vitest';
import { identifiersFor, tsLiteral } from './eject';

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

  it('renders numbers and booleans verbatim', () => {
    expect(tsLiteral(1.5, 0)).toBe('1.5');
    expect(tsLiteral(true, 0)).toBe('true');
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
