import type { ReactElement } from 'react';
import type { LoopHighlight } from '../../loops/loop-highlight';
import type { NotationProfile } from '../../notations';
import type { TypeStyle } from '../../registry';
import type { DiagramNodeData } from '../DiagramNode';

/** What DiagramNode works out once, for whichever body draws the node. */
export interface NodeParts {
  /** the registry's look for the node's type; an untyped node is a plain box */
  style: TypeStyle;
  /** the name, or the rename field while it is being edited */
  name: ReactElement;
  /** the loop or focus highlight's class for this node; '' outside one */
  loopClass: string;
  /** the canvas's loop or focus highlight */
  highlight: LoopHighlight;
  /** a drill view's external stub: rendered by the body the node it stands in
   * for would get, so it looks like that entity, ghosted (translucent, dashed)
   * with a ↗ marker; a click drills into the node. Empty for any other node. */
  ghost: { className: string; title: { title?: string }; arrow: ReactElement | null };
  /** Tab inside an open label editor: the same offer the quick-add button makes */
  onTab: (() => void) | undefined;
}

export interface BodyProps {
  id: string;
  data: DiagramNodeData;
  selected: boolean | undefined;
  width: number | undefined;
  height: number | undefined;
  profile: NotationProfile;
  parts: NodeParts;
}

/** A body, and the nodes it draws (see NODE_BODIES). */
export interface BodyRule {
  match: (data: DiagramNodeData, profile: NotationProfile, style: TypeStyle) => boolean;
  Body: (props: BodyProps) => ReactElement | null;
}
