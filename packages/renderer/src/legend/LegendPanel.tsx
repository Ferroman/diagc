import { Panel } from '@xyflow/react';
import type { IconRegistry } from '@diagc/icons';
import { Legend } from './Legend';
import type { LegendState } from './useLegendState';

export interface LegendPanelProps {
  legend: Pick<LegendState, 'legendConfig' | 'showLegend' | 'legendRowList' | 'setLegendSize'>;
  /** rows are buttons: false in the chrome-less export */
  interactive: boolean;
  onToggleLayer: ((layerId: string) => void) | undefined;
  onToggleDrawings: () => void;
  icons: IconRegistry;
}

/** The legend in its corner of the canvas, while it is shown and has rows. */
export function LegendPanel({ legend, interactive, onToggleLayer, onToggleDrawings, icons }: LegendPanelProps) {
  if (!legend.showLegend || legend.legendRowList.length === 0) return null;
  return (
    // LegendPosition is a subset of React Flow's PanelPosition — no cast needed.
    <Panel position={legend.legendConfig?.position ?? 'bottom-right'}>
      <Legend
        rows={legend.legendRowList}
        title={legend.legendConfig?.title}
        interactive={interactive}
        onToggleLayer={onToggleLayer}
        // Same derivation as `interactive`: Legend decides "is this row a
        // button" from the handler alone, so a chrome-less host (the PNG
        // export) must get no handler — or the export would carry a focusable
        // control nothing can press.
        onToggleDrawings={interactive ? onToggleDrawings : undefined}
        icons={icons}
        onMeasure={legend.setLegendSize}
      />
    </Panel>
  );
}
