import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { DEFAULT_STROKE_WIDTH, type Stroke } from '@diagc/core';
import { usePen, type PenHandlers } from './usePen';
import { useLaser } from './useLaser';
import type { DrawTool, PenSettings } from './view-types';

export interface CanvasGesturesInput {
  editing: boolean;
  tool: DrawTool | undefined;            // props.tool
  drillRoot: string | undefined;
  chromeless: boolean;                   // props.chrome === false
  builtinKeys: boolean;                  // props.builtinKeys !== false
  modelId: string;                       // props.model.id — the laser reset key
  pen: PenSettings | undefined;          // props.pen
  onAddStroke: ((stroke: Omit<Stroke, 'id'>) => void) | undefined; // edit?.onAddStroke
  toFlow: (p: { x: number; y: number }) => { x: number; y: number }; // reactFlow.screenToFlowPosition
}

export interface CanvasGestures {
  laserOn: boolean;
  setLaserOn: Dispatch<SetStateAction<boolean>>;
  penActive: boolean;
  eraserActive: boolean;
  gestureCaptured: boolean;
  pen: ReturnType<typeof usePen>;
  laser: ReturnType<typeof useLaser>;
  gestureHandlers: PenHandlers;
}

export function useCanvasGestures(input: CanvasGesturesInput): CanvasGestures {
  // Both tools are inert while drilled: drawings live at the top level only (the
  // layer below is hidden whenever drillRoot is set), so a gesture inside a
  // drilled view would append strokes to the top-level bucket that the person
  // drawing cannot see — and an eraser would delete ink they are not looking at.
  // The laser pointer is viewer state like drawingsVisible: never saved, reset
  // per diagram, and available in BOTH modes and while drilled — it is a light
  // on the screen, not ink in the sidecar, so the drawings gating below does not
  // apply. While it is on it owns the drag, so the studio's pen and eraser stand
  // down (their toolbar buttons stay pressed; switching the laser off hands the
  // gesture straight back).
  const [laserOn, setLaserOn] = useState(false);
  const penActive = input.editing && input.tool === 'pen' && input.drillRoot === undefined && !laserOn;
  const eraserActive = input.editing && input.tool === 'eraser' && input.drillRoot === undefined && !laserOn;
  /** pen or laser: a primary-button drag is captured, so React Flow must not pan/drag/select */
  const gestureCaptured = penActive || laserOn;
  useEffect(() => {
    setLaserOn(false);
  }, [input.modelId]);
  // L toggles the laser, Escape switches it off — window-level like the Alt
  // listener, ignored inside form fields and with a modifier held (Ctrl+L is the
  // browser's address bar). Not installed for the chrome-less export, which has
  // no control to show the state and no one at the keyboard. A host that owns
  // the keyboard (builtinKeys off) takes L over — it may have rebound it — but
  // never Escape: that is a cancel, and must work whatever the keymap says.
  useEffect(() => {
    if (input.chromeless) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable === true) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') setLaserOn(false);
      else if (input.builtinKeys && e.key.toLowerCase() === 'l' && !e.repeat) {
        e.preventDefault();
        setLaserOn((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [input.chromeless, input.builtinKeys]);
  const pen = usePen({
    enabled: penActive && input.onAddStroke !== undefined,
    toFlow: input.toFlow,
    onStroke: (points) =>
      input.onAddStroke?.({
        points,
        ...(input.pen?.color !== undefined ? { color: input.pen.color } : {}),
        width: input.pen?.width ?? DEFAULT_STROKE_WIDTH,
      }),
  });
  const laser = useLaser({ enabled: laserOn, toFlow: input.toFlow });
  // Both capture hooks stay attached at all times and each ignores pointers it
  // did not start: a handler swap on toggle would strand a gesture in flight
  // (pen stroke begun, L pressed mid-drag) with no up event to finish it. At
  // most one of them is enabled, so at most one claims a given pointerdown.
  const gestureHandlers = useMemo<PenHandlers>(() => {
    const both =
      (k: keyof PenHandlers): PenHandlers[keyof PenHandlers] =>
      (e) => {
        laser.handlers[k](e);
        pen.handlers[k](e);
      };
    return {
      onPointerDownCapture: both('onPointerDownCapture'),
      onPointerMoveCapture: both('onPointerMoveCapture'),
      onPointerUpCapture: both('onPointerUpCapture'),
      onPointerCancelCapture: both('onPointerCancelCapture'),
    };
  }, [laser.handlers, pen.handlers]);

  return { laserOn, setLaserOn, penActive, eraserActive, gestureCaptured, pen, laser, gestureHandlers };
}
