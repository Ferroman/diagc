import { describe, expect, it } from 'vitest';
import { entryToNode, entryToNodeDetails, mergeLibrary, searchLibrary, uniqueLibraryId } from './entry';
import type { Library, LibraryEntry } from './types';

const person: LibraryEntry = { id: 'c4-person', category: 'c4', name: 'Person', keywords: ['actor'], template: { type: 'c4-person', color: '#08427b', width: 120, height: 90 } };
const lambda: LibraryEntry = { id: 'aws-lambda', category: 'aws', name: 'Lambda', keywords: ['faas'], template: { type: 'image', image: '/library/aws/lambda.svg' } };
const builtin: Library = { categories: [{ id: 'c4', name: 'C4', builtin: true }, { id: 'aws', name: 'AWS', builtin: true }], entries: [person, lambda] };

describe('entryToNode', () => {
  it('stamps template fields + identity onto a node', () => {
    expect(entryToNode(person, 'n1')).toEqual({ id: 'n1', name: 'Person', type: 'c4-person', color: '#08427b' });
  });
  it('applies plane and layer scoping when given', () => {
    expect(entryToNode(lambda, 'icon1', { plane: 'infra', layer: 'l1' })).toEqual({ id: 'icon1', name: 'Lambda', type: 'image', image: '/library/aws/lambda.svg', plane: 'infra', layer: 'l1' });
  });
  it('omits absent template fields (no undefined keys)', () => {
    const n = entryToNode({ id: 'x', category: 'c4', name: 'Box', template: { color: '#111' } }, 'n2');
    expect(n).toEqual({ id: 'n2', name: 'Box', color: '#111' });
    expect('type' in n).toBe(false);
    expect('image' in n).toBe(false);
  });
  it('stamps a shape ref onto the node', () => {
    const e = { id: 'p', category: 'c4', name: 'Person', template: { type: 'c4-person', color: '#08427b', shape: '/library/shapes/person.svg' } };
    expect(entryToNode(e, 'n1')).toEqual({ id: 'n1', name: 'Person', type: 'c4-person', color: '#08427b', shape: '/library/shapes/person.svg' });
  });
});

describe('entryToNodeDetails', () => {
  // Applying a card to an existing node is a TOTAL replace of the visual channels:
  // the four fields the template governs (type/color/image/shape) are all set,
  // and any the card doesn't carry are cleared (null) so no stale look lingers.
  it('replaces type+color+shape and clears the counterpart image for a shape card', () => {
    const shapeCard: LibraryEntry = { id: 'p', category: 'c4', name: 'Person', template: { type: 'c4-person', color: '#08427b', shape: '/library/shapes/person.svg', width: 90, height: 110 } };
    expect(entryToNodeDetails(shapeCard)).toEqual({ type: 'c4-person', color: '#08427b', image: null, shape: '/library/shapes/person.svg' });
  });
  it('sets image and clears shape+color for an image card', () => {
    expect(entryToNodeDetails(lambda)).toEqual({ type: 'image', color: null, image: '/library/aws/lambda.svg', shape: null });
  });
  it('clears both silhouette channels for a colored-box card', () => {
    const box: LibraryEntry = { id: 's', category: 'c4', name: 'System', template: { type: 'c4-system', color: '#1168bd' } };
    expect(entryToNodeDetails(box)).toEqual({ type: 'c4-system', color: '#1168bd', image: null, shape: null });
  });
  it('clears type when the card is typeless', () => {
    const box: LibraryEntry = { id: 'x', category: 'c4', name: 'Box', template: { color: '#111' } };
    expect(entryToNodeDetails(box)).toEqual({ type: null, color: '#111', image: null, shape: null });
  });
});

describe('searchLibrary', () => {
  it('returns all entries for an empty/whitespace query', () => {
    expect(searchLibrary(builtin, '  ')).toHaveLength(2);
  });
  it('matches name, keywords and category name, case-insensitively', () => {
    expect(searchLibrary(builtin, 'PERSON').map((e) => e.id)).toEqual(['c4-person']);
    expect(searchLibrary(builtin, 'faas').map((e) => e.id)).toEqual(['aws-lambda']);
    expect(searchLibrary(builtin, 'aws').map((e) => e.id)).toEqual(['aws-lambda']);
    expect(searchLibrary(builtin, 'zzz')).toHaveLength(0);
  });
});

describe('mergeLibrary', () => {
  const user: Library = {
    categories: [{ id: 'gcp', name: 'GCP' }, { id: 'aws', name: 'HIJACK' }],
    entries: [
      { id: 'gcp-bq', category: 'gcp', name: 'BigQuery', template: { type: 'image', image: 'abc.svg' } },
      { id: 'aws-lambda', category: 'aws', name: 'SHADOW', template: { color: '#000' } },
      { id: 'orphan', category: 'nope', name: 'Orphan', template: { color: '#000' } },
    ],
  };
  it('appends user categories/entries, builtin wins on id, drops orphan-category entries', () => {
    const merged = mergeLibrary(builtin, user);
    expect(merged.categories.map((c) => c.id)).toEqual(['c4', 'aws', 'gcp']); // 'aws' not duplicated
    expect(merged.categories.find((c) => c.id === 'aws')?.name).toBe('AWS'); // builtin wins
    expect(merged.entries.map((e) => e.id)).toEqual(['c4-person', 'aws-lambda', 'gcp-bq']); // shadow + orphan dropped
    expect(merged.entries.find((e) => e.id === 'aws-lambda')?.name).toBe('Lambda'); // builtin wins
  });
});

describe('uniqueLibraryId', () => {
  it('slugifies and suffixes on collision', () => {
    expect(uniqueLibraryId('Cloud Run', new Set(), 'cat')).toBe('cloud-run');
    expect(uniqueLibraryId('Cloud Run', new Set(['cloud-run']), 'cat')).toBe('cloud-run-2');
    expect(uniqueLibraryId('***', new Set(['cat']), 'cat')).toBe('cat-2');
  });
});

describe('entryToNode columns', () => {
  it('entryToNode stamps template columns', () => {
    const entry = { id: 'data-table', category: 'data', name: 'Table',
      template: { type: 'db-table', columns: [{ name: 'id', type: 'int', pk: true }] } };
    const node = entryToNode(entry as any, 'accounts');
    expect(node.type).toBe('db-table');
    expect(node.columns).toEqual([{ name: 'id', type: 'int', pk: true }]);
  });
});
