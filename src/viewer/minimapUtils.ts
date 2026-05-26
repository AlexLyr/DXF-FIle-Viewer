import { state } from "./state";
import { focusOnWorld } from "./coords";
import { dom } from "./dom";
import { getViewerCanvas, type ViewerWithInternals } from "./types";

const MINIMAP_PREVIEW_W = 360;
const MINIMAP_PREVIEW_H = 240;
const PREVIEW_DEBOUNCE_MS = 250;

function ensurePreviewCanvas(): HTMLCanvasElement {
  if (!state.minimapPreviewCanvas) {
    const canvas = document.createElement("canvas");
    canvas.width = MINIMAP_PREVIEW_W;
    canvas.height = MINIMAP_PREVIEW_H;
    state.minimapPreviewCanvas = canvas;
  }
  return state.minimapPreviewCanvas;
}

function captureMinimapPreview(): void {
  if (!state.viewer || !state.minimap) return;
  const canvas = getViewerCanvas(state.viewer);
  if (!canvas) return;
  state.viewer.Render();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  const image = new Image();
  image.onload = () => {
    if (!state.minimap) return;
    const target = ensurePreviewCanvas();
    const ctx = target.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, target.width, target.height);
    const sw = image.width;
    const sh = image.height;
    if (sw <= 0 || sh <= 0) return;
    const scale = Math.min(target.width / sw, target.height / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    const dx = (target.width - dw) / 2;
    const dy = (target.height - dh) / 2;
    ctx.drawImage(image, dx, dy, dw, dh);
    state.minimap.setPreview(target);
    state.minimapPreviewReady = true;
    state.minimapPreviewDirty = false;
  };
  image.onerror = () => {
    state.minimapPreviewDirty = true;
  };
  image.src = dataUrl;
}

export function captureMinimapPreviewNow(options?: { force?: boolean }): void {
  if (!state.minimap) return;
  const force = options?.force === true;
  if (!force && !state.minimap.isEnabled()) {
    state.minimapPreviewDirty = true;
    return;
  }
  if (state.minimapPreviewTimer) {
    window.clearTimeout(state.minimapPreviewTimer);
    state.minimapPreviewTimer = 0;
  }
  captureMinimapPreview();
}

export function scheduleMinimapPreviewRefresh(options?: { immediate?: boolean; force?: boolean }): void {
  if (!state.minimap) return;
  const force = options?.force === true;
  if (!force && !state.minimap.isEnabled()) {
    state.minimapPreviewDirty = true;
    return;
  }
  if (state.minimapPreviewTimer) {
    window.clearTimeout(state.minimapPreviewTimer);
    state.minimapPreviewTimer = 0;
  }
  const delay = options?.immediate ? 0 : PREVIEW_DEBOUNCE_MS;
  state.minimapPreviewTimer = window.setTimeout(() => {
    state.minimapPreviewTimer = 0;
    captureMinimapPreview();
  }, delay);
}

export function applyMinimapVisibility(): void {
  if (!state.minimap) return;
  const shouldEnable = state.minimapVisible && !!state.viewer;
  state.minimap.setEnabled(shouldEnable);
  dom.minimapToggle.classList.toggle("active", state.minimapVisible);
  dom.minimapToggle.setAttribute("aria-pressed", String(state.minimapVisible));
  if (shouldEnable) {
    if (!state.minimapPreviewReady || state.minimapPreviewDirty) {
      scheduleMinimapPreviewRefresh({ immediate: true });
    }
    updateMinimapFromViewer();
  }
}

export function updateMinimapFromViewer(): void {
  if (!state.viewer || !state.minimap) return;
  const bounds = state.viewer.GetBounds();
  const camera = (state.viewer as ViewerWithInternals).camera;
  if (!camera || !bounds) {
    state.minimap.update(null, null);
    return;
  }
  const origin = (state.viewer as ViewerWithInternals).GetOrigin?.() ?? { x: 0, y: 0 };
  const zoom = camera.zoom && Number.isFinite(camera.zoom) && camera.zoom > 0 ? camera.zoom : 1;
  const halfW = (camera.right - camera.left) / 2 / zoom;
  const halfH = (camera.top - camera.bottom) / 2 / zoom;
  state.minimap.update(
    { minX: bounds.minX, maxX: bounds.maxX, minY: bounds.minY, maxY: bounds.maxY },
    {
      left: camera.position.x + origin.x - halfW,
      right: camera.position.x + origin.x + halfW,
      top: camera.position.y + origin.y + halfH,
      bottom: camera.position.y + origin.y - halfH,
    },
  );
}

export function panFromMinimap(event: MouseEvent): void {
  if (!state.viewer || !state.minimap || !state.minimap.isEnabled()) return;
  const target = state.minimap.screenToWorld(event.clientX, event.clientY);
  if (!target) return;
  focusOnWorld(target.x, target.y);
}
