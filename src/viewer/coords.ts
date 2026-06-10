import { Vector3 } from "three";
import type { DrawingRenderer } from "./render/types";
import { getViewerCanvas, type ViewerWithInternals } from "./types";
import { state } from "./state";
import { dom } from "./dom";

function getOrigin(): { x: number; y: number } {
  if (!state.viewer) return { x: 0, y: 0 };
  const o = (state.viewer as ViewerWithInternals).GetOrigin?.();
  return o && typeof o.x === "number" && typeof o.y === "number" ? { x: o.x, y: o.y } : { x: 0, y: 0 };
}

function getEventCanvas(): HTMLCanvasElement | null {
  return state.viewer ? getViewerCanvas(state.viewer) : null;
}

function syncCamera(): void {
  if (!state.viewer) return;
  const cam = (state.viewer as ViewerWithInternals).camera as unknown as {
    updateProjectionMatrix?: () => void;
    updateMatrixWorld?: (force?: boolean) => void;
    matrixWorldInverse?: { copy: (m: unknown) => unknown; invert: () => unknown };
    matrixWorld?: unknown;
  } | undefined;
  if (!cam) return;
  cam.updateProjectionMatrix?.();
  cam.updateMatrixWorld?.(true);
  if (cam.matrixWorldInverse && cam.matrixWorld) {
    cam.matrixWorldInverse.copy(cam.matrixWorld);
    cam.matrixWorldInverse.invert();
  }
}

/**
 * All coordinates in this module's public API are in DXF model space
 * (matching parsedDxf entity coords and viewer.GetBounds()). Scene-local
 * conversion (subtracting viewer.GetOrigin()) is an internal implementation
 * detail of this file. Callers MUST NOT touch origin.
 */
export function getWorldFromPointer(event: MouseEvent): { x: number; y: number } | null {
  if (!state.viewer) return null;
  const camera = (state.viewer as ViewerWithInternals).camera;
  if (!camera) return null;

  syncCamera();

  const canvas = getEventCanvas();
  const rect = (canvas ?? dom.canvasHost).getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  const ny = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  const v = new Vector3(nx, ny, 0).unproject(camera as never);
  const origin = getOrigin();
  return { x: v.x + origin.x, y: v.y + origin.y };
}

export function worldToScreen(dxfX: number, dxfY: number): { x: number; y: number } | null {
  if (!state.viewer) return null;
  const camera = (state.viewer as ViewerWithInternals).camera;
  if (!camera) return null;

  syncCamera();

  const canvas = getEventCanvas();
  if (!canvas) return null;

  const canvasRect = canvas.getBoundingClientRect();
  const hostRect = dom.canvasHost.getBoundingClientRect();
  if (canvasRect.width <= 0 || canvasRect.height <= 0) return null;

  const origin = getOrigin();
  const v = new Vector3(dxfX - origin.x, dxfY - origin.y, 0);
  v.project(camera as never);

  const screenX = ((v.x + 1) / 2) * canvasRect.width;
  const screenY = ((1 - v.y) / 2) * canvasRect.height;

  return {
    x: screenX + (canvasRect.left - hostRect.left),
    y: screenY + (canvasRect.top - hostRect.top),
  };
}

export function getWorldPerPixel(): number | null {
  if (!state.viewer) return null;
  const canvas = getEventCanvas();
  if (!canvas) return null;
  const camera = (state.viewer as ViewerWithInternals).camera;
  if (!camera) return null;
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0) return null;
  const rawZoom = (camera as { zoom?: number }).zoom;
  const zoom = rawZoom && Number.isFinite(rawZoom) && rawZoom > 0 ? rawZoom : 1;
  return (camera.right - camera.left) / zoom / rect.width;
}

export function setViewFromDxf(centerX: number, centerY: number, width: number): void {
  if (!state.viewer || !Number.isFinite(width) || width <= 0) return;
  const origin = getOrigin();
  state.viewer.SetView(new Vector3(centerX - origin.x, centerY - origin.y, 0) as never, width);
  state.viewer.Render();
}

let focusRaf = 0;

