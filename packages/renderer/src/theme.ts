export interface ThemeTokens {
  bg: string;
  surface: string;
  border: string;
  text: string;
  textMuted: string;
  nodeFill: string;
  nodeStroke: string;
  groupFill: string;
  groupStroke: string;
  edge: string;
  edgeLabelBg: string;
  accent: string;
  badgeBg: string;
  badgeText: string;
  tableHeaderBg: string;
  tableHeaderText: string;
  tableBorder: string;
  tableRowText: string;
  tableTypeText: string;
  tablePk: string;
  tableFk: string;
  /** causal-loop '+' (same-direction) links and their glyph */
  polarityPositive: string;
  /** causal-loop '−' (opposing) links and their glyph */
  polarityNegative: string;
}

export const lightTheme: ThemeTokens = {
  bg: '#f6f7f9',
  surface: '#ffffff',
  border: '#d9dde3',
  text: '#1c2733',
  textMuted: '#66737f',
  nodeFill: '#ffffff',
  nodeStroke: '#8494a5',
  groupFill: 'rgba(132, 148, 165, 0.08)',
  groupStroke: '#a7b4c2',
  edge: '#66737f',
  edgeLabelBg: '#eef1f4',
  accent: '#2563eb',
  badgeBg: '#2563eb',
  badgeText: '#ffffff',
  tableHeaderBg: '#eef1f5',
  tableHeaderText: '#1c2733',
  tableBorder: '#c3ccd6',
  tableRowText: '#243244',
  tableTypeText: '#66737f',
  tablePk: '#b8860b',
  tableFk: '#2563eb',
  polarityPositive: '#1f8a4c',
  polarityNegative: '#c2413c',
};

export const darkTheme: ThemeTokens = {
  bg: '#12161b',
  surface: '#1b222b',
  border: '#2d3743',
  text: '#e6ebf0',
  textMuted: '#8b98a5',
  nodeFill: '#1f2833',
  nodeStroke: '#5d6d7f',
  groupFill: 'rgba(93, 109, 127, 0.12)',
  groupStroke: '#4a5a6b',
  edge: '#8b98a5',
  edgeLabelBg: '#242e39',
  accent: '#60a5fa',
  badgeBg: '#60a5fa',
  badgeText: '#0c1116',
  tableHeaderBg: '#243040',
  tableHeaderText: '#e6ebf0',
  tableBorder: '#3a4756',
  tableRowText: '#cdd7e2',
  tableTypeText: '#8b98a5',
  tablePk: '#e0b341',
  tableFk: '#60a5fa',
  polarityPositive: '#5dd39e',
  polarityNegative: '#f28b82',
};

const kebab = (s: string): string => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

export function themeToCssVars(t: ThemeTokens): Record<string, string> {
  return Object.fromEntries(Object.entries(t).map(([k, v]) => [`--dg-${kebab(k)}`, v]));
}

export function applyTheme(el: HTMLElement, t: ThemeTokens): void {
  for (const [k, v] of Object.entries(themeToCssVars(t))) el.style.setProperty(k, v);
}
