export interface DiagrammingSettings {
  /** vault-relative folder laid out as a diagc project dir (src/, .artifacts/) */
  diagramsFolder: string;
}

export const DEFAULT_SETTINGS: DiagrammingSettings = { diagramsFolder: 'diagrams' };

/** Stored plugin data is user-editable JSON: anything that isn't a safe
 * vault-relative path falls back to the default rather than letting the fs
 * layer resolve outside the vault. */
export function normalizeSettings(raw: unknown): DiagrammingSettings {
  const folder = (raw as { diagramsFolder?: unknown } | undefined)?.diagramsFolder;
  if (typeof folder !== 'string') return { ...DEFAULT_SETTINGS };
  const trimmed = folder.trim().replace(/\/+$/, '');
  const unsafe = trimmed === '' || trimmed.startsWith('/') || trimmed.split('/').some((s) => s === '' || s === '.' || s === '..');
  return unsafe ? { ...DEFAULT_SETTINGS } : { diagramsFolder: trimmed };
}
