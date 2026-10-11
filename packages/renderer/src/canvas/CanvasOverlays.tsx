import type { ReactElement } from 'react';
import type { DiagramModel, LayoutDirection } from '@diagc/core/internal';
import type { LoopEdgeInput } from '../loops/loops';
import { LoopLabelLayer } from '../loops/LoopLabelLayer';
import type { NotationProfile } from '../notations';
import { GitLanesOverlay } from '../overlays/GitLanesOverlay';
import { OrderBandsOverlay } from '../overlays/OrderBandsOverlay';
import { TimeAxisOverlay } from '../overlays/TimeAxisOverlay';
import type { StylePreset } from '../sketch/stylePresets';

export interface CanvasOverlaysProps {
  model: DiagramModel;
  plane: string | undefined;
  /** which notation overlay the canvas draws, if any */
  overlay: NotationProfile['canvasOverlay'];
  /** the layout has placed the boxes: every overlay waits for that */
  placed: boolean;
  flowDirection: LayoutDirection;
  today: string | null | undefined;
  /** the loop badges to draw, when they are shown */
  loopEdges: LoopEdgeInput[] | null;
  rough: StylePreset['rough'];
  /** view mode: the badges of the selected node's loops only */
  loopNodeFilter: string | null;
}

/** What the canvas draws over the boxes for a notation: loop badges, git lanes, order bands, a time axis. */
export function CanvasOverlays(props: CanvasOverlaysProps): ReactElement | null {
  if (!props.placed) return null;
  return (
    <>
      {props.loopEdges !== null && (
        <LoopLabelLayer edges={props.loopEdges} rough={props.rough} nodeFilter={props.loopNodeFilter} />
      )}
      {props.overlay === 'git-lanes' && <GitLanesOverlay model={props.model} plane={props.plane} />}
      {props.overlay === 'order-bands' && <OrderBandsOverlay model={props.model} direction={props.flowDirection} />}
      {props.overlay === 'time-axis' && <TimeAxisOverlay model={props.model} plane={props.plane} today={props.today} />}
    </>
  );
}
