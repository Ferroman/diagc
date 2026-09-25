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
  /** freehand drawing strokes that name no color */
  ink: string;
  /** the laser pointer's trail — one red for both themes, so it reads on any background */
  laser: string;
  /** a plan zone's bar tint strength (color-mix % against --dg-node-fill) */
  planZoneTint: string;
  /** the plan time-axis header band's tint strength (color-mix % against --dg-text) */
  planAxisBand: string;
  /** the plan time-axis grid lines' tint strength (color-mix % against --dg-text) */
  planAxisGrid: string;
  /** the plan time-axis month/week tick marks' colour */
  planAxisTick: string;
  /** the plan time-axis month label's colour (the stronger of the two labels) */
  planAxisMonthLabel: string;
  /** the plan time-axis week label's colour (a step below the month label) */
  planAxisWeekLabel: string;
  /** a plan role chip's background tint strength (color-mix % against transparent) */
  roleChipFill: string;
  /** a plan role chip's text colour: color-mix % of the person's own colour
   * mixed toward --dg-text (100% = the raw person colour, unmixed) */
  roleChipText: string;
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
  ink: '#1c2733',
  laser: '#ff2d55',
  // Light was tuned by hand and is the approved look — these reproduce its
  // exact current colours/strengths so the committed PNGs render unchanged.
  planZoneTint: '14%',
  planAxisBand: '4%',
  planAxisGrid: '8%',
  planAxisTick: '#d9dde3', // == lightTheme.border, the old literal the rule read
  planAxisMonthLabel: '#66737f', // == lightTheme.textMuted, the old shared rule
  planAxisWeekLabel: '#66737f',
  roleChipFill: '12%',
  roleChipText: '100%', // pure chip colour, unmixed — the old raw `--dg-chip` read
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
  ink: '#e6ebf0',
  laser: '#ff2d55',
  // A step stronger/brighter than the light values above — tuned against the
  // dark canvas (#12161b), where the light strengths measured near-invisible.
  planZoneTint: '24%',
  planAxisBand: '9%',
  planAxisGrid: '13%',
  planAxisTick: '#4c5a6b',
  planAxisMonthLabel: '#e6ebf0', // == darkTheme.text
  planAxisWeekLabel: '#aab6c2',
  roleChipFill: '24%',
  roleChipText: '55%', // mixed toward --dg-text so the person colour stays legible
};

const kebab = (s: string): string => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

export function themeToCssVars(t: ThemeTokens): Record<string, string> {
  return Object.fromEntries(Object.entries(t).map(([k, v]) => [`--dg-${kebab(k)}`, v]));
}

export function applyTheme(el: HTMLElement, t: ThemeTokens): void {
  for (const [k, v] of Object.entries(themeToCssVars(t))) el.style.setProperty(k, v);
}
