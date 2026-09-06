// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { obsidianTheme } from './theme';

describe('obsidianTheme', () => {
  it("maps Obsidian's body class to a scheme, defaulting light", () => {
    const body = document.createElement('body');
    expect(obsidianTheme(body)).toBe('light'); // no class at all → light
    body.classList.add('theme-dark');
    expect(obsidianTheme(body)).toBe('dark');
    body.classList.replace('theme-dark', 'theme-light');
    expect(obsidianTheme(body)).toBe('light');
  });
});