export function focusOnWorld(dxfX: number, dxfY: number): void {
  if (!state.viewer) return;
  const camera = (state.viewer as ViewerWithInternals).camera;
  if (!camera) return;
  if (focusRaf) cancelAnimationFrame(focusRaf);

  const origin = getOrigin();
  const targetX = dxfX - origin.x;
  const targetY = dxfY - origin.y;
  const rawZoom = (camera as { zoom?: number }).zoom;
  const zoom = rawZoom && Number.isFinite(rawZoom) && rawZoom > 0 ? rawZoom : 1;
  const width = (camera.right - camera.left) / zoom;
  const fromX = camera.position.x;
  const fromY = camera.position.y;
  const steps = 12;
  let i = 0;

  const tick = () => {
    i += 1;
    const t = i / steps;
    const cx = fromX + (targetX - fromX) * t;
    const cy = fromY + (targetY - fromY) * t;
    state.viewer!.SetView(new Vector3(cx, cy, 0) as never, width);
    state.viewer!.Render();
    if (i < steps) focusRaf = requestAnimationFrame(tick);
    else focusRaf = 0;
  };
  focusRaf = requestAnimationFrame(tick);
}

function fitToBoundsRect(
  instance: DrawingRenderer,
  bounds: { minX: number; maxX: number; minY: number; maxY: number } | null,
): void {
  if (!bounds) return;
  const w = dom.canvasHost.clientWidth;
  const h = dom.canvasHost.clientHeight;
  if (w <= 0 || h <= 0) return;
  const dx = bounds.maxX - bounds.minX;
  const dy = bounds.maxY - bounds.minY;
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || dx <= 0 || dy <= 0) {
    return;
  }
  const padding = 0.05;
  const camera = (instance as ViewerWithInternals).camera;
  if (camera) {
    camera.zoom = 1;
    camera.updateProjectionMatrix?.();
  }
  const origin = getOrigin();
  instance.FitView(
    bounds.minX - origin.x,
    bounds.maxX - origin.x,
    bounds.minY - origin.y,
    bounds.maxY - origin.y,
    padding,
  );
}

// Default fit: frames the main content (strays far from the drawing are
// ignored by the renderer's smart content bounds).
export function fitToDrawing(instance: DrawingRenderer): void {
  fitToBoundsRect(instance, instance.GetBounds());
}

// "Show everything" fit: frames the full extent, including distant objects.
export function fitToDrawingFull(instance: DrawingRenderer): void {
  fitToBoundsRect(instance, instance.GetFullBounds());
}

export function attachCoordReadout(instance: DrawingRenderer): void {
  detachCoordReadout();
  const canvas = getViewerCanvas(instance);
  if (!canvas) return;
  const camera = (instance as ViewerWithInternals).camera;
  if (!camera) return;

  const v = new Vector3();

  const move = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    v.set(ndcX, ndcY, 0);
    v.unproject(camera as never);
    const origin = getOrigin();
    dom.coordX.textContent = `X: ${(v.x + origin.x).toFixed(2)}`;
    dom.coordY.textContent = `Y: ${(v.y + origin.y).toFixed(2)}`;
    if (state.coordsVisible) {
      dom.coordReadout.classList.remove("hidden");
    }
  };

  const leave = () => {
    dom.coordReadout.classList.add("hidden");
  };

  canvas.addEventListener("mousemove", move);
  canvas.addEventListener("mouseleave", leave);
  state.coordCanvas = canvas;
  state.coordHandlers = { move, leave };
}

export function applyCoordsVisibility(): void {
  dom.coordsToggle.classList.toggle("active", state.coordsVisible);
  dom.coordsToggle.setAttribute("aria-pressed", String(state.coordsVisible));
  dom.coordReadout.classList.toggle("hidden", !state.coordsVisible);
}

export function detachCoordReadout(): void {
  if (state.coordCanvas && state.coordHandlers) {
    state.coordCanvas.removeEventListener("mousemove", state.coordHandlers.move);
    state.coordCanvas.removeEventListener("mouseleave", state.coordHandlers.leave);
  }
  state.coordCanvas = null;
  state.coordHandlers = null;
  dom.coordReadout.classList.add("hidden");
}
