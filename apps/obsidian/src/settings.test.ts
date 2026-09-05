import { describe, expect, it } from 'vitest';
import { normalizeSettings } from './settings';

describe('normalizeSettings', () => {
  it('normalizes stored settings, rejecting traversal and absolute paths', () => {
    expect(normalizeSettings(undefined).diagramsFolder).toBe('diagrams');
    expect(normalizeSettings({ diagramsFolder: 'infra/diagrams' }).diagramsFolder).toBe('infra/diagrams');
    expect(normalizeSettings({ diagramsFolder: '../escape' }).diagramsFolder).toBe('diagrams');
    expect(normalizeSettings({ diagramsFolder: '/abs' }).diagramsFolder).toBe('diagrams');
  });
});
