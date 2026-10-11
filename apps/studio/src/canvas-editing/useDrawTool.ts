import { useEffect, useState } from 'react';
import { DEFAULT_STROKE_WIDTH } from '@diagc/core/internal';
import type { DrawTool } from '@diagc/renderer';

export interface UseDrawToolOptions {
  editing: boolean;
  /** the open diagram: switching to another drops the pen */
  selected: string;
  /** the drill trail: drawing is refused while drilled in */
  enteredPath: string[];
}

export interface DrawToolState {
  tool: DrawTool;
  penColor: string;
  penWidth: number;
  setTool: (tool: DrawTool) => void;
  setPen: (patch: { color?: string; width?: number }) => void;
  /** The Pen and Eraser keys: the handler takes the tool, or answers false
   * while drilled in, where the toolbar's chips are disabled. */
  drawWith: (tool: DrawTool) => () => boolean;
}

/**
 * The canvas tool and the pen's settings. Viewer state: never saved, and back to
 * Select on leaving edit mode or switching diagram so a pen never lingers
 * invisibly.
 */
export function useDrawTool({ editing, selected, enteredPath }: UseDrawToolOptions): DrawToolState {
  const [tool, setTool] = useState<DrawTool>('select');
  const [penColor, setPenColor] = useState('');
  const [penWidth, setPenWidth] = useState<number>(DEFAULT_STROKE_WIDTH);

  // Leaving edit mode or switching diagram drops the pen (see above): Pen/Eraser
  // only exist in edit mode, and a tool that survived either transition would
  // keep swallowing canvas clicks with nothing to draw on. Drilling in resets
  // too — drawings are a top-level layer, so the toolbar disables both tools
  // there and the state must follow, or the UI would show Pen pressed on a
  // canvas that cannot draw.
  useEffect(() => {
    if (!editing || enteredPath.length > 0) setTool('select');
  }, [editing, selected, enteredPath]);

  return {
    tool,
    penColor,
    penWidth,
    setTool,
    setPen: (patch) => {
      if (patch.color !== undefined) setPenColor(patch.color);
      if (patch.width !== undefined) setPenWidth(patch.width);
    },
    // Pen/Eraser are refused while drilled in, matching the toolbar chips, which
    // are disabled there (drawings are a top-level layer): a chip that reads
    // pressed while disabled, and a pen that springs to life the moment you drill
    // back out, is a first-hour contradiction. Select always gets through.
    drawWith: (t) => () => {
      if (enteredPath.length > 0) return false;
      setTool(t);
      return true;
    },
  };
}
