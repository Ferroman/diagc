import type { Bounds } from './content-bounds';
import { MIN_ZOOM } from './useLayoutApi';

/** React Flow's viewport: the translation and the zoom */
export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface Frame {
  width: number;
  height: number;
}

/**
 * Where the camera goes to show `box` (flow coordinates) in a frame of
 * `frame` screen px with `pad` px clear around it: nowhere (null) when the box
 * is already in view; the same zoom, panned the least that brings it in, when
 * the box fits at this zoom; and the zoom that fits it, centred, when it does
 * not. It never zooms in — a box that fits is brought to the reader, not
 * enlarged under them — and never past the canvas's own floor.
 */
export function revealViewport(box: Bounds, camera: Camera, frame: Frame, pad: number): Camera | null {
  const { zoom } = camera;
  const left = box.x * zoom + camera.x;
  const top = box.y * zoom + camera.y;
  const right = left + box.width * zoom;
  const bottom = top + box.height * zoom;
  const maxRight = frame.width - pad;
  const maxBottom = frame.height - pad;
  if (left >= pad && top >= pad && right <= maxRight && bottom <= maxBottom) return null;
  if (box.width * zoom + 2 * pad <= frame.width && box.height * zoom + 2 * pad <= frame.height) {
    const dx = left < pad ? pad - left : right > maxRight ? maxRight - right : 0;
    const dy = top < pad ? pad - top : bottom > maxBottom ? maxBottom - bottom : 0;
    return { x: camera.x + dx, y: camera.y + dy, zoom };
  }
  const fit = Math.max(
    MIN_ZOOM,
    Math.min((frame.width - 2 * pad) / box.width, (frame.height - 2 * pad) / box.height, zoom),
  );
  return {
    x: (frame.width - box.width * fit) / 2 - box.x * fit,
    y: (frame.height - box.height * fit) / 2 - box.y * fit,
    zoom: fit,
  };
}
