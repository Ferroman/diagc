import { describe, expect, it } from 'vitest';
import { BUILTIN_ICON_IDS, createIconRegistry } from '@diagramming/icons';
import { createKindRegistry, createTypeRegistry, DEFAULT_TYPE_STYLES } from './registry';

describe('registries', () => {
  it('resolves defaults and falls back generically for unknown ids', () => {
    const types = createTypeRegistry();
    expect(types.resolve('database').shape).toBe('cylinder');
    expect(types.resolve('aws-rds')).toEqual({ shape: 'cylinder', icon: 'cloud' });
    expect(types.resolve('made-up-type')).toEqual({ shape: 'box' });
    const kinds = createKindRegistry();
    expect(kinds.resolve('async').dashed).toBe(true);
    expect(kinds.resolve('made-up-kind')).toEqual({});
  });

  it('accepts overrides at creation and registration afterwards', () => {
    const types = createTypeRegistry({ 'kafka-topic': { shape: 'pill', icon: 'queue' } });
    expect(types.resolve('kafka-topic').icon).toBe('queue');
    types.register('service', { shape: 'hexagon' });
    expect(types.resolve('service').shape).toBe('hexagon');
  });

  it('resolves C4 type styles with labels and outline flag', () => {
    const types = createTypeRegistry();
    expect(types.resolve('c4-system')).toEqual({ shape: 'box', label: '[Software System]', outline: true });
    expect(types.resolve('c4-person').label).toBe('[Person]');
    expect(types.resolve('c4-container').outline).toBe(true);
  });

  it('styles every C4 level, its external twins and its boundaries', () => {
    const types = createTypeRegistry();
    // A missing id would silently fall back to a plain box with no subtitle, so
    // assert the whole C4 vocabulary the library places is actually styled.
    for (const id of [
      'c4-person-external',
      'c4-system-external',
      'c4-container-external',
      'c4-component-external',
      'c4-enterprise-boundary',
      'c4-system-boundary',
      'c4-container-boundary',
      'c4-deployment-node',
      'c4-infrastructure-node',
      'c4-container-instance',
      'c4-class',
      'c4-interface',
    ]) {
      expect(types.resolve(id).label, id).toBeDefined();
    }
    expect(types.resolve('c4-container-db').shape).toBe('cylinder');
    expect(types.resolve('c4-container-queue').shape).toBe('pill');
    for (const id of ['c4-enterprise-boundary', 'c4-system-boundary', 'c4-deployment-node']) {
      expect(types.resolve(id).dashed, id).toBe(true);
    }
  });

  it('only names icons the icon registry can resolve', () => {
    const icons = createIconRegistry();
    for (const [id, style] of Object.entries(DEFAULT_TYPE_STYLES)) {
      if (style.icon === undefined) continue;
      expect(icons.resolve(style.icon), `type '${id}' wants unknown icon '${style.icon}'`).toBeDefined();
      expect(BUILTIN_ICON_IDS).toContain(style.icon);
    }
  });

  it('resolves comment to the speech-bubble shape with its own glyph', () => {
    expect(createTypeRegistry().resolve('comment')).toEqual({ shape: 'bubble', icon: 'comment' });
  });

  it('resolves db-table to the table shape', () => {
    expect(createTypeRegistry().resolve('db-table').shape).toBe('table');
  });

  it('fk kind carries crow-foot markers', () => {
    const k = createKindRegistry().resolve('fk');
    expect(k.startMarker).toBe('crowsfoot');
    expect(k.endMarker).toBe('one');
  });
});
