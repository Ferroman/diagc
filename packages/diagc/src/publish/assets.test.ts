import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { dataUri, rewriteAssetRefs, safeAssetPath } from './assets';

describe('safeAssetPath', () => {
  it('resolves a normal ref under the base', () => {
    expect(safeAssetPath('/lib', 'shapes/x.svg')).toBe(path.resolve('/lib', 'shapes/x.svg'));
  });
  it('returns undefined for a traversal ref that escapes the base', () => {
    expect(safeAssetPath('/lib', '../../etc/passwd')).toBeUndefined();
  });
  it('returns undefined when the ref resolves to the base dir itself (no file)', () => {
    expect(safeAssetPath('/lib', '')).toBeUndefined();
  });
});

describe('dataUri', () => {
  it('builds a base64 data URI with the ext mime', () => {
    expect(dataUri(Buffer.from('hi'), 'svg')).toBe('data:image/svg+xml;base64,aGk=');
    expect(dataUri(Buffer.from('x'), 'png')).toBe('data:image/png;base64,eA==');
  });
});

describe('rewriteAssetRefs', () => {
  const model = {
    id: 'm', nodes: [
      { id: 'a', name: 'A', shape: '/library/shapes/person.svg' },
      { id: 'b', name: 'B', image: '/api/assets/pic.png' },
      { id: 'c', name: 'C', image: 'https://ext/x.png' },
    ], containment: [], relations: [], layers: [], planes: [],
  } as any;
  it('inlines resolvable /library and /api/assets refs, leaves others', () => {
    const resolve = (ref: string) => (ref.includes('external') ? undefined : Buffer.from(ref));
    const out = rewriteAssetRefs(model, resolve);
    expect(out.nodes[0]!.shape!.startsWith('data:image/svg+xml;base64,')).toBe(true);
    expect(out.nodes[1]!.image!.startsWith('data:image/png;base64,')).toBe(true);
    expect(out.nodes[2]!.image).toBe('https://ext/x.png'); // untouched (not /library or /api/assets)
    expect(model.nodes[0]!.shape).toBe('/library/shapes/person.svg'); // original not mutated
  });
  it('leaves a ref whose resolver returns undefined', () => {
    const out = rewriteAssetRefs(model, () => undefined);
    expect(out.nodes[0]!.shape).toBe('/library/shapes/person.svg');
  });

  it('inlines a bare uploaded-asset ref (no leading slash, not a URL)', () => {
    const bare = {
      id: 'm', nodes: [{ id: 'a', name: 'A', image: 'pic.png' }],
      containment: [], relations: [], layers: [], planes: [],
    } as any;
    const resolve = (ref: string) => (ref === 'pic.png' ? Buffer.from('bytes') : undefined);
    const out = rewriteAssetRefs(bare, resolve);
    expect(out.nodes[0]!.image!.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('leaves data: and http(s): refs untouched even though a resolver is provided', () => {
    const untouched = {
      id: 'm', nodes: [
        { id: 'a', name: 'A', image: 'data:image/png;base64,eA==' },
        { id: 'b', name: 'B', image: 'http://ext/x.png' },
        { id: 'c', name: 'C', image: 'https://ext/x.png' },
      ], containment: [], relations: [], layers: [], planes: [],
    } as any;
    const resolve = () => Buffer.from('should not be used');
    const out = rewriteAssetRefs(untouched, resolve);
    expect(out.nodes[0]!.image).toBe('data:image/png;base64,eA==');
    expect(out.nodes[1]!.image).toBe('http://ext/x.png');
    expect(out.nodes[2]!.image).toBe('https://ext/x.png');
  });
});
