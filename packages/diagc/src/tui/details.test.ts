import { describe, expect, it } from 'vitest';
import type { DiagramModel } from '@diagc/core/internal';
import { cellWidth, isControl } from '../text/width';
import { detailLines } from './details';

const model: DiagramModel = {
  version: 1,
  id: 'm',
  name: 'm',
  nodes: [
    { id: 'p', name: 'Platform' },
    {
      id: 'a',
      name: 'Checkout API',
      type: 'c4-container',
      technology: 'Java 21',
      description: 'Takes the order, prices it and charges the card before anything ships.',
      link: 'https://example.com/checkout',
      links: [{ label: 'Runbook', url: 'https://example.com/runbook' }],
      threats: [{ id: 't1', category: 'S', title: 'Spoofed webhook', severity: 'high' }],
      comments: [{ id: 'c1', text: 'Split this before Q4', by: 'Ana', at: '2026-10-01' }],
    },
    { id: 'b', name: 'Payments' },
    { id: 'c', name: 'Storefront' },
  ],
  containment: [{ parent: 'p', child: 'a' }],
  relations: [
    { id: 'r1', from: 'a', to: 'b', kind: 'sync', label: 'charges a card' },
    { id: 'r2', from: 'c', to: 'a', kind: 'sync' },
  ],
  layers: [],
  planes: [],
};

describe('detailLines', () => {
  it('says what a box is, where it sits and what it talks to', () => {
    const lines = detailLines(model, 'a', 60);
    expect(lines.slice(0, 3)).toEqual(['Checkout API', '[Container: Java 21]', 'id a']);
    for (const line of [
      'Takes the order, prices it and charges the card before',
      'Inside Platform',
      '→ Payments  charges a card',
      '← Storefront',
      '[S] Spoofed webhook (high, open)',
      'Ana 2026-10-01: Split this before Q4',
      'Runbook https://example.com/runbook',
      'link https://example.com/checkout',
    ]) {
      expect(lines).toContain(line);
    }
  });

  it('wraps every line to the width', () => {
    for (const line of detailLines(model, 'a', 20)) expect(cellWidth(line)).toBeLessThanOrEqual(20);
  });

  it('leaves out what a box does not have', () => {
    expect(detailLines(model, 'b', 40)).toEqual(['Payments', 'id b', '', 'In', '← Checkout API  charges a card']);
  });

  it('keeps every line on one row, a description’s line breaks included', () => {
    const multi = {
      ...model,
      nodes: [{ id: 'x', name: 'Two\nlines', description: 'first\nsecond', comments: [{ id: 'c', text: 'a\x1bb' }] }],
    };
    const lines = detailLines(multi, 'x', 40);
    expect(lines.slice(0, 1)).toEqual(['Two lines']);
    expect(lines).toContain('first');
    expect(lines).toContain('second');
    for (const line of lines) expect([...line].some((ch) => isControl(ch.codePointAt(0)!))).toBe(false);
  });

  it('gives nothing for a node it does not know', () => {
    expect(detailLines(model, 'nope', 40)).toEqual([]);
  });
});
