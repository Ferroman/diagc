import { useEffect, useState, type ReactNode } from 'react';

/** 7 hues × [light, base, dark]; the base (middle) column is the original preset set */
export const SHADE_PALETTE: readonly (readonly [string, string, string])[] = [
  ['#efb0b0', '#e05d5d', '#b83d3d'], // red
  ['#f0cfa3', '#e0a75d', '#b87c33'], // orange
  ['#f2e39a', '#e5c945', '#b89a1f'], // yellow
  ['#a8dcab', '#66bb6a', '#3f8f43'], // green
  ['#a0d0f9', '#42a5f5', '#1f78c8'], // blue
  ['#d3a3dd', '#ab47bc', '#7e2f8e'], // purple
  ['#c2c2c2', '#8d8d8d', '#5c5c5c'], // gray
];

/** the base (middle) shade of each hue — the compact swatch set for the toolbar */
export const PRESET_COLORS = SHADE_PALETTE.map((hue) => hue[1]);

/** all 21 shades in row-major order (all lights, then all bases, then all darks)
 * so a 7-column grid lays hues out as columns and shades as rows */
const SHADE_SWATCHES = ([0, 1, 2] as const).flatMap((shade) => SHADE_PALETTE.map((hue) => hue[shade]));

export interface PickerOption<T extends string> {
  value: T | '';
  title: string;
  glyph: ReactNode;
}

/** excalidraw-style row of small toggle buttons; '' is the "default" option */
export function OptionRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | '';
  options: PickerOption<T>[];
  onChange: (value: T | '') => void;
}) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="picker-row" role="group" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value === '' ? '(default)' : o.value}
            type="button"
            className={`picker-btn${value === o.value ? ' active' : ''}`}
            title={o.title}
            aria-label={o.title}
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
          >
            {o.glyph}
          </button>
        ))}
      </div>
    </div>
  );
}

/** swatch row + free-text CSS color; '' = default/auto */
export function ColorRow({
  label = 'Color',
  value,
  onChange,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => {
    setText(value);
  }, [value]);
  const commitText = () => {
    const trimmed = text.trim();
    if (trimmed !== value) onChange(trimmed);
  };
  return (
    <div className="field">
      <span>{label}</span>
      <div role="group" aria-label={label}>
        <div className="picker-row">
          <button
            type="button"
            className={`picker-btn${value === '' ? ' active' : ''}`}
            title="Auto (default color)"
            aria-label={`Auto ${label.toLowerCase()}`}
            aria-pressed={value === ''}
            onClick={() => onChange('')}
          >
            ∅
          </button>
          <input
            className="swatch-text"
            aria-label={`${label} value`}
            placeholder="#hex"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={commitText}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitText();
              }
            }}
          />
        </div>
        <div className="swatch-grid">
          {SHADE_SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              className={`picker-btn swatch${value === c ? ' active' : ''}`}
              style={{ background: c }}
              title={c}
              aria-label={`${label} ${c}`}
              aria-pressed={value === c}
              onClick={() => onChange(c)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
